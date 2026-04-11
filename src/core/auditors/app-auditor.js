const { getOS } = require('../kb-loader');
const { formatGenericTable } = require('../../utils/table-gen');

/**
 * Recursive app audit loop.
 */
async function runAppAuditLoop(userInput, queryFn, commandHandlers, maxIterations = 15, options = {}) {
  const { onStep, isTUI, silent = false } = options;
  const os = getOS();
  const history = [];
  let iteration = 0;
  let conclusion = null;

  const logStep = (step) => {
    if (onStep) onStep(step);
    if (!silent) printAppAuditStep(step, isTUI);
  };

  logStep({ phase: 'setup', iteration: 0, os, userInput, maxIterations });

  let prompt = buildAppAuditPrompt(userInput, os, []);

  while (iteration < maxIterations && !conclusion) {
    iteration++;
    logStep({ phase: 'begin', iteration, os });

    const llmResponse = await queryFn(prompt, 'auto');

    // Check for final conclusion
    if (llmResponse.includes('"app_report"')) {
       try {
         const match = llmResponse.match(/\{[\s\S]*\}/);
         if (match) {
           const parsed = JSON.parse(match[0]);
           if (parsed.app_report) {
             conclusion = parsed.app_report;
             logStep({ phase: 'conclusion', iteration, conclusion, os });
             break;
           }
         }
       } catch (e) {}
    }

    const command = parseCommandFromResponse(llmResponse);
    if (command && command.action) {
      // Tool Aliases
      const aliasMap = {
        'list_files': 'list_dir',
        'list_directory': 'list_dir',
        'ls': 'list_dir',
        'cat': 'read_file',
        'read_content': 'read_file'
      };
      const action = aliasMap[command.action] || command.action;
      
      const target = command.target || command.parameters?.file_path || command.parameters?.folder_path || '';
      
      logStep({ 
        phase: 'executing', 
        iteration, 
        action: action, 
        target,
        reason: command.reason || '',
        os 
      });
      
      let result;
      if (commandHandlers[action]) {
        result = await commandHandlers[action](command.parameters || {}, { isTUI, silent: true });
      } else {
        result = { 
          success: false, 
          message: `Unknown action: "${action}". Available file tools: list_dir, read_file, analyze_file. Please use a valid tool name.` 
        };
      }
      
      const resultStr = String(result.message || result);
      history.push({ action: action, result: resultStr });
      
      logStep({ 
        phase: 'insight', 
        iteration, 
        action: command.action, 
        target,
        result: resultStr.substring(0, 500),
        os 
      });

      prompt = buildAppAuditPrompt(userInput, os, history);
    } else {
      logStep({ phase: 'invalid', iteration, os });
      prompt += `\nINVALID RESPONSE. You must output a valid JSON command or the final app_report.`;
    }
  }

  // Generate detailed table for report
  if (conclusion && conclusion.endpoints) {
    conclusion.detailed_table = formatGenericTable({
      title: `Detailed Backend Analysis: Port ${conclusion.port}`,
      columns: [
        { key: 'path', name: 'Endpoint Path', width: 30 },
        { key: 'method', name: 'Method', width: 10 },
        { key: 'description', name: 'Task/Purpose', width: 40 },
        { key: 'status', name: 'Status', width: 10 },
        { key: 'latency', name: 'Speed', width: 15 }
      ],
      rows: conclusion.endpoints.map(e => ({
        path: e.path,
        method: e.method || 'GET',
        description: e.description || 'API Endpoint',
        status: e.status || 'Checking..',
        latency: e.latency || 'N/A'
      }))
    });
  }

  return { conclusion, iterations: iteration, history };
}

function buildAppAuditPrompt(userInput, os, history = []) {
  let prompt = `You are Heeba running a PROJECT ENDPOINT AUDIT. You are in a RECURSIVE AGENT LOOP.\n\n`;
  prompt += `GOAL: Analyze the project, find its running port, discover all API endpoints/routes, and test them.\n\n`;
  prompt += `CRITICAL RULES:\n`;
  prompt += `1. You MUST output a JSON object only. NO EXPLANATORY TEXT.\n`;
  prompt += `2. For discovery, list files, read code, and identify routes.\n`;
  prompt += `3. For testing, use the 'test_endpoint' tool once you know the port and routes.\n`;
  prompt += `4. Format: {"action": "action_name", "parameters": {...}, "reason": "why", "target": "file/folder"}\n`;
  prompt += `5. When finished, output FINAL JSON:\n`;
  prompt += `   {"app_report": {"port": 80, "endpoints": [{"path": "/api", "method": "GET", "description": "Fetch user data", "status": "200 OK", "latency": "45ms"}], "summary": "brief summary"}}\n\n`;
  prompt += `USER REQUEST: ${userInput}\n\n`;

  if (history.length > 0) {
    prompt += `PREVIOUS COMMAND HISTORY:\n`;
    for (const h of history) {
      prompt += `Action: ${h.action}\nResult: ${String(h.result).substring(0, 500)}\n\n`;
    }
  }
  return prompt;
}

function parseCommandFromResponse(response) {
  try {
    const match = response.match(/\{[\s\S]*"action"[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
  } catch (e) {}
  return null;
}

function printAppAuditStep(step, isTUI, silent = false) {
  const C = '\x1b[36m';
  const G = '\x1b[32m';
  const Y = '\x1b[33m';
  const D = '\x1b[90m';
  const RST = '\x1b[0m';
  
  const lines = [];
  const out = (m) => { lines.push(m); if (!silent) isTUI ? process.stdout.write(m + '\n') : console.log(m); };

  switch(step.phase) {
    case 'setup': 
      out(`\n  ${C}◈ HEEBA APP AUDITOR${RST}`);
      out(`  ${D}└─ Starting recursive project analysis...${RST}`);
      break;
    case 'executing': 
      const targetTag = step.target ? ` ${D}(${step.target})${RST}` : '';
      out(`  ${D}├─ [Step ${step.iteration}]${RST} ${C}${step.action}${RST}${targetTag}`);
      break;
    case 'insight':
      out(`  ${D}│  └─ Insight:${RST} ${G}Analysis complete.${RST}`);
      break;
    case 'conclusion': 
      out(`  ${D}└─${RST} ${G}✓ Audit Complete!${RST}`);
      out(`     ${Y}Port ${step.conclusion.port} identified with ${step.conclusion.endpoints?.length || 0} endpoints.${RST}\n`);
      break;
  }
  return lines;
}

module.exports = {
  runAppAuditLoop,
  printAppAuditStep
};
