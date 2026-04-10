// src/core/intent-executor.js
const emailHandlers = require('./handlers/email-handler');
const systemHandlers = require('./handlers/system-handler');
const sessionHandlers = require('./handlers/session-handler');
const modelHandlers = require('./handlers/model-handler');
const fileHandlers = require('./handlers/file-handler');
const profileHandlers = require('./handlers/profile-handler');
const softwareHandlers = require('./handlers/software-handler');
const { loadToolsIndex, getToolsForOS } = require('./security-tools-index');
const { loadKBWithContext, formatKBContext, getOS } = require('./kb-loader');

// Merge all handlers into a single command map
const commandHandlers = {
  ...emailHandlers,
  ...systemHandlers,
  ...sessionHandlers,
  ...modelHandlers,
  ...fileHandlers,
  ...profileHandlers,
  ...softwareHandlers
};

// Parse JSON from LLM response
function parseCommandFromResponse(response) {
  // Look for JSON block in the response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                    response.match(/\{[\s\S]*"action"[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    } catch (e) {
      // Try to find raw JSON
      const rawMatch = response.match(/\{[\s\S]*\}/);
      if (rawMatch) {
        try {
          return JSON.parse(rawMatch[0]);
        } catch (e2) {
          return null;
        }
      }
    }
  }
  return null;
}

// Check if response contains a command
function hasCommand(response) {
  return response.includes('"action"') && response.includes('"parameters"');
}

// Parse security command JSON from LLM response
function parseSecurityCommandFromResponse(response) {
  // First check if this is a final conclusion - if so, don't parse as command
  if (isSecurityConclusion(response)) {
    return null;
  }

  // Look for command JSON in various formats
  const patterns = [
    /```json\s*(\{[\s\S]*?\})\s*```/,
    /```\s*(\{[\s\S]*?\})\s*```/,
    /\{[\s\S]*?"tool"[\s\S]*?"command"[\s\S]*?\}/,
    /\{[\s\S]*?"command"[\s\S]*?"reason"[\s\S]*?\}/
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match) {
      try {
        const jsonStr = match[1] || match[0];
        const parsed = JSON.parse(jsonStr);
        // Validate required fields - must have tool+command
        if (parsed.tool && parsed.command) {
          return parsed;
        }
        // Also accept tool/command in other formats
        if (parsed.command && parsed.reason) {
          return { tool: 'direct', command: parsed.command, reason: parsed.reason };
        }
      } catch (e) {
        // Try extracting from nested match
        try {
          const nested = response.match(/\{[\s\S]*?\}/);
          if (nested) {
            const parsed = JSON.parse(nested[0]);
            if (parsed.tool && parsed.command) {
              return parsed;
            }
            if (parsed.command && parsed.reason) {
              return { tool: 'direct', command: parsed.command, reason: parsed.reason };
            }
          }
        } catch (e2) {}
      }
    }
  }
  return null;
}

// Check if response is a final security conclusion
function isSecurityConclusion(response) {
  // Must contain security_score field
  if (!response.includes('"security_score"') && !response.includes('security_score')) {
    return false;
  }
  // Must also have findings or recommended_fixes
  const hasFindings = response.includes('"findings"') || response.includes('findings');
  const hasFixes = response.includes('"recommended_fixes"') || response.includes('recommended_fixes') || response.includes('recommended fixes');
  if (!hasFindings && !hasFixes) {
    return false;
  }
  // Try to parse it as valid JSON
  try {
    // Extract JSON object from response
    const match = response.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.security_score && (parsed.findings || parsed.recommended_fixes)) {
        return true;
      }
    }
  } catch (e) {}
  return false;
}

// Execute a command
async function executeCommand(command, context) {
  const handler = commandHandlers[command.action];
  if (!handler) {
    return { success: false, message: `Unknown action: ${command.action}` };
  }

  // Backwards compat for payload or parameters
  return await handler(command.payload || command.parameters || {}, context);
}

