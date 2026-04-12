const { loadToolsIndex, getToolsForOS } = require('../security-tools-index');
const { loadKBWithContext, formatKBContext, getOS } = require('../kb-loader');
const { parseCommandFromResponse: parseSecurityCommandFromResponse } = require('../../utils/json-parser');

/**
 * Recursive security audit loop.
 */
async function runSecurityAuditLoop(userInput, queryFn, commandHandlers, maxIterations = 15, options = {}) {
  const { onStep, emailTo, isTUI, silent = false } = options;
  const os = getOS();
  const toolsIndex = loadToolsIndex() || getToolsForOS(os);
  const history = [];
  let iteration = 0;
  let conclusion = null;

  const logStep = (step) => {
    if (onStep) onStep(step);
    if (!silent) printAuditStep(step, isTUI);
  };

  logStep({ phase: 'setup', iteration: 0, os, userInput, maxIterations, emailTo });
  logStep({ phase: 'loading_tools_index', iteration: 0, os, toolsIndex });

  let prompt = buildSecurityAuditPrompt(userInput, toolsIndex, os, []);

  while (iteration < maxIterations && !conclusion) {
    iteration++;
    logStep({ phase: 'begin', iteration, os });

    const llmResponse = await queryFn(prompt, 'auto');

    logStep({
      phase: 'llm_reasoning',
      iteration,
      llmReasoning: llmResponse.substring(0, 600),
      os
    });

    if (isSecurityConclusion(llmResponse)) {
      try {
        // Look for the last JSON object in the response if multiple exist
        const matches = llmResponse.match(/\{[\s\S]*\}/g);
        if (matches) {
          const lastMatch = matches[matches.length - 1];
          const parsed = JSON.parse(lastMatch);
          if (parsed.security_score) {
            conclusion = parsed;
            logStep({ phase: 'conclusion', iteration, conclusion, history, os });
            break;
          }
        }
      } catch (e) {}
    }

    const secCmd = parseSecurityCommandFromResponse(llmResponse);
    if (secCmd && secCmd.command) {
      const category = inferCategoryFromTool(secCmd.tool, toolsIndex, os);
      logStep({ phase: 'category_selected', iteration, category, tool: secCmd.tool, os });

      if (secCmd.tool !== 'direct') {
        const kb = loadKBWithContext(secCmd.tool, os);
        logStep({ phase: 'kb_loading', iteration, toolName: secCmd.tool, kbDescription: kb?.description || '', os });
      }

      logStep({
        phase: 'tool_selected',
        iteration,
        toolName: secCmd.tool || 'direct',
        reason: secCmd.reason || '',
        category,
        os
      });

      logStep({
        phase: 'command_planning',
        iteration,
        tool: secCmd.tool,
        reason: secCmd.reason || '',
        command: secCmd.command,
        os
      });

      logStep({ phase: 'executing', iteration, command: secCmd.command, tool: secCmd.tool, os });

      let execResult = await commandHandlers.exec_security_command({
        command: secCmd.command,
        reason: secCmd.reason || '',
        stepNumber: iteration,
        silent: true  // Always silent — printAuditStep handles all display
      });

      history.push({
        tool: secCmd.tool,
        reason: secCmd.reason || '',
        command: secCmd.command,
        output: execResult.raw_output || execResult.message,
        success: execResult.success
      });

      if (!execResult.success) {
        const kbCorrection = getKBSimplerCommand(secCmd.tool, secCmd.command, execResult.raw_output || execResult.message, os);
        if (kbCorrection) {
          logStep({
            phase: 'kb_correction',
            iteration,
            toolName: secCmd.tool,
            failureReason: extractFailureReason(execResult.raw_output || execResult.message),
            suggestion: kbCorrection.suggestion,
            correctedCommand: kbCorrection.command,
            os
          });

          const correctedResult = await commandHandlers.exec_security_command({
            command: kbCorrection.command,
            reason: `KB self-correction: ${kbCorrection.suggestion}`,
            stepNumber: iteration,
            silent: true  // Always silent — printAuditStep handles all display
          });

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

      const nextCategory = history.length >= 3 ? 'Conclusion (sufficient data)' : inferNextCategory(history, toolsIndex, os);

      // Extract meaningful insight from the output
      const insight = analyzeSecurityOutput(execResult.raw_output || execResult.message, secCmd.tool);

      logStep({
        phase: 'command_done',
        iteration,
        tool: secCmd.tool,
        reason: secCmd.reason || '',
        command: secCmd.command,
        output: (execResult.raw_output || execResult.message).substring(0, 800),
        success: execResult.success,
        analysis: insight,
        nextCategory,
        os
      });

      prompt = buildSecurityAuditPrompt(userInput, toolsIndex, os, history);
    } else {
        logStep({
          phase: 'invalid_response',
          iteration,
          llmAnalysis: llmResponse.substring(0, 300),
          os
        });
        prompt = `YOU MUST OUTPUT A JSON COMMAND. Do NOT respond with prose.\n\n`;
        prompt += `Previous response was not valid JSON:\n${llmResponse.substring(0, 500)}\n\n`;
        prompt += `You MUST output EITHER:\n`;
        prompt += `1. A command: {"tool": "ToolName", "command": "actual command", "reason": "why"}\n`;
        prompt += `2. OR a final conclusion: {"security_score": "Safe", "findings": [], "recommended_fixes": []}\n`;
    }
  }

  if (!conclusion && iteration >= maxIterations) {
    conclusion = {
      security_score: 'Inconclusive',
      findings: [`Audit stopped after ${maxIterations} iterations without reaching a conclusion`],
      recommended_fixes: ['Explore manually or try a different model']
    };
  }

  const auditResult = { conclusion, iterations: iteration, history, os };

  if (emailTo) {
    logStep({ phase: 'email_dispatch', iteration, emailTo, os, conclusion });
    const emailResult = await dispatchAuditReportEmail(auditResult, emailTo, os, commandHandlers);
    if (emailResult && emailResult.success) {
      logStep({ phase: 'email_sent', iteration, emailTo, os });
    } else {
      logStep({ phase: 'email_failed', iteration, emailTo, error: emailResult?.message, os });
    }
  }

  return auditResult;
}

function buildSecurityAuditPrompt(userInput, toolsIndex, os, history = []) {
  const toolsCtx = buildToolsContextDetailed(toolsIndex, os);
  let prompt = `You are Heeba running a SECURITY AUDIT. You are in a RECURSIVE AGENT LOOP until you output a final conclusion.\n\n`;
  prompt += `CRITICAL RULES:\n`;
  prompt += `1. You MUST output a JSON object only. NO EXPLANATORY TEXT.\n`;
  prompt += `2. NEVER stop after just one command - you must run multiple checks.\n`;
  prompt += `3. Format: {"tool": "ToolName", "command": "cmd", "reason": "why"}\n`;
  prompt += `4. When finished, output FINAL JSON: {"security_score": "Safe/At Risk", "findings": [], "recommended_fixes": []}\n\n`;
  prompt += `USER REQUEST: ${userInput}\n\n`;
  prompt += `AVAILABLE SECURITY TOOLS:\n${toolsCtx}\n\n`;

  if (history.length > 0) {
    prompt += `PREVIOUS COMMAND HISTORY:\n`;
    for (const h of history) {
      prompt += `Tool: ${h.tool}\nCommand: ${h.command}\nOutput:\n${h.output.substring(0, 1000)}\n\n`;
    }
  }

  return prompt;
}

function buildToolsContextDetailed(toolsIndex, os) {
  let ctx = '';
  const osTools = toolsIndex[os] || {};
  const categories = Object.keys(osTools);
  for (const cat of categories) {
    ctx += `\n=== ${cat} ===\n`;
    for (const t of osTools[cat]) {
      ctx += `Tool: ${t.tool}\n  Description: ${t.description || 'N/A'}\n`;
    }
  }
  return ctx;
}

// Local parseSecurityCommandFromResponse removed

function isSecurityConclusion(response) {
  return response.includes('"security_score"') && (response.includes('"findings"') || response.includes('"recommended_fixes"'));
}

function extractFailureReason(output) {
  if (!output) return 'Unknown error';
  const lines = output.split('\n').filter(l => l.trim());
  return lines.length > 0 ? lines[0].substring(0, 120) : 'Command failed';
}

function getKBSimplerCommand(toolName, originalCommand, errorOutput, os) {
  const kb = loadKBWithContext(toolName, os);
  if (!kb || !kb.safe_flags || kb.safe_flags.length === 0) return null;
  const safeFlag = kb.safe_flags[0];
  return {
    command: safeFlag.example_command || `${toolName} ${safeFlag.flag}`,
    suggestion: `Use safe flag: ${safeFlag.flag}`
  };
}

function inferCategoryFromTool(toolName, toolsIndex, os) {
  const osTools = toolsIndex[os] || {};
  for (const cat in osTools) {
    if (osTools[cat].find(t => t.tool === toolName)) return cat;
  }
  return 'General Security';
}

function inferNextCategory(history, toolsIndex, os) {
  const osTools = toolsIndex[os] || {};
  const existing = history.map(h => inferCategoryFromTool(h.tool, toolsIndex, os));
  for (const cat in osTools) {
    if (!existing.includes(cat)) return cat;
  }
  return 'Conclusion';
}

/**
 * Extract meaningful security insight from command output
 */
function analyzeSecurityOutput(output, tool) {
  if (!output) return 'No output received.';

  const lower = output.toLowerCase();
  const lines = output.split('\n').filter(l => l.trim());
  const insights = [];

  // Firewall checks
  if (tool === 'netsh' || lower.includes('firewall')) {
    if (lower.includes('state on') || lower.includes('enabled')) insights.push('Firewall is ENABLED');
    else if (lower.includes('state off') || lower.includes('disabled')) insights.push('!  Firewall is DISABLED');
    const profileMatch = output.match(/(domain|private|public)\s+profile/gi);
    if (profileMatch) insights.push(`Profiles found: ${profileMatch.join(', ')}`);
  }

  // Port / network scans
  if (tool === 'netstat' || lower.includes('listening') || lower.includes('established')) {
    const listening = (output.match(/LISTENING/gi) || []).length;
    const established = (output.match(/ESTABLISHED/gi) || []).length;
    if (listening > 0) insights.push(`${listening} listening port(s)`);
    if (established > 0) insights.push(`${established} established connection(s)`);
    // Check for suspicious ports
    const suspiciousPorts = ['4444', '5555', '1337', '31337', '6666', '6667'];
    for (const port of suspiciousPorts) {
      if (output.includes(`:${port}`)) insights.push(`! Suspicious port ${port} detected`);
    }
  }

  // Process checks
  if (lower.includes('process') || tool === 'tasklist' || tool === 'Get-Process') {
    const processCount = lines.filter(l => l.match(/\d+\s+\w+/)).length;
    if (processCount > 0) insights.push(`${processCount} processes listed`);
    // Check for suspicious processes
    const suspiciousProcs = ['mimikatz', 'nc.exe', 'ncat', 'powershell -enc', 'certutil'];
    for (const proc of suspiciousProcs) {
      if (lower.includes(proc.toLowerCase())) insights.push(`! Suspicious process: ${proc}`);
    }
  }

  // Windows Defender / antivirus
  if (lower.includes('defender') || lower.includes('antivirus') || lower.includes('antimalware')) {
    if (lower.includes('enabled') || lower.includes('true')) insights.push('Antivirus protection is active');
    if (lower.includes('disabled') || lower.includes('false')) insights.push('! Antivirus may be disabled');
    const sigMatch = output.match(/(?:signature|definition)\s*(?:version|update).*?(\d[\d.]+)/i);
    if (sigMatch) insights.push(`Signature ver: ${sigMatch[1]}`);
  }

  // User / account checks
  if (lower.includes('user') && (lower.includes('account') || lower.includes('administrator'))) {
    const adminMatch = output.match(/administrator/gi);
    if (adminMatch) insights.push(`Admin account references: ${adminMatch.length}`);
    if (lower.includes('guest')) insights.push('Guest account present');
  }

  // Scheduled tasks / startup
  if (lower.includes('scheduled') || lower.includes('schtasks') || lower.includes('startup')) {
    const taskCount = lines.filter(l => l.includes('\\') && !l.startsWith('Folder')).length;
    if (taskCount > 0) insights.push(`${taskCount} scheduled task(s) found`);
  }

  // Service checks
  if (lower.includes('running') && lower.includes('service')) {
    const running = (output.match(/running/gi) || []).length;
    const stopped = (output.match(/stopped/gi) || []).length;
    if (running > 0) insights.push(`${running} service(s) running`);
    if (stopped > 0) insights.push(`${stopped} service(s) stopped`);
  }

  // Registry or policy
  if (lower.includes('registry') || lower.includes('hklm') || lower.includes('hkcu')) {
    insights.push('Registry keys inspected');
  }

  // Encryption / BitLocker
  if (lower.includes('bitlocker') || lower.includes('encryption')) {
    if (lower.includes('protection on') || lower.includes('encrypted')) insights.push('Drive encryption is active');
    else if (lower.includes('protection off') || lower.includes('not encrypted')) insights.push('! Drive is NOT encrypted');
  }

  // Updates / patches
  if (lower.includes('hotfix') || lower.includes('update') || lower.includes('kb')) {
    const kbs = output.match(/KB\d+/gi) || [];
    if (kbs.length > 0) insights.push(`${kbs.length} patch(es)/hotfix(es) found`);
  }

  // Shared folders
  if (lower.includes('share') && (lower.includes('name') || lower.includes('path'))) {
    const shares = lines.filter(l => l.includes('$') || l.match(/\w+\s+\w:\\/)).length;
    if (shares > 0) insights.push(`${shares} network share(s) detected`);
  }

  // Generic error or access denied
  if (lower.includes('access is denied') || lower.includes('access denied')) {
    insights.push('! Access denied — elevated privileges may be needed');
  }
  if (lower.includes('not recognized') || lower.includes('is not recognized')) {
    insights.push('! Tool not found on this system');
  }

  // Fallback: summarize output size
  if (insights.length === 0) {
    if (lines.length === 0) return 'Empty output (command may require elevation).';
    return `Received ${lines.length} line(s) of output from ${tool || 'command'}`;
  }

  return insights.join(' │ ');
}

/**
 * Pad string helper
 */
function padStr(str, width) {
  const s = String(str || '');
  if (s.length >= width) return s.substring(0, width);
  return s + ' '.repeat(width - s.length);
}

function printAuditStep(step, isTUI, silent = false) {
  const M = '\x1b[35m';    // Magenta
  const D = '\x1b[90m';    // Dim/Gray
  const C = '\x1b[36m';    // Cyan
  const Y = '\x1b[33m';    // Yellow
  const G = '\x1b[32m';    // Green
  const R = '\x1b[31m';    // Red
  const W = '\x1b[37m';    // White
  const B = '\x1b[1m';     // Bold
  const RST = '\x1b[0m';
  const out = (m) => isTUI ? process.stdout.write(m + '\n') : console.log(m);

  const lines = [];
  const capture = (m) => { lines.push(m); if (!silent) out(m); };

  switch (step.phase) {
    case 'setup':
      capture(`\n  ${M}◈ HEEBA SYSTEM SECURITY AUDIT${RST}`);
      capture(`  ${D}└─ Starting recursive scan on ${W}${step.os}${RST}`);
      capture(`  ${D}   Target: ${W}${step.userInput?.substring(0, 80) || 'System'}${RST}`);
      if (step.emailTo) {
        capture(`  ${D}   Report to: ${C}${step.emailTo}${RST}`);
      }
      capture('');
      break;

    case 'loading_tools_index': {
      // Count available tools from the index
      let toolCount = 0;
      let catCount = 0;
      if (step.toolsIndex) {
        const osTools = step.toolsIndex[step.os] || {};
        const cats = Object.keys(osTools);
        catCount = cats.length;
        cats.forEach(cat => { toolCount += (osTools[cat] || []).length; });
      }
      capture(`  ${D}├─${RST} ⚒ ${C}Security toolkit loaded${RST}`);
      if (toolCount > 0) {
        capture(`  ${D}│  └─${RST} ${D}${toolCount} tool(s) across ${catCount} categor${catCount === 1 ? 'y' : 'ies'}${RST}`);
      }
      capture('');
      break;
    }

    case 'category_selected':
      capture(`  ${D}├─ [Step ${step.iteration}]${RST} ◎  ${Y}Scan Category:${RST} ${M}${B}${step.category}${RST}`);
      break;

    case 'kb_loading': {
      const desc = step.kbDescription ? ` — ${step.kbDescription.substring(0, 60)}` : '';
      capture(`  ${D}│  ├─ KB:${RST}   ${D}▤ Knowledge base loaded for ${C}${step.toolName}${RST}${D}${desc}${RST}`);
      break;
    }

    case 'tool_selected':
      capture(`  ${D}│  ├─ Tool:${RST}  ${C}${step.toolName}${RST}`);
      if (step.reason) {
        capture(`  ${D}│  ├─ Why:${RST}   ${D}${step.reason}${RST}`);
      }
      break;

    case 'command_planning':
      capture(`  ${D}│  ├─ Cmd:${RST}   ${W}${step.command}${RST}`);
      break;

    case 'executing':
      capture(`  ${D}│  ├─ ⚙ Running...${RST}`);
      break;

    case 'command_done': {
      const status = step.success ? `${G}✓ OK${RST}` : `${R}✗ FAIL${RST}`;
      capture(`  ${D}│  ├─ Status:${RST} ${status}`);
      
      // Show the meaningful analysis insight
      const insight = step.analysis || 'Processed.';
      const insightParts = insight.split(' │ ');
      if (insightParts.length <= 2) {
        capture(`  ${D}│  └─ ${G}» ${insight}${RST}`);
      } else {
        capture(`  ${D}│  └─ ${G}▸ Findings:${RST}`);
        insightParts.forEach((part, i) => {
          const isWarning = part.includes('!');
          const color = isWarning ? Y : G;
          const connector = i < insightParts.length - 1 ? '├' : '└';
          capture(`  ${D}│     ${connector}─${RST} ${color}${part.trim()}${RST}`);
        });
      }

      if (step.nextCategory) {
        capture(`  ${D}│     ${M}↳ Next focus: ${step.nextCategory}${RST}`);
      }
      capture('');
      break;
    }

    case 'kb_correction':
      capture(`  ${D}│  ├─${RST} ${Y}↻ KB Self-Correction${RST}`);
      capture(`  ${D}│  │  ├─ Failure:${RST} ${R}${step.failureReason?.substring(0, 80) || 'Command failed'}${RST}`);
      capture(`  ${D}│  │  ├─ Fix:${RST}     ${G}${step.suggestion}${RST}`);
      capture(`  ${D}│  │  └─ Retry:${RST}   ${W}${step.correctedCommand}${RST}`);
      break;

    case 'invalid_response':
      capture(`  ${D}├─ ${R}! Model returned invalid response, retrying...${RST}`);
      capture('');
      break;

    case 'llm_reasoning':
      // Intentionally silent — internal reasoning doesn't need display
      break;

    case 'begin':
      // Intentionally minimal for clean output
      break;

    case 'conclusion': {
      const score = step.conclusion.security_score || 'Unknown';
      const isGood = score.toLowerCase() === 'safe' || score.toLowerCase().includes('secure');
      const scoreColor = isGood ? G : R;
      const scoreIcon = isGood ? '√' : '!';

      capture('');
      capture(`  ${D}╔════════════════════════════════════════════════════════╗${RST}`);
      capture(`  ${D}║${RST}  ${scoreColor}${B}${scoreIcon} SECURITY AUDIT COMPLETE${RST}                          ${D}║${RST}`);
      capture(`  ${D}╚════════════════════════════════════════════════════════╝${RST}`);
      capture('');
      capture(`  ${Y}◈ Security Score:${RST}  ${scoreColor}${B}${score}${RST}`);
      capture(`  ${Y}◈ OS Scanned:${RST}     ${W}${step.os}${RST}`);
      capture(`  ${Y}◈ Checks Run:${RST}     ${W}${step.iteration} iteration(s)${RST}`);

      // Findings
      const findings = step.conclusion.findings || [];
      if (findings.length > 0) {
        capture('');
        capture(`  ${Y}${B}◈ Findings (${findings.length}):${RST}`);
        findings.forEach((f, i) => {
          const isWarning = f.toLowerCase().includes('risk') || f.toLowerCase().includes('vulnerable') || f.toLowerCase().includes('disabled') || f.toLowerCase().includes('weak');
          const color = isWarning ? R : Y;
          const icon = isWarning ? '!' : '•';
          const connector = i < findings.length - 1 ? '├' : '└';
          // Word-wrap long findings
          const lines = wordWrap(`${icon} ${f}`, 75);
          lines.forEach((line, li) => {
            if (li === 0) {
              capture(`  ${D}${connector}─${RST} ${color}${line}${RST}`);
            } else {
              const cont = i < findings.length - 1 ? '│' : ' ';
              capture(`  ${D}${cont}  ${RST} ${color}${line}${RST}`);
            }
          });
        });
      }

      // Recommendations
      const fixes = step.conclusion.recommended_fixes || [];
      if (fixes.length > 0) {
        capture('');
        capture(`  ${G}${B}◈ Recommended Fixes (${fixes.length}):${RST}`);
        fixes.forEach((f, i) => {
          const connector = i < fixes.length - 1 ? '├' : '└';
          const lines = wordWrap(`✦ ${f}`, 75);
          lines.forEach((line, li) => {
            if (li === 0) {
              capture(`  ${D}${connector}─${RST} ${G}${line}${RST}`);
            } else {
              const cont = i < fixes.length - 1 ? '│' : ' ';
              capture(`  ${D}${cont}  ${RST} ${G}${line}${RST}`);
            }
          });
        });
      }

      // Scan history summary table
      if (step.history && step.history.length > 0) {
        capture('');
        capture(`  ${C}${B}◈ Scan History (${step.history.length} checks):${RST}`);
        const toolW = 18;
        const cmdW = 30;
        const statusW = 8;
        capture(`  ${D}┌────┬${'─'.repeat(toolW + 1)}┬${'─'.repeat(cmdW + 1)}┬${'─'.repeat(statusW + 1)}┐${RST}`);
        capture(`  ${D}│${RST} ${B}${padStr('#', 3)}${D}│${RST} ${B}${padStr('Tool', toolW)}${D}│${RST} ${B}${padStr('Command', cmdW)}${D}│${RST} ${B}${padStr('Result', statusW)}${D}│${RST}`);
        capture(`  ${D}├────┼${'─'.repeat(toolW + 1)}┼${'─'.repeat(cmdW + 1)}┼${'─'.repeat(statusW + 1)}┤${RST}`);
        step.history.forEach((h, i) => {
          const statusColor = h.success ? G : R;
          const statusText = h.success ? '√ OK' : '[X] FAIL';
          const cmdShort = h.command.length > cmdW ? h.command.substring(0, cmdW - 2) + '..' : h.command;
          capture(`  ${D}│${RST} ${padStr(i + 1, 3)}${D}│${RST} ${C}${padStr(h.tool || 'direct', toolW)}${RST}${D}│${RST} ${padStr(cmdShort, cmdW)}${D}│${RST} ${statusColor}${padStr(statusText, statusW)}${RST}${D}│${RST}`);
          if (i < step.history.length - 1) {
            capture(`  ${D}├────┼${'─'.repeat(toolW + 1)}┼${'─'.repeat(cmdW + 1)}┼${'─'.repeat(statusW + 1)}┤${RST}`);
          }
        });
        capture(`  ${D}└────┴${'─'.repeat(toolW + 1)}┴${'─'.repeat(cmdW + 1)}┴${'─'.repeat(statusW + 1)}┘${RST}`);
      }

      capture('');
      break;
    }

    case 'email_dispatch':
      capture(`  ${D}├─${RST} ✉ ${Y}Sending audit report to ${C}${step.emailTo}${RST}${Y}...${RST}`);
      break;

    case 'email_sent':
      capture(`  ${D}│  └─${RST} ${G}✓ Report emailed successfully to ${step.emailTo}${RST}`);
      capture('');
      break;

    case 'email_failed':
      capture(`  ${D}│  └─${RST} ${R}✗ Failed to email report: ${step.error || 'Unknown error'}${RST}`);
      capture('');
      break;
  }
  return lines;
}

/**
 * Word-wrap text to a max width
 */
function wordWrap(text, maxWidth) {
  if (!text || text.length <= maxWidth) return [text || ''];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > maxWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

async function dispatchAuditReportEmail(auditResult, emailTo, os, commandHandlers) {
  const score = auditResult.conclusion?.security_score || 'Report';
  const body = `Security Audit Report\nOS: ${os}\nScore: ${score}\n\nFindings:\n${(auditResult.conclusion?.findings || []).join('\n')}`;
  return await commandHandlers.send_email({ to: emailTo, subject: `Heeba Security Audit: ${score}`, body });
}

module.exports = {
  runSecurityAuditLoop,
  printAuditStep
};
