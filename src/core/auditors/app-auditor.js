const { getOS } = require('../kb-loader');
const { formatGenericTable } = require('../../utils/table-gen');
const { parseCommandFromResponse } = require('../../utils/json-parser');

/**
 * Recursive app audit loop.
 * Phase 1: Discovery — list dirs, read files, find port + routes
 * Phase 2: Testing  — use test_endpoint to HTTP-test each discovered route
 * Phase 3: Report   — show final table with all results
 */
async function runAppAuditLoop(userInput, queryFn, commandHandlers, maxIterations = 15, options = {}) {
  const { onStep, isTUI, silent = false } = options;
  const os = getOS();
  const history = [];
  let iteration = 0;
  let conclusion = null;
  const discoveredEndpoints = [];
  let detectedPort = null;

  // Track files already read to prevent re-read loops
  const filesRead = new Set();

  const logStep = (step) => {
    if (onStep) onStep(step);
    if (!silent) printAppAuditStep(step, isTUI);
  };

  logStep({ phase: 'setup', iteration: 0, os, userInput, maxIterations });

  let prompt = buildAppAuditPrompt(userInput, os, [], discoveredEndpoints, detectedPort);

  while (iteration < maxIterations && !conclusion) {
    iteration++;
    logStep({ phase: 'begin', iteration, os });

    const llmResponse = await queryFn(prompt, 'auto');

    // Check for final conclusion
    if (llmResponse.includes('"app_report"')) {
       try {
         const matches = llmResponse.match(/\{[\s\S]*\}/g);
         if (matches) {
           const lastMatch = matches[matches.length - 1];
           const parsed = JSON.parse(lastMatch);
           if (parsed.app_report) {
             conclusion = parsed.app_report;
             // Merge any discovered endpoints into the conclusion
             if (discoveredEndpoints.length > 0 && (!conclusion.endpoints || conclusion.endpoints.length === 0)) {
               conclusion.endpoints = discoveredEndpoints;
             }
             if (!conclusion.port && detectedPort) {
               conclusion.port = detectedPort;
             }
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
        'read_content': 'read_file',
        'http_request': 'test_endpoint',
        'curl': 'test_endpoint',
        'http_test': 'test_endpoint'
      };
      const action = aliasMap[command.action] || command.action;
      
      const target = command.target || command.parameters?.file_path || command.parameters?.folder_path || command.parameters?.path || command.parameters?.url || '';
      
      // === LOOP DETECTION: skip if same file already read ===
      const normalizedTarget = target.replace(/\\/g, '/').toLowerCase();
      if ((action === 'read_file' || action === 'analyze_file') && normalizedTarget && filesRead.has(normalizedTarget)) {
        // Already read this file — inject cached result into history and tell LLM to move on
        const cachedEntry = history.find(h => 
          (h.action === 'read_file' || h.action === 'analyze_file') && 
          h.target?.replace(/\\/g, '/').toLowerCase() === normalizedTarget
        );
        
        logStep({
          phase: 'skipped_duplicate',
          iteration,
          action,
          target,
          os
        });

        // Provide the LLM with a hint to move forward
        const cachedResult = cachedEntry ? cachedEntry.result.substring(0, 1500) : 'Already read.';
        history.push({ action, target, result: `[ALREADY READ] ${cachedResult}` });
        prompt = buildAppAuditPrompt(userInput, os, history, discoveredEndpoints, detectedPort);
        continue;
      }

      // Determine if this is a test action vs discovery
      const isTestAction = (action === 'test_endpoint');

      logStep({ 
        phase: 'executing', 
        iteration, 
        action: action, 
        target,
        reason: command.reason || '',
        isTestAction,
        os 
      });
      
      let result;
      if (commandHandlers[action]) {
        result = await commandHandlers[action](command.parameters || {}, { isTUI, silent: true });
      } else {
        result = { 
          success: false, 
          message: `Unknown action: "${action}". Available tools: list_dir, read_file, analyze_file, test_endpoint. Please use a valid tool name.` 
        };
      }
      
      const resultStr = String(result.message || result);
      
      // Track files we've read (store full result for history, not truncated)
      if ((action === 'read_file' || action === 'analyze_file') && normalizedTarget) {
        filesRead.add(normalizedTarget);
      }

      // Store full result in history (increased from 500 to 1500 chars for the prompt)
      history.push({ action: action, target, result: resultStr });
      
      // Extract meaningful insight from the result
      const insight = extractInsight(action, target, resultStr);
      
      // Detect port from file content
      if (action === 'read_file' && !detectedPort) {
        const portMatch = resultStr.match(/(?:PORT|port)\s*[=:]\s*(\d+)/);
        if (portMatch) detectedPort = portMatch[1];
      }
      
      // Check if the result reveals any endpoints/routes
      const newEndpoints = extractEndpointsFromResult(resultStr, target);
      if (newEndpoints.length > 0) {
        newEndpoints.forEach(ep => {
          if (!discoveredEndpoints.find(e => e.path === ep.path && e.method === ep.method)) {
            discoveredEndpoints.push(ep);
          }
        });
      }

      logStep({ 
        phase: 'insight', 
        iteration, 
        action,
        target,
        insight,
        discoveredEndpoints: discoveredEndpoints.length,
        result: resultStr.substring(0, 500),
        os 
      });

      // If endpoints were just discovered, show the live table
      if (discoveredEndpoints.length > 0 && newEndpoints.length > 0) {
        logStep({
          phase: 'endpoints_discovered',
          iteration,
          endpoints: [...discoveredEndpoints],
          newCount: newEndpoints.length,
          os
        });
      }

      // If this was a test action, log the test result
      if (isTestAction) {
        const testPath = command.parameters?.url || command.parameters?.path || target;
        const testMethod = command.parameters?.method || 'GET';
        const testStatus = result.success ? extractStatusCode(resultStr) : 'FAIL';
        const testLatency = extractLatency(resultStr) || (result.latency ? String(result.latency) : 'N/A');

        logStep({
          phase: 'test_result',
          iteration,
          path: testPath,
          method: testMethod,
          status: testStatus,
          latency: testLatency,
          success: result.success,
          os
        });

        // Update discovered endpoint with test result
        const epIdx = discoveredEndpoints.findIndex(e => testPath.includes(e.path));
        if (epIdx !== -1) {
          discoveredEndpoints[epIdx].status = testStatus;
          discoveredEndpoints[epIdx].latency = testLatency;
        }
      }

      prompt = buildAppAuditPrompt(userInput, os, history, discoveredEndpoints, detectedPort);
    } else {
      logStep({ phase: 'invalid', iteration, os });
      prompt += `\nINVALID RESPONSE. You must output a valid JSON command or the final app_report.`;
    }
  }

  // === FALLBACK CONCLUSION when LLM exhausts iterations ===
  if (!conclusion && iteration >= maxIterations) {
    conclusion = {
      port: detectedPort || 'Unknown',
      endpoints: discoveredEndpoints.length > 0 ? discoveredEndpoints : [],
      summary: `Audit completed after ${maxIterations} iterations. ${discoveredEndpoints.length} endpoint(s) discovered${detectedPort ? ` on port ${detectedPort}` : ''}.`
    };
    logStep({ phase: 'conclusion', iteration, conclusion, os });
  }

  // Generate detailed table for report
  if (conclusion && conclusion.endpoints && conclusion.endpoints.length > 0) {
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
        status: e.status || 'Pending',
        latency: e.latency || 'N/A'
      }))
    });
  }

  return { conclusion, iterations: iteration, history };
}