// Build security auditor prompt context
function buildSecurityAuditPrompt(userInput, toolsIndex, os, history = []) {
  const toolsCtx = buildToolsContextDetailed(toolsIndex, os);
  let prompt = `You are Heeba running a SECURITY AUDIT. You are in a RECURSIVE AGENT LOOP until you output a final conclusion.\n\n`;
  prompt += `CRITICAL RULES:\n`;
  prompt += `1. You MUST output a JSON command object to run the next security check\n`;
  prompt += `2. NEVER stop after just one command - you must run multiple checks\n`;
  prompt += `3. Keep iterating through tools until you have enough evidence for a conclusion\n`;
  prompt += `4. Output ONLY the JSON object - no explanatory text outside JSON\n`;
  prompt += `5. When you have enough evidence, output FINAL JSON with security_score\n\n`;
  prompt += `USER REQUEST: ${userInput}\n\n`;
  prompt += `AVAILABLE SECURITY TOOLS:\n${toolsCtx}\n\n`;

  if (history.length > 0) {
    prompt += `PREVIOUS COMMAND HISTORY:\n`;
    for (const h of history) {
      prompt += `Tool: ${h.tool}\nCommand: ${h.command}\nOutput:\n${h.output.substring(0, 1000)}\n\n`;
    }
    prompt += `Analyze the output above and decide your next action.\n`;
    prompt += `If you have checked at least 3-4 different aspects (network, processes, firewall, logs, etc), you may output FINAL JSON.\n`;
    prompt += `Otherwise, output NEXT COMMAND JSON to continue the audit:\n`;
    prompt += `{"tool": "ToolName", "command": "actual safe command", "reason": "why this command"}\n\n`;
  } else {
    prompt += `Start with a broad scan. Check multiple areas: network connections, running processes, firewall rules, system logs.\n`;
    prompt += `Output your first command as JSON:\n`;
    prompt += `{"tool": "ToolName", "command": "safe command to execute", "reason": "why"}`;
  }

  return prompt;
}

// Build tools context with KB details for prompt
function buildToolsContextDetailed(toolsIndex, os) {
  let ctx = '';
  const osTools = toolsIndex[os] || {};
  const categories = Object.keys(osTools);

  for (const cat of categories) {
    ctx += `\n=== ${cat} ===\n`;
    for (const t of osTools[cat]) {
      ctx += `Tool: ${t.tool}\n`;
      ctx += `  Description: ${t.description || 'N/A'}\n`;
      // Load actual KB for this tool
      const kb = loadKBWithContext(t.tool, os);
      if (kb && kb.safe_flags && kb.safe_flags.length > 0) {
        ctx += `  Safe flags: ${kb.safe_flags.map(f => f.flag).join(', ')}\n`;
        ctx += `  Example: ${kb.safe_flags[0].example_command}\n`;
      }
      if (kb && kb.powerful_combinations && kb.powerful_combinations.length > 0) {
        ctx += `  Powerful combo: ${kb.powerful_combinations[0].command}\n`;
      }
    }
  }
  return ctx;
}

// Get tool knowledge base for context
function getToolKBContext(toolName, os) {
  const kb = loadKBWithContext(toolName, os);
  return formatKBContext(kb) || '';
}

// Main entry: process LLM response and check for commands
async function processLLMResponse(response, context = {}) {
  const command = parseCommandFromResponse(response);

  if (command && command.action) {
    const result = await executeCommand(command, context);
    return {
      hasCommand: true,
      command,
      result
    };
  }

  return { hasCommand: false, command: null, result: null };
}

