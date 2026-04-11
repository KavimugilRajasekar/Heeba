const { loadToolsIndex, getToolsForOS } = require('../security-tools-index');
const { loadKBWithContext, formatKBContext, getOS } = require('../kb-loader');

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
  logStep({ phase: 'loading_tools_index', iteration: 0, os });

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
        const match = llmResponse.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (parsed.security_score) {
            conclusion = parsed;
            logStep({ phase: 'conclusion', iteration, conclusion, os });
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

      logStep({ phase: 'executing', iteration, os });

      let execResult = await commandHandlers.exec_security_command({
        command: secCmd.command,
        reason: secCmd.reason || '',
        stepNumber: iteration,
        silent: silent
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
            silent: silent
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

      logStep({
        phase: 'command_done',
        iteration,
        tool: secCmd.tool,
        reason: secCmd.reason || '',
        command: secCmd.command,
        output: (execResult.raw_output || execResult.message).substring(0, 800),
        success: execResult.success,
        analysis: analyzeSecurityOutput(execResult.raw_output || execResult.message, secCmd.tool),
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

function parseSecurityCommandFromResponse(response) {
  try {
    const match = response.match(/\{[\s\S]*"command"[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {}
  return null;
}

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

function analyzeSecurityOutput(output, tool) {
  if (!output) return 'No output.';
  return 'Analysis complete.';
}

function printAuditStep(step, isTUI, silent = false) {
  const M = '\x1b[35m';
  const D = '\x1b[90m';
  const C = '\x1b[36m';
  const Y = '\x1b[33m';
  const G = '\x1b[32m';
  const R = '\x1b[31m';
  const RST = '\x1b[0m';
  const out = (m) => isTUI ? process.stdout.write(m + '\n') : console.log(m);

  const lines = [];
  const capture = (m) => { lines.push(m); if (!silent) out(m); };

  switch (step.phase) {
    case 'setup':
      capture(`\n  ${M}◈ HEEBA SYSTEM SECURITY AUDIT${RST}`);
      capture(`  ${D}└─ Starting recursive scan (${step.os})${RST}`);
      break;
    case 'category_selected':
      capture(`  ${D}├─ [Step ${step.iteration}]${RST} ${Y}Scan Category:${RST} ${M}${step.category}${RST}`);
      break;
    case 'tool_selected':
      capture(`  ${D}│  ├─ Tool:${RST} ${C}${step.toolName}${RST}`);
      break;
    case 'command_done':
      const status = step.success ? `${G}OK${RST}` : `${R}FAIL${RST}`;
      capture(`  ${D}│  └─ Result:${RST} ${status} ${D}(${step.analysis || 'Analysis complete'})${RST}`);
      break;
    case 'conclusion':
      const scoreColor = step.conclusion.security_score === 'Safe' ? G : R;
      capture(`  ${D}└─${RST} ${scoreColor}✓ Security Conclusion: ${step.conclusion.security_score}${RST}`);
      break;
  }
  return lines;
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