/**
 * Extract a meaningful insight from the result of a command
 */
function extractInsight(action, target, result) {
  const basename = target ? target.replace(/\\/g, '/').split('/').pop() : '';
  
  if (action === 'list_dir') {
    const dirCount = (result.match(/\[DIR\]/g) || []).length;
    const lines = result.split('\n').filter(l => l.trim() && !l.includes('[Directory Listing'));
    const fileCount = lines.length - dirCount;
    const items = lines.map(l => l.replace(/\[DIR\]/, '').trim()).filter(Boolean);
    const notable = items.slice(0, 5).join(', ');
    return `Found ${dirCount} dirs, ${fileCount} files → ${notable}${items.length > 5 ? '...' : ''}`;
  }
  
  if (action === 'read_file') {
    const portMatch = result.match(/(?:PORT|port)\s*[=:]\s*(\d+)/);
    const routeMatches = result.match(/\.(get|post|put|delete|patch|all|use)\s*\(\s*['"`]([^'"`]+)['"`]/gi) || [];
    const expressMatch = result.includes('express') || result.includes('fastify') || result.includes('koa');
    
    let insight = '';
    if (portMatch) insight += `Port detected: ${portMatch[1]}. `;
    if (routeMatches.length > 0) insight += `${routeMatches.length} route(s) found. `;
    if (expressMatch) insight += 'Express/framework detected. ';
    if (result.includes('mongoose') || result.includes('sequelize') || result.includes('prisma')) insight += 'Database ORM detected. ';
    if (result.includes('jwt') || result.includes('auth') || result.includes('passport')) insight += 'Auth middleware detected. ';
    
    if (!insight) {
      const lineCount = result.split('\n').length;
      insight = `Read ${lineCount} lines from ${basename || 'file'}`;
    }
    return insight.trim();
  }
  
  if (action === 'analyze_file') {
    const typeMatch = result.match(/Type:\s*(.+)/);
    const sizeMatch = result.match(/Size:\s*(.+)/);
    const type = typeMatch ? typeMatch[1].trim() : 'Unknown';
    const size = sizeMatch ? sizeMatch[1].trim() : '';
    return `${type}${size ? ` (${size})` : ''} — ${basename}`;
  }

  if (action === 'test_endpoint') {
    const statusMatch = result.match(/Status:\s*(.+)/);
    const latencyMatch = result.match(/Latency:\s*(.+)/);
    return `${statusMatch ? statusMatch[1].trim() : 'Tested'} ${latencyMatch ? '(' + latencyMatch[1].trim() + ')' : ''}`.trim();
  }

  return result.substring(0, 100).replace(/\n/g, ' ').trim() || 'Processed.';
}

/**
 * Try to extract endpoints/routes from file content
 */
function extractEndpointsFromResult(result, target) {
  const endpoints = [];
  const sourceFile = target ? target.replace(/\\/g, '/').split('/').pop() : 'source';
  
  // Express-style: app.get('/path', ...) or router.get('/path', ...)
  const routeRegex = /(?:app|router)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match;
  while ((match = routeRegex.exec(result)) !== null) {
    if (!endpoints.find(e => e.path === match[2] && e.method === match[1].toUpperCase())) {
      endpoints.push({
        method: match[1].toUpperCase(),
        path: match[2],
        description: `Route from ${sourceFile}`,
        status: 'Pending',
        latency: 'N/A'
      });
    }
  }

  // app.use('/prefix', routerModule) patterns — capture the mount prefix
  const useRegex = /app\s*\.\s*use\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((match = useRegex.exec(result)) !== null) {
    const mountPath = match[1];
    // Only add if it looks like an API path (not middleware)
    if (mountPath.startsWith('/api') || mountPath.startsWith('/auth') || mountPath.startsWith('/v')) {
      if (!endpoints.find(e => e.path === mountPath)) {
        endpoints.push({
          method: 'GET',
          path: mountPath,
          description: `Mount prefix from ${sourceFile}`,
          status: 'Pending',
          latency: 'N/A'
        });
      }
    }
  }
  
  return endpoints;
}

/**
 * Extract HTTP status code from response text
 */
function extractStatusCode(result) {
  const match = result.match(/Status:\s*(\d{3}\s*\w*)/i) || result.match(/(\d{3})\s*(OK|Created|Not Found|Unauthorized|Forbidden|Internal Server Error|Bad Request)?/i);
  if (match) return match[1] ? match[1].trim() : match[0].trim();
  if (result.toLowerCase().includes('success') || result.toLowerCase().includes('ok')) return '200 OK';
  if (result.toLowerCase().includes('not found') || result.toLowerCase().includes('404')) return '404';
  if (result.toLowerCase().includes('error') || result.toLowerCase().includes('fail')) return 'ERROR';
  return 'Unknown';
}

/**
 * Extract latency from response text
 */
function extractLatency(result) {
  const match = result.match(/Latency:\s*(\d+\s*m?s)/i) || result.match(/(\d+)\s*ms/);
  return match ? match[1].trim() : 'N/A';
}

function buildAppAuditPrompt(userInput, os, history = [], discoveredEndpoints = [], detectedPort = null) {
  let prompt = `You are Heeba running a PROJECT ENDPOINT AUDIT. You are in a RECURSIVE AGENT LOOP.\n\n`;
  prompt += `GOAL: Analyze the project, find its running port, discover all API endpoints/routes, and test them.\n\n`;
  prompt += `CRITICAL RULES:\n`;
  prompt += `1. You MUST output ONLY a JSON object. NO explanatory text, NO markdown.\n`;
  prompt += `2. For discovery: use list_dir, read_file to find routes and port.\n`;
  prompt += `3. NEVER re-read a file you already read. Move on to the next file.\n`;
  prompt += `4. For testing endpoints: use test_endpoint with the full URL.\n`;
  prompt += `5. Available tools: list_dir, read_file, analyze_file, test_endpoint\n\n`;
  
  prompt += `TOOL FORMATS:\n`;
  prompt += `  list_dir:      {"action": "list_dir", "parameters": {"path": "/full/path"}, "reason": "why", "target": "/full/path"}\n`;
  prompt += `  read_file:     {"action": "read_file", "parameters": {"path": "/full/path/file.js"}, "reason": "why", "target": "/full/path/file.js"}\n`;
  prompt += `  test_endpoint: {"action": "test_endpoint", "parameters": {"url": "http://localhost:PORT/path", "method": "GET"}, "reason": "why", "target": "http://localhost:PORT/path"}\n\n`;
  
  prompt += `WORKFLOW:\n`;
  prompt += `  Step 1: list_dir to see project structure\n`;
  prompt += `  Step 2: read_file on config/.env/main files to find PORT\n`;
  prompt += `  Step 3: read_file on route files to find API endpoints\n`;
  prompt += `  Step 4: test_endpoint on each discovered endpoint using http://localhost:PORT/path\n`;
  prompt += `  Step 5: Output final app_report with all results\n\n`;
  
  prompt += `FINAL REPORT FORMAT (output this when all testing is done):\n`;
  prompt += `{"app_report": {"port": 3000, "endpoints": [{"path": "/api/users", "method": "GET", "description": "List users", "status": "200 OK", "latency": "45ms"}], "summary": "brief summary"}}\n\n`;
  
  prompt += `USER REQUEST: ${userInput}\n\n`;

  // Show what we already know
  if (detectedPort) {
    prompt += `DETECTED PORT: ${detectedPort}\n\n`;
  }
  
  if (discoveredEndpoints.length > 0) {
    prompt += `DISCOVERED ENDPOINTS SO FAR:\n`;
    discoveredEndpoints.forEach(ep => {
      prompt += `  [${ep.method}] ${ep.path} — Status: ${ep.status || 'Pending'}\n`;
    });
    prompt += `\n`;
    
    // If we have port and endpoints but none are tested, nudge toward testing
    const untestedCount = discoveredEndpoints.filter(e => e.status === 'Pending').length;
    if (detectedPort && untestedCount > 0) {
      prompt += `ACTION NEEDED: You have ${untestedCount} untested endpoint(s) and the port is ${detectedPort}. Use test_endpoint to test them NOW.\n\n`;
    }
  }

  if (history.length > 0) {
    prompt += `COMMAND HISTORY:\n`;
    for (const h of history) {
      // Give the LLM more context from file reads (1500 chars instead of 500)
      const resultSnippet = String(h.result).substring(0, 1500);
      prompt += `Action: ${h.action}\nTarget: ${h.target || 'N/A'}\nResult: ${resultSnippet}\n\n`;
    }
  }
  return prompt;
}

// No local parseCommandFromResponse here anymore

function printAppAuditStep(step, isTUI, silent = false) {
  const C = '\x1b[36m';   // Cyan
  const G = '\x1b[32m';   // Green
  const Y = '\x1b[33m';   // Yellow
  const M = '\x1b[35m';   // Magenta
  const R = '\x1b[31m';   // Red
  const D = '\x1b[90m';   // Dim/Gray
  const W = '\x1b[37m';   // White
  const B = '\x1b[1m';    // Bold
  const RST = '\x1b[0m';
  
  const lines = [];
  const out = (m) => { lines.push(m); if (!silent) isTUI ? process.stdout.write(m + '\n') : console.log(m); };

  switch(step.phase) {
    case 'setup': 
      out(`\n  ${C}◈ HEEBA APP AUDITOR${RST}`);
      out(`  ${D}└─ Starting recursive project analysis...${RST}`);
      out(`  ${D}   Target: ${W}${step.userInput?.substring(0, 80) || 'Project'}${RST}`);
      out('');
      break;

    case 'executing': {
      const icon = step.isTestAction ? '🧪' : '📂';
      const actionLabel = step.isTestAction ? `${Y}Testing${RST}` : `${C}${step.action}${RST}`;
      const targetDisplay = step.target ? formatPath(step.target) : '';
      
      out(`  ${D}├─ [Step ${step.iteration}]${RST} ${icon} ${actionLabel}`);
      if (targetDisplay) {
        out(`  ${D}│  ├─ Path:${RST} ${W}${targetDisplay}${RST}`);
      }
      if (step.reason) {
        out(`  ${D}│  ├─ Why:${RST}  ${D}${step.reason}${RST}`);
      }
      break;
    }

    case 'skipped_duplicate': {
      const targetDisplay = step.target ? formatPath(step.target) : '';
      out(`  ${D}├─ [Step ${step.iteration}]${RST} ${Y}⟲ Skipped${RST} ${D}(already read)${RST}`);
      if (targetDisplay) {
        out(`  ${D}│  └─ ${targetDisplay}${RST}`);
      }
      out('');
      break;
    }

    case 'insight': {
      const insightText = step.insight || 'Analysis complete.';
      out(`  ${D}│  └─ ${G}▸ ${insightText}${RST}`);
      if (step.discoveredEndpoints > 0) {
        out(`  ${D}│     ${M}⎆ ${step.discoveredEndpoints} endpoint(s) discovered so far${RST}`);
      }
      out('');
      break;
    }

    case 'endpoints_discovered': {
      out(`  ${D}├─────────────────────────────────────────────────────────────${RST}`);
      out(`  ${D}│${RST}  ${M}${B}⎆ API Endpoints Discovered (${step.endpoints.length} total)${RST}`);
      out(`  ${D}│${RST}`);
      
      const methodW = 8;
      const pathW = 30;
      const statusW = 12;
      const headerLine = `  ${D}│${RST}  ${D}${'─'.repeat(methodW + pathW + statusW + 8)}${RST}`;
      out(headerLine);
      out(`  ${D}│${RST}  ${B}${padStr('Method', methodW)}${padStr('Path', pathW)}${padStr('Status', statusW)}${RST}`);
      out(headerLine);
      
      step.endpoints.forEach(ep => {
        const methodColor = ep.method === 'GET' ? G : ep.method === 'POST' ? Y : ep.method === 'DELETE' ? R : C;
        const statusColor = ep.status === 'Pending' ? D : (ep.status?.startsWith('2') ? G : R);
        out(`  ${D}│${RST}  ${methodColor}${padStr(ep.method, methodW)}${RST}${padStr(ep.path, pathW)}${statusColor}${padStr(ep.status || 'Pending', statusW)}${RST}`);
      });
      
      out(headerLine);
      out(`  ${D}├─────────────────────────────────────────────────────────────${RST}`);
      out('');
      break;
    }

    case 'test_result': {
      const statusIcon = step.success ? `${G}✓${RST}` : `${R}✗${RST}`;
      const statusColor = step.status?.startsWith('2') ? G : (step.status === 'FAIL' || step.status === 'ERROR' ? R : Y);
      out(`  ${D}│  └─${RST} ${statusIcon} ${B}[${step.method}]${RST} ${step.path} → ${statusColor}${step.status}${RST} ${D}(${step.latency})${RST}`);
      out('');
      break;
    }

    case 'begin':
      break;

    case 'invalid':
      out(`  ${D}├─ ${R}⚠ Model returned invalid response, retrying...${RST}`);
      out('');
      break;

    case 'conclusion': {
      out('');
      out(`  ${D}╔════════════════════════════════════════════════════════╗${RST}`);
      out(`  ${D}║${RST}  ${G}${B}✓ APP AUDIT COMPLETE${RST}                                ${D}║${RST}`);
      out(`  ${D}╚════════════════════════════════════════════════════════╝${RST}`);
      out('');
      
      if (step.conclusion.port) {
        out(`  ${Y}◈ Server Port:${RST}  ${W}${step.conclusion.port}${RST}`);
      }
      
      const epCount = step.conclusion.endpoints?.length || 0;
      out(`  ${Y}◈ Endpoints:${RST}    ${W}${epCount} discovered${RST}`);
      
      if (step.conclusion.endpoints && step.conclusion.endpoints.length > 0) {
        out('');
        out(`  ${D}┌──────────┬────────────────────────────────┬──────────┬──────────┐${RST}`);
        out(`  ${D}│${RST} ${B}${padStr('Method', 9)}${D}│${RST} ${B}${padStr('Endpoint', 31)}${D}│${RST} ${B}${padStr('Status', 9)}${D}│${RST} ${B}${padStr('Latency', 9)}${D}│${RST}`);
        out(`  ${D}├──────────┼────────────────────────────────┼──────────┼──────────┤${RST}`);
        
        step.conclusion.endpoints.forEach(ep => {
          const m = ep.method || 'GET';
          const methodColor = m === 'GET' ? G : m === 'POST' ? Y : m === 'DELETE' ? R : C;
          const statusColor = ep.status?.startsWith('2') ? G : (ep.status === 'FAIL' || ep.status === 'ERROR' ? R : Y);
          out(`  ${D}│${RST} ${methodColor}${padStr(m, 9)}${D}│${RST} ${padStr(ep.path || '', 31)}${D}│${RST} ${statusColor}${padStr(ep.status || 'N/A', 9)}${RST}${D}│${RST} ${padStr(ep.latency || 'N/A', 9)}${D}│${RST}`);
        });
        
        out(`  ${D}└──────────┴────────────────────────────────┴──────────┴──────────┘${RST}`);
      }
      
      if (step.conclusion.summary) {
        out('');
        out(`  ${Y}◈ Summary:${RST}`);
        out(`  ${D}  ${step.conclusion.summary}${RST}`);
      }
      out('');
      break;
    }
  }
  return lines;
}

/**
 * Format a file path for display — show last 2-3 segments for readability
 */
function formatPath(fullPath) {
  if (!fullPath) return '';
  const normalized = fullPath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 3) return normalized;
  return '.../' + parts.slice(-3).join('/');
}

/**
 * Pad string to width
 */
function padStr(str, width) {
  const s = String(str || '');
  if (s.length >= width) return s.substring(0, width);
  return s + ' '.repeat(width - s.length);
}

module.exports = {
  runAppAuditLoop,
  printAppAuditStep
};