// Security audit loop - recursive command execution until conclusion
// options: { onStep: null, emailTo: null, isTUI: false }
async function runSecurityAuditLoop(userInput, queryFn, maxIterations = 15, options = {}) {
  const { onStep, emailTo, isTUI } = options;
  const os = getOS();
  const toolsIndex = loadToolsIndex() || getToolsForOS(os);
  const history = [];
  let iteration = 0;
  let conclusion = null;

  // Emit setup info at start
  printAuditStep({ phase: 'setup', iteration: 0, os, userInput, maxIterations, emailTo }, isTUI);

  // Emit loading tools_index
  printAuditStep({ phase: 'loading_tools_index', iteration: 0, os }, isTUI);

  // Build initial prompt with tools context
  let prompt = buildSecurityAuditPrompt(userInput, toolsIndex, os, []);

  while (iteration < maxIterations && !conclusion) {
    iteration++;

    // Emit step begin
    printAuditStep({ phase: 'begin', iteration, os }, isTUI);

    // Get LLM response with full context
    const llmResponse = await queryFn(prompt, 'auto');

    // Emit LLM reasoning/analysis
    printAuditStep({
      phase: 'llm_reasoning',
      iteration,
      llmReasoning: llmResponse.substring(0, 600),
      os
    }, isTUI);

    // Check for final conclusion first
    if (isSecurityConclusion(llmResponse)) {
      try {
        // Extract the conclusion JSON
        const match = llmResponse.match(/\{[\s\S]*?\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.security_score) {
            conclusion = parsed;
            printAuditStep({ phase: 'conclusion', iteration, conclusion, os }, isTUI);
            break;
          }
        }
      } catch (e) {}
    }

    // Parse security command from response
    const secCmd = parseSecurityCommandFromResponse(llmResponse);

    if (secCmd && secCmd.command) {
      // Determine category from tool name
      const category = inferCategoryFromTool(secCmd.tool, toolsIndex, os);

      // Emit category selected
      printAuditStep({
        phase: 'category_selected',
        iteration,
        category,
        tool: secCmd.tool,
        os
      }, isTUI);

      // Emit KB loading
      if (secCmd.tool !== 'direct') {
        const kb = loadKBWithContext(secCmd.tool, os);
        printAuditStep({
          phase: 'kb_loading',
          iteration,
          toolName: secCmd.tool,
          kbDescription: kb?.description || '',
          os
        }, isTUI);
      }

      // Emit tool selected with reason
      printAuditStep({
        phase: 'tool_selected',
        iteration,
        toolName: secCmd.tool || 'direct',
        reason: secCmd.reason || '',
        category,
        os
      }, isTUI);

      // Emit command planning
      printAuditStep({
        phase: 'command_planning',
        iteration,
        tool: secCmd.tool,
        reason: secCmd.reason || '',
        command: secCmd.command,
        os
      }, isTUI);

      // Emit executing
      printAuditStep({ phase: 'executing', iteration, os }, isTUI);

      // Get tool KB context for the next prompt
      const toolKB = secCmd.tool !== 'direct' ? getToolKBContext(secCmd.tool, os) : '';

      // Execute the command via system-handler (pass stepNumber for visible output)
      const execResult = await commandHandlers.exec_security_command({
        command: secCmd.command,
        reason: secCmd.reason || '',
        stepNumber: iteration
      });

      // Record in history
      history.push({
        tool: secCmd.tool,
        reason: secCmd.reason || '',
        command: secCmd.command,
        output: execResult.raw_output || execResult.message,
        success: execResult.success
      });

      // If command failed, attempt KB self-correction with a simpler flag
      if (!execResult.success) {
        const kbCorrection = getKBSimplerCommand(secCmd.tool, secCmd.command, execResult.raw_output || execResult.message, os);
        if (kbCorrection) {
          // Emit KB correction analysis
          printAuditStep({
            phase: 'kb_correction',
            iteration,
            toolName: secCmd.tool,
            failureReason: extractFailureReason(execResult.raw_output || execResult.message),
            suggestion: kbCorrection.suggestion,
            correctedCommand: kbCorrection.command,
            os
          }, isTUI);

          // Execute the corrected command
          const correctedResult = await commandHandlers.exec_security_command({
            command: kbCorrection.command,
            reason: `KB self-correction: ${kbCorrection.suggestion}`,
            stepNumber: iteration
          });

          // Update history entry with corrected command result
          history[history.length - 1] = {
            tool: secCmd.tool,
            reason: secCmd.reason || '',
            command: kbCorrection.command,
            output: correctedResult.raw_output || correctedResult.message,
            success: correctedResult.success
          };
          execResult = correctedResult;
        }
      }

      // Determine next category for display
      const nextCategory = history.length >= 3 ? 'Conclusion (sufficient data)' : inferNextCategory(history, toolsIndex, os);

      // Emit command done with analysis
      printAuditStep({
        phase: 'command_done',
        iteration,
        tool: secCmd.tool,
        reason: secCmd.reason || '',
        command: secCmd.command,
        output: (execResult.raw_output || execResult.message).substring(0, 800),
        success: execResult.success,
        analysis: analyzeSecurityOutput(execResult.raw_output || execResult.message, secCmd.tool),
        os
      }, isTUI);

      // Emit next tool decision
      printAuditStep({
        phase: 'next_tool_decision',
        iteration,
        nextCategory,
        maxIterations,
        os
      }, isTUI);

      // Build next prompt with updated history and tool KB
      prompt = buildSecurityAuditPrompt(userInput, toolsIndex, os, history);
    } else {
      // No valid command was found - check if this is actually a conclusion
      if (isSecurityConclusion(llmResponse)) {
        // Try to extract the conclusion
        const match = llmResponse.match(/\{[\s\S]*?\}/);
        if (match) {
          try {
            const parsed = JSON.parse(match[0]);
            if (parsed.security_score) {
              conclusion = parsed;
              printAuditStep({ phase: 'conclusion', iteration, conclusion, os }, isTUI);
              break;
            }
          } catch (e) {}
        }
      }

      // Also check if response contains action:run_security_audit - this is wrong for the loop
      if (llmResponse.includes('"action"') && llmResponse.includes('run_security_audit')) {
        // Model is confused and outputting the intent action instead of a command
        prompt = `INVALID OUTPUT. You are in a SECURITY AUDIT LOOP. Do not output {\"action\":\"run_security_audit\"}.\n\n`;
        prompt += `You MUST output ONLY a JSON command to run the next security check:\n`;
        prompt += `{\"tool\": \"Get-MpThreat\", \"command\": \"Get-MpThreat\", \"reason\": \"check malware\"}\n\n`;
        prompt += `Do NOT include any text outside the JSON object.`;
      } else {
        // Not a valid response and not a conclusion - retry with error prompt
        printAuditStep({
          phase: 'invalid_response',
          iteration,
          llmAnalysis: llmResponse.substring(0, 300),
          os
        }, isTUI);
        prompt = `YOU MUST OUTPUT A JSON COMMAND. Do NOT respond with prose.\n\n`;
        prompt += `Previous response was not valid JSON:\n${llmResponse.substring(0, 500)}\n\n`;
        prompt += `You MUST output EITHER:\n`;
        prompt += `1. A command: {"tool": "ToolName", "command": "actual command", "reason": "why"}\n`;
        prompt += `2. OR a final conclusion: {"security_score": "Safe", "findings": [], "recommended_fixes": []}\n\n`;
        prompt += `Do NOT include any text outside the JSON object. Start with {`;
      }
    }
  }

  if (!conclusion && iteration >= maxIterations) {
    conclusion = {
      security_score: 'Inconclusive',
      findings: [`Audit stopped after ${maxIterations} iterations without reaching a conclusion`],
      evidence: history.slice(0, 5).map(h => `${h.tool}: ${h.command} -> ${h.output.substring(0, 150)}`),
      recommended_fixes: ['Try running a more targeted security check']
    };
  }

  const auditResult = { conclusion, iterations: iteration, history, os };

  // Dispatch email if requested
  if (emailTo) {
    printAuditStep({ phase: 'email_dispatch', iteration, emailTo, os, conclusion }, isTUI);
    const emailResult = await dispatchAuditReportEmail(auditResult, emailTo, os);
    if (emailResult && emailResult.success) {
      printAuditStep({ phase: 'email_sent', iteration, emailTo, os }, isTUI);
    } else {
      printAuditStep({ phase: 'email_failed', iteration, emailTo, error: emailResult?.message, os }, isTUI);
    }
  }

  return auditResult;
}

// Extract failure reason from error output
function extractFailureReason(output) {
  if (!output) return 'Unknown error';
  // Common PowerShell error patterns
  const lines = output.split('\n').filter(l => l.trim());
  // Usually the first non-empty line after the command is the error
  if (lines.length > 0) {
    // Strip ANSI codes
    const clean = lines[0].replace(/\x1b\[[0-9;]*m/g, '').trim();
    if (clean.length > 5) return clean.substring(0, 120);
  }
  return 'Command failed - possibly requires elevation or unsupported flag';
}

// Attempt KB self-correction when a command fails
// Loads the tool's KB, finds the first automation_safe flag, returns a corrected command
function getKBSimplerCommand(toolName, originalCommand, errorOutput, os) {
  try {
    const kb = loadKBWithContext(toolName, os);
    if (!kb || !kb.safe_flags || kb.safe_flags.length === 0) {
      return null;
    }

    // Find the first safe flag that has a fallback example
    const safeFlag = kb.safe_flags.find(f => f.example_command && f.safe_followup);
    if (!safeFlag) {
      // Use first safe flag with example
      const fallback = kb.safe_flags.find(f => f.example_command);
      if (!fallback) return null;
      return {
        command: fallback.example_command,
        suggestion: `Try using safe flags: ${fallback.flag}`
      };
    }

    return {
      command: safeFlag.example_command,
      suggestion: safeFlag.safe_followup || safeFlag.flag
    };
  } catch (e) {
    return null;
  }
}

// Infer category from tool name
function inferCategoryFromTool(toolName, toolsIndex, os) {
  const osTools = toolsIndex[os] || {};
  const categories = Object.keys(osTools);
  for (const cat of categories) {
    const tools = osTools[cat] || [];
    const found = tools.find(t => t.tool === toolName);
    if (found) return cat;
  }
  // Fallback guesses based on tool name patterns
  const t = (toolName || '').toLowerCase();
  if (t.includes('firewall') || t.includes('netsh')) return 'Firewall';
  if (t.includes('tcp') || t.includes('udp') || t.includes('connection') || t.includes('adapter')) return 'Network Inspection';
  if (t.includes('process') || t.includes('task') || t.includes('service')) return 'Process & Services';
  if (t.includes('event') || t.includes('log')) return 'Event Logs';
  if (t.includes('user') || t.includes('account')) return 'User Audit';
  if (t.includes('defender') || t.includes('threat') || t.includes('antivirus')) return 'Malware & Threats';
  if (t.includes('file') || t.includes('hash') || t.includes('sfc')) return 'File Integrity';
  if (t.includes('registry') || t.includes('reg')) return 'Registry';
  return 'General Security';
}

// Infer next category for display
function inferNextCategory(history, toolsIndex, os) {
  const osTools = toolsIndex[os] || {};
  const existingCategories = history.map(h => inferCategoryFromTool(h.tool, toolsIndex, os));
  const uniqueCategories = [...new Set(existingCategories)];
  const allCategories = Object.keys(osTools);

  // Find a category not yet explored
  for (const cat of allCategories) {
    if (!uniqueCategories.includes(cat)) return cat;
  }
  return 'Conclusion';
}

// Simple security output analysis for display
function analyzeSecurityOutput(output, tool) {
  if (!output) return 'No output to analyze.';
  const t = (tool || '').toLowerCase();
  const lines = (output || '').split('\n').length;

  if (t.includes('firewall')) {
    if (output.includes('Block') || output.includes('Deny')) return 'Firewall rules found with block policies.';
    if (output.includes('Allow')) return 'Firewall rules found with allow policies - review for risky ports.';
    return 'Firewall configuration retrieved.';
  }
  if (t.includes('tcp') || t.includes('connection')) {
    if (output.includes('ESTABLISHED') && output.includes('TIME_WAIT')) return 'Active TCP connections detected. Check for suspicious remote hosts.';
    return 'Network connections retrieved.';
  }
  if (t.includes('process')) {
    if (output.includes('cpu') || output.includes('memory')) return 'Process resource usage retrieved.';
    return 'Running processes listed.';
  }
  if (t.includes('event') || t.includes('log')) {
    if (output.includes('Failure') || output.includes('Error')) return 'Security events found in logs - investigate failures.';
    if (output.includes('Success')) return 'Security events logged successfully.';
    return 'Event logs retrieved.';
  }
  if (t.includes('defender') || t.includes('threat')) {
    if (output.includes('Threat')) return 'Windows Defender threats detected.';
    return 'Windows Defender status retrieved.';
  }
  if (t.includes('user')) {
    if (output.includes('Disabled') || output.includes('PasswordExpired')) return 'User account status issues detected.';
    return 'User accounts enumerated.';
  }
  return `Received ${lines} lines of output from ${tool}.`;
}

// Check if intent matches security testing
function isSecurityIntentTriggered(userInput, intentRules) {
  if (!intentRules || !intentRules.system_security_testing) return false;

  const patterns = intentRules.system_security_testing.patterns || [];
  const input = userInput.toLowerCase();

  // Method 1: Exact substring match (original behavior)
  for (const pattern of patterns) {
    if (input.includes(pattern.toLowerCase())) return true;
  }

  // Method 2: Keyword matching for security-related queries
  // Check if input contains key security-related words
  const securityKeywords = ['malware', 'backdoor', 'c2', 'command-and-control', 'firewall', 'vulnerability', 'threat', 'virus', 'trojan', 'exploit', 'intrusion', 'penetration', 'rootkit', 'keylogger', 'ransomware'];
  const auditKeywords = ['audit', 'scan', 'check', 'analyze', 'test', 'detect', 'find', 'inspect', 'review', 'investigate'];

  const hasSecurityKeyword = securityKeywords.some(kw => input.includes(kw));
  const hasAuditKeyword = auditKeywords.some(kw => input.includes(kw));

  // If both security and audit keywords are present, it's likely a security audit request
  if (hasSecurityKeyword && hasAuditKeyword) return true;

  return false;
}

// Print audit step output - branches TUI vs stateless
function printAuditStep(step, isTUI) {
  const Y = '\x1b[33m';
  const C = '\x1b[36m';
  const G = '\x1b[32m';
  const R = '\x1b[31m';
  const M = '\x1b[35m';
  const B = '\x1b[34m';
  const D = '\x1b[90m';
  const W = '\x1b[37m';
  const RST = '\x1b[0m';

  const out = (line) => {
    if (isTUI) {
      process.stdout.write(line + '\n');
    } else {
      console.log(line);
    }
  };

  const sep = '--------------------------------------------------------------';

  switch (step.phase) {
    case 'setup':
      out(`\n  HEEBA RECURSIVE SECURITY TEST RUNNER`);
      out(`  Intent detected : system_security_testing`);
      out(`  Query           : ${String(step.userInput || '').substring(0, 60)}`);
      out(`  OS              : ${step.os}`);
      out(`  Max Recursion   : ${step.maxIterations} steps`);
      if (step.emailTo) {
        out(`  Report will be sent to: ${step.emailTo}`);
      }
      out(`  ${D}${sep}${RST}`);
      break;

    case 'begin':
      out(`\n  === [Step ${step.iteration}] =====================================================`);
      out(`  Intent detected : system_security_testing`);
      out(`  Category        : (selecting...)`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'loading_tools_index':
      out(`  Loading tools_index.json...`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'category_selected':
      out(`  [Step ${step.iteration}] Intent detected : system_security_testing`);
      out(`  [Step ${step.iteration}] Selected category : ${step.category}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'llm_reasoning':
      out(`  ${M}--- LLM Reasoning ---${RST}`);
      const reasonLines = (step.llmReasoning || '').split('\n').filter(l => l.trim()).slice(0, 8);
      reasonLines.forEach(l => { out(`  ${D}${l.substring(0, 78)}${RST}`); });
      out(`  ${D}${sep}${RST}`);
      break;

    case 'llm_response':
      out(`  ${M}--- LLM Analysis ---${RST}`);
      const analysisLines = (step.llmAnalysis || '').split('\n').slice(0, 6);
      analysisLines.forEach(l => { if (l.trim()) out(`  ${D}${l.substring(0, 78)}${RST}`); });
      out(`  ${D}${sep}${RST}`);
      break;

    case 'kb_loading':
      out(`\n  ${B}Loading KB file: ${C}${step.toolName}.json${RST}`);
      if (step.kbDescription) {
        out(`  ${D}Tool description: ${step.kbDescription.substring(0, 70)}${RST}`);
      }
      out(`  ${D}${sep}${RST}`);
      break;

    case 'tool_selected':
      out(`  ${Y}[Step ${step.iteration}] Tool selected: ${C}${step.toolName}${RST}`);
      out(`  ${Y}[Step ${step.iteration}] Reason for selecting: ${D}${step.reason}${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'command_planning':
      out(`  ${M}--- Command Planned ---${RST}`);
      out(`  ${C}Tool    :${RST} ${step.tool || 'direct'}`);
      out(`  ${D}Reason  :${RST} ${step.reason || '(no reason provided)'}`);
      out(`  ${C}Command :${RST} ${step.command}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'executing':
      out(`  ${Y}(exec) Executing in agent terminal...${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'command_done':
      out(`  ${M}--- Command Output (stdout) ---${RST}`);
      const outputLines = (step.output || '').split('\n').slice(0, 15);
      outputLines.forEach(l => { if (l.trim()) out(`  ${D}${l.substring(0, 78)}${RST}`); });
      if ((step.output || '').length > 800) out(`  ${D}...(output truncated at 800 chars)${RST}`);
      out(`  ${D}${sep}${RST}`);
      out(`  ${M}--- Security Analysis of output ---${RST}`);
      if (step.analysis) {
        const analysisOut = (step.analysis || '').split('\n').filter(l => l.trim()).slice(0, 5);
        analysisOut.forEach(l => { out(`  ${D}${l.substring(0, 78)}${RST}`); });
      }
      out(`  ${D}${sep}${RST}`);
      out(`  ${step.success ? G : R}${step.success ? 'OK' : 'FAIL'} Result: ${step.success ? 'Command succeeded' : 'Command failed'}${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'next_tool_decision':
      out(`  ${M}--- Decision for next tool ---${RST}`);
      out(`  ${Y}[Step ${step.iteration}] Next Category: ${C}${step.nextCategory || 'Conclusion/Stop'}${RST}`);
      out(`  ${Y}[Step ${step.iteration}] Recursive step counter: ${W}Step ${step.iteration} of ${step.maxIterations}${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'conclusion':
      out(`\n${M}╔${'═'.repeat(66)}╗${RST}`);
      out(`${M}║${RST}           ${M}FINAL SECURITY CONCLUSION${RST}                          ${M}║${RST}`);
      out(`${M}╠${'═'.repeat(66)}╣${RST}`);
      out(`${M}║${RST}  ${Y}Steps   :${RST} ${step.iteration}                                               ${M}║${RST}`);
      if (step.conclusion) {
        const scoreColor = step.conclusion.security_score === 'Safe' ? G :
                           step.conclusion.security_score === 'At Risk' ? R : Y;
        out(`  Score    : ${scoreColor}${step.conclusion.security_score || 'Inconclusive'}${RST}`);
        if (step.conclusion.findings && step.conclusion.findings.length > 0) {
          out(`  Findings :`);
          step.conclusion.findings.slice(0, 8).forEach((f, i) => {
            const findingLine = `  ${i + 1}. ${f}`.substring(0, 64);
            out(`${M}║${RST}  ${findingLine}${' '.repeat(Math.max(0, 64 - findingLine.length))}${M}║${RST}`);
          });
        }
        if (step.conclusion.recommended_fixes && step.conclusion.recommended_fixes.length > 0) {
          out(`  Recommended Fixes :`);
          step.conclusion.recommended_fixes.slice(0, 5).forEach((f, i) => {
            const fixLine = `  ${i + 1}. ${f}`.substring(0, 64);
            out(`${M}║${RST}  ${fixLine}${' '.repeat(Math.max(0, 64 - fixLine.length))}${M}║${RST}`);
          });
        }
      }
      out(`  ${D}${sep}${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'invalid_response':
      out(`  ${R}--- Invalid LLM Response ---${RST}`);
      out(`  ${R}Model did not output a valid JSON command or conclusion. Retrying...${RST}`);
      out(`  ${D}Last response preview: ${(step.llmAnalysis || '').substring(0, 200)}${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'email_dispatch':
      out(`\n${M}━━━ Email Dispatch ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}`);
      out(`  ${Y}To      :${RST} ${step.emailTo}`);
      out(`  ${Y}Subject :${RST} [Heeba Security Audit] ${step.os} -- ${step.conclusion?.security_score || 'Report'}`);
      out(`  ${D}Sending report...${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'email_sent':
      out(`  ${G}OK Report emailed successfully to ${step.emailTo}${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    case 'email_failed':
      out(`  ${R}FAIL Email dispatch failed : ${step.error || 'unknown error'}${RST}`);
      out(`  ${D}${sep}${RST}`);
      break;

    default:
      break;
  }
}

// Format security audit report -- ANSI-colored ASCII boxed
function formatSecurityAuditReport(auditResult) {
  const { conclusion, iterations, history, os } = auditResult;
  const border = '━'.repeat(60);
  const B = '\x1b[35m';
  const Y = '\x1b[33m';
  const C = '\x1b[36m';
  const G = '\x1b[32m';
  const R = '\x1b[31m';
  const D = '\x1b[90m';
  const RST = '\x1b[0m';

  let r = '';
  r += `\n${B}╔${border}╗${RST}\n`;
  r += `${B}║${RST}           ${B}SECURITY AUDIT REPORT -- HEEBA${RST}                 ${B}║${RST}\n`;
  r += `${B}╠${border}╣${RST}\n`;
  r += `${B}║${RST}  ${Y}Iterations:${RST} ${iterations}   ${Y}OS:${RST} ${os}                       ${B}║${RST}\n`;
  r += `${B}║${RST}  ${Y}Score:${RST}    ${conclusion?.security_score || 'Inconclusive'}                            ${B}║${RST}\n`;
  r += `${B}╠${border}╣${RST}\n`;

  if (history && history.length > 0) {
    r += `${B}║${RST}  ${Y}COMMAND EXECUTION LOG${RST}                               ${B}║${RST}\n`;
    history.forEach((h, i) => {
      const status = h.success ? `${G}OK${RST}` : `${R}FAIL${RST}`;
      r += `${B}║${RST}  ${C}[Step ${i + 1}]${RST} ${status} ${C}${h.tool || 'direct'}${RST}               ${B}║${RST}\n`;
      r += `${B}║${RST}  ${D}Command: ${(h.command || '').substring(0, 45)}${RST}          ${B}║${RST}\n`;
    });
    r += `${B}╠${border}╣${RST}\n`;
  }

  if (conclusion?.findings && conclusion.findings.length > 0) {
    r += `${B}║${RST}  ${Y}FINDINGS${RST}                                         ${B}║${RST}\n`;
    conclusion.findings.slice(0, 8).forEach((f, i) => {
      const line = `  ${i + 1}. ${f}`.substring(0, 58);
      r += `${B}║${RST}  ${line}${' '.repeat(Math.max(0, 58 - line.length))}${B}║${RST}\n`;
    });
    r += `${B}╠${border}╣${RST}\n`;
  }

  if (conclusion?.recommended_fixes && conclusion.recommended_fixes.length > 0) {
    r += `${B}║${RST}  ${Y}RECOMMENDED FIXES${RST}                              ${B}║${RST}\n`;
    conclusion.recommended_fixes.slice(0, 6).forEach((f, i) => {
      const line = `  ${i + 1}. ${f}`.substring(0, 58);
      r += `${B}║${RST}  ${line}${' '.repeat(Math.max(0, 58 - line.length))}${B}║${RST}\n`;
    });
    r += `${B}╠${border}╣${RST}\n`;
  }

  r += `${B}║${RST}           ${B}END OF REPORT${RST}                               ${B}║${RST}\n`;
  r += `${B}╚${border}╝${RST}\n\n`;

  return r;
}

// Format plain text report (no ANSI -- for email body)
function formatSecurityAuditReportPlain(auditResult) {
  const { conclusion, iterations, history, os } = auditResult;

  let r = '';
  r += `SECURITY AUDIT REPORT -- HEEBA\n`;
  r += `${'='.repeat(60)}\n\n`;
  r += `Iterations : ${iterations}\n`;
  r += `OS         : ${os}\n`;
  r += `Score      : ${conclusion?.security_score || 'Inconclusive'}\n\n`;

  if (history && history.length > 0) {
    r += `COMMAND EXECUTION LOG\n`;
    r += `${'-'.repeat(40)}\n`;
    history.forEach((h, i) => {
      const status = h.success ? 'SUCCESS' : 'FAILED';
      r += `[Step ${i + 1}] ${status} | Tool: ${h.tool || 'direct'}\n`;
      r += `  Command: ${h.command || 'N/A'}\n`;
      const outputSnippet = (h.output || '').substring(0, 300).replace(/\n/g, ' ');
      r += `  Output: ${outputSnippet}\n\n`;
    });
    r += `\n`;
  }

  if (conclusion?.findings && conclusion.findings.length > 0) {
    r += `FINDINGS\n`;
    r += `${'-'.repeat(40)}\n`;
    conclusion.findings.slice(0, 8).forEach((f, i) => { r += `  ${i + 1}. ${f}\n`; });
    r += `\n`;
  }

  if (conclusion?.recommended_fixes && conclusion.recommended_fixes.length > 0) {
    r += `RECOMMENDED FIXES\n`;
    r += `${'-'.repeat(40)}\n`;
    conclusion.recommended_fixes.slice(0, 6).forEach((f, i) => { r += `  ${i + 1}. ${f}\n`; });
    r += `\n`;
  }

  r += `END OF REPORT\n`;
  r += `${'='.repeat(60)}\n`;
  r += `Generated by Heeba Security Audit System\n`;

  return r;
}

// Dispatch audit report via email
async function dispatchAuditReportEmail(auditResult, emailTo, os) {
  if (!emailTo) return { success: false, message: 'No email address provided' };

  const plainBody = formatSecurityAuditReportPlain(auditResult);
  const score = auditResult.conclusion?.security_score || 'Report';

  try {
    const result = await commandHandlers.send_email({
      to: emailTo,
      subject: `[Heeba Security Audit] ${os} -- ${score}`,
      body: plainBody
    });
    return result;
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Extract email address from user prompt
function extractEmailFromPrompt(prompt) {
  if (!prompt) return null;
  const match = prompt.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0] : null;
}

module.exports = {
  parseCommandFromResponse,
  parseSecurityCommandFromResponse,
  isSecurityConclusion,
  hasCommand,
  executeCommand,
  processLLMResponse,
  commandHandlers,
  runSecurityAuditLoop,
  isSecurityIntentTriggered,
  getToolKBContext,
  buildSecurityAuditPrompt,
  formatSecurityAuditReport,
  formatSecurityAuditReportPlain,
  dispatchAuditReportEmail,
  extractEmailFromPrompt,
  printAuditStep
};