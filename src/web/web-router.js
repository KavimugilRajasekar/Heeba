// src/web/web-router.js
// Routes WebSocket and HTTP requests to core modules.

const { queryLLM, getTotalTokensUsed } = require('../core/engine');
const { 
  parseCommandFromResponse, 
  executeCommand,
  isSecurityIntentTriggered,
  runSecurityAuditLoop,
  isAppAuditIntentTriggered,
  runAppAuditLoop,
  extractEmailFromPrompt,
  printAuditStep,
  printAppAuditStep,
  runAgenticLoop
} = require('../core/intent-executor');
const { state, getPathToPage, estimateTokens, deletePage, saveSessions } = require('../core/state-manager');
const { getAllModels } = require('../core/model-registry');
const { loadHeebaConfig } = require('../core/config-loader');
const { getBridgeData, createBridge, navigateBranch, switchToSession, switchToPage, removeBridge } = require('./session-bridge');
const { MODES } = require('../utils/helpers');
const Formatter = require('../utils/formatter');

let wss = null; // WebSocket server reference for broadcasting

function setWebSocketServer(server) {
  wss = server;
}

// Broadcast state update to all connected clients
function broadcastStateUpdate(tabId, updateType, data) {
  if (!wss) return;
  const message = JSON.stringify({ type: updateType, tabId, data });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

// Build context for intent executor (same shape as TUI uses)
function buildContext(tabId) {
  const bridge = createBridge(tabId);
  const bridgeData = getBridgeData(tabId);

  let currentSession = null;
  let currentPage = null;

  if (bridgeData && bridgeData.sessionIndex >= 0) {
    currentSession = state.sessions[bridgeData.sessionIndex] || null;
  }
  if (currentSession && bridgeData && bridgeData.pageId) {
    currentPage = currentSession.pages[bridgeData.pageId] || null;
  }

  return {
    screen: null,
    UI: null,
    config: state.CONFIG,
    currentSession,
    currentPage,
    onSessionRenamed: (newName) => broadcastStateUpdate(tabId, 'session_renamed', { name: newName }),
    onConversationRenamed: (newTitle) => broadcastStateUpdate(tabId, 'conversation_renamed', { title: newTitle }),
    onSessionDeleted: () => {
      broadcastStateUpdate(tabId, 'session_deleted', {});
    },
    onPageDeleted: (newPageId) => {
      broadcastStateUpdate(tabId, 'page_deleted', { newPageId });
    }
  };
}

// Process a prompt from the web UI
async function processPrompt(tabId, userInput, ws) {
  // Ensure bridge exists
  createBridge(tabId);
  const bridgeData = getBridgeData(tabId);

  // Set current mode and context for this request
  const sessionIndex = bridgeData ? bridgeData.sessionIndex : -1;
  const pageId = bridgeData ? bridgeData.pageId : null;

  // Set state to match this tab's context
  if (sessionIndex >= 0) {
    state.currentSessionIndex = sessionIndex;
  }
  if (pageId) {
    state.currentPageId = pageId;
  }

  // Create or find session
  let session;
  if (state.currentSessionIndex < 0 || state.currentSessionIndex >= state.sessions.length) {
    session = {
      id: Date.now().toString(36),
      name: null,
      pages: {},
      rootPageId: null,
      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
    state.sessions.push(session);
    state.currentSessionIndex = state.sessions.length - 1;

    // Update bridge
    switchToSession(tabId, state.currentSessionIndex);
    saveSessions();
  } else {
    session = state.sessions[state.currentSessionIndex];
  }

  const newPageId = Math.random().toString(36).substring(2, 9);
  const newPage = {
    id: newPageId,
    prompt: userInput,
    response: '',
    parentId: state.currentPageId,
    children: [],
    createdAt: Date.now(),
    _streaming: true
  };

  session.pages[newPageId] = newPage;
  if (!session.rootPageId) session.rootPageId = newPageId;
  else if (state.currentPageId && session.pages[state.currentPageId]) {
    session.pages[state.currentPageId].children.push(newPageId);
  }

  state.currentPageId = newPageId;
  session.lastUpdated = Date.now();

  // Build history
  const historyPath = getPathToPage(session, newPage.parentId);
  const llmHistory = historyPath.map(p => ({ user: p.prompt, assistant: p.response }));

  // Send initial page info
  ws.send(JSON.stringify({
    type: 'page_started',
    data: {
      pageId: newPageId,
      prompt: userInput,
      sessionIndex: state.currentSessionIndex
    }
  }));

  // Check for security audit intent FIRST
  const intentRules = state.CONFIG.intent_routing_rules || {};
  if (isSecurityIntentTriggered(userInput, intentRules)) {
    try {
      const emailTo = extractEmailFromPrompt(userInput);
      const auditResult = await runSecurityAuditLoop(
        userInput,
        (p, mode) => queryLLM(p, mode, state.CONFIG, null),
        15,
        {
          isTUI: false,
          emailTo,
          onStep: (step) => {
            const lines = printAuditStep(step, false, true); // silent=true
            const stepHtml = Formatter.toHtml(lines.join('\n'));
            ws.send(JSON.stringify({
              type: 'token',
              data: { token: `\n\n${stepHtml}`, pageId: newPageId }
            }));
          }
        }
      );

      newPage._streaming = false;
      let summary = `\n\n---\n√ Security Audit Completed\n`;
      if (auditResult.conclusion) {
        summary += `\nScore: **${auditResult.conclusion.security_score}**\n`;
        if (auditResult.conclusion.findings) {
          summary += `\nFindings:\n` + auditResult.conclusion.findings.map(f => `- ${f}`).join('\n');
        }
      }
      newPage.response = summary;
      
      ws.send(JSON.stringify({
        type: 'page_done',
        data: {
          pageId: newPageId,
          response: newPage.response,
          tokens: estimateTokens(newPage.prompt + newPage.response)
        }
      }));
      return;
    } catch (e) {
      console.error('Web Audit Error:', e);
      ws.send(JSON.stringify({ type: 'error', data: { message: e.message, pageId: newPageId } }));
      return;
    }
  }

  // Check for app audit intent
  if (isAppAuditIntentTriggered(userInput, intentRules)) {
    try {
      const auditResult = await runAppAuditLoop(
        userInput,
        (p, mode) => queryLLM(p, mode, state.CONFIG, null),
        15,
        {
          isTUI: false,
          onStep: (step) => {
            const lines = printAppAuditStep(step, false, true); // silent=true
            const stepHtml = Formatter.toHtml(lines.join('\n'));
            ws.send(JSON.stringify({
              type: 'token',
              data: { token: `\n\n${stepHtml}`, pageId: newPageId }
            }));
          }
        }
      );

      newPage._streaming = false;
      let summary = `\n\n---\n√ App Audit Completed\n`;
      if (auditResult.conclusion) {
        summary += `\nPort: **${auditResult.conclusion.port}**\n`;
        if (auditResult.conclusion.detailed_table) {
          summary += `\n${auditResult.conclusion.detailed_table}\n`;
        } else if (auditResult.conclusion.endpoints) {
          summary += `\nEndpoints:\n` + auditResult.conclusion.endpoints.map(e => `- [${e.method}] ${e.path} -> ${e.status}`).join('\n');
        }
        if (auditResult.conclusion.summary) {
          summary += `\nSummary: ${auditResult.conclusion.summary}\n`;
        }
      }
      newPage.response = summary;

      ws.send(JSON.stringify({
        type: 'page_done',
        data: {
          pageId: newPageId,
          response: newPage.response,
          tokens: estimateTokens(newPage.prompt + newPage.response)
        }
      }));
      return;
    } catch (e) {
      console.error('Web App Audit Error:', e);
      ws.send(JSON.stringify({ type: 'error', data: { message: e.message, pageId: newPageId } }));
      return;
    }
  }

  try {
    const agentResult = await runAgenticLoop(
      userInput,
      (p, mode) => queryLLM(p, mode, state.CONFIG, null, llmHistory),
      5,
      {
        context: buildContext(tabId),
        onStep: (step) => {
          if (step.phase === 'planning') {
            ws.send(JSON.stringify({
              type: 'token',
              data: { token: `\n\n\x1b[90m◈ Designing strategic plan...\x1b[0m\n`, pageId: newPageId }
            }));
          } else if (step.phase === 'plan_ready') {
            let planMsg = `\n\x1b[33m◈ HEEBA'S ROADMAP:\x1b[0m\n`;
            step.plan.forEach((s, i) => {
              planMsg += `  ${i + 1}. ${s}\n`;
            });
            planMsg += `\x1b[90m${'─'.repeat(30)}\x1b[0m\n`;
            ws.send(JSON.stringify({
              type: 'token',
              data: { token: planMsg, pageId: newPageId }
            }));
          } else if (step.phase === 'executing') {
            ws.send(JSON.stringify({
              type: 'token',
              data: { token: `\n◈ [Step ${step.iteration}] ${step.stepTitle} → action: ${step.action}...\n`, pageId: newPageId }
            }));
          } else if (step.phase === 'result') {
            const icon = step.success ? '✔' : '✘';
            ws.send(JSON.stringify({
              type: 'token',
              data: { token: `${icon} ${step.result.split('\n')[0]}\n`, pageId: newPageId }
            }));
          }
        }
      }
    );

    newPage._streaming = false;
    newPage.response = agentResult.finalResponse;
    newPage.tokens = estimateTokens(newPage.prompt + newPage.response);

    ws.send(JSON.stringify({
      type: 'page_done',
      data: {
        pageId: newPageId,
        response: newPage.response,
        tokens: newPage.tokens,
        title: newPage.title
      }
    }));

    // Broadcast updated state to all clients
    broadcastStateUpdate(tabId, 'state_updated', getBridgeData(tabId));

  } catch (err) {
    newPage._streaming = false;
    newPage.response = `LLM Error: ${err.message}`;
    ws.send(JSON.stringify({
      type: 'error',
      data: { message: err.message, pageId: newPageId }
    }));
  }
}

// Handle WebSocket connections
function handleWebSocketConnection(ws) {
  let tabId = null;

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'init': {
          tabId = msg.tabId;
          createBridge(tabId);
          const bridgeData = getBridgeData(tabId);
          ws.send(JSON.stringify({
            type: 'init_ack',
            data: { tabId, bridgeData, config: state.CONFIG }
          }));
          break;
        }

        case 'prompt': {
          if (tabId && msg.prompt) {
            await processPrompt(tabId, msg.prompt, ws);
          }
          break;
        }

        case 'cancel': {
          cancelLLM();
          break;
        }

        case 'navigate': {
          if (tabId && msg.direction) {
            const result = navigateBranch(tabId, msg.direction);
            ws.send(JSON.stringify({
              type: 'navigate_ack',
              data: result
            }));
          }
          break;
        }

        case 'switch_session': {
          if (tabId && typeof msg.sessionIndex === 'number') {
            const result = switchToSession(tabId, msg.sessionIndex);
            ws.send(JSON.stringify({
              type: 'switch_session_ack',
              data: result
            }));
          }
          break;
        }

        case 'switch_page': {
          if (tabId && msg.pageId) {
            const result = switchToPage(tabId, msg.pageId);
            ws.send(JSON.stringify({
              type: 'switch_page_ack',
              data: result
            }));
          }
          break;
        }

        case 'get_state': {
          if (tabId) {
            ws.send(JSON.stringify({
              type: 'state_data',
              data: getBridgeData(tabId)
            }));
          }
          break;
        }

        case 'get_models': {
          ws.send(JSON.stringify({
            type: 'models_data',
            data: getAllModels()
          }));
          break;
        }

        case 'set_model': {
          if (msg.model) {
            state.CONFIG.model = msg.model;
            ws.send(JSON.stringify({
              type: 'model_set',
              data: { model: msg.model }
            }));
          }
          break;
        }

        case 'rename_session': {
          if (tabId && msg.name) {
            const bridgeData = getBridgeData(tabId);
            if (bridgeData && bridgeData.sessionIndex >= 0) {
              const session = state.sessions[bridgeData.sessionIndex];
              if (session) {
                session.name = msg.name;
                broadcastStateUpdate(tabId, 'session_renamed', { name: msg.name });
              }
            }
          }
          break;
        }

        case 'delete_session': {
          if (tabId && msg.sessionId) {
            const idx = state.sessions.findIndex(s => s.id === msg.sessionId);
            if (idx >= 0) {
              state.sessions.splice(idx, 1);
              if (state.currentSessionIndex >= state.sessions.length) {
                state.currentSessionIndex = state.sessions.length - 1;
              }
              saveSessions();
              switchToSession(tabId, state.currentSessionIndex >= 0 ? state.currentSessionIndex : 0);
              broadcastStateUpdate(tabId, 'session_deleted', { sessionId: msg.sessionId });
            }
          }
          break;
        }

        case 'delete_page': {
          if (tabId && msg.pageId) {
            const bridgeData = getBridgeData(tabId);
            if (bridgeData && bridgeData.sessionIndex >= 0) {
              const session = state.sessions[bridgeData.sessionIndex];
              if (session) {
                const newPageId = session.pages[msg.pageId]?.parentId || null;
                deletePage(session, msg.pageId, msg.scope || 'current');
                saveSessions();
                switchToPage(tabId, newPageId);
                broadcastStateUpdate(tabId, 'page_deleted', { newPageId });
              }
            }
          }
          break;
        }

        case 'get_stats': {
          const mem = process.memoryUsage();
          const ramMB = Math.round(mem.rss / 1024 / 1024);
          const uptime = Math.floor(process.uptime());
          const tokens = getTotalTokensUsed();
          ws.send(JSON.stringify({
            type: 'stats_data',
            data: { ramMB, uptime, tokens }
          }));
          break;
        }
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', data: { message: err.message } }));
    }
  });

  ws.on('close', () => {
    if (tabId) {
      removeBridge(tabId);
    }
  });
}

// HTTP API handlers (for REST endpoints)
function handleApiRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/models' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAllModels()));
    return;
  }

  if (url.pathname === '/api/session' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: state.sessions }));
    return;
  }

  if (url.pathname === '/api/stats' && req.method === 'GET') {
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ramMB: Math.round(mem.rss / 1024 / 1024),
      uptime: Math.floor(process.uptime()),
      tokens: getTotalTokensUsed()
    }));
    return;
  }

  // 404 for unknown routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
}

module.exports = {
  handleWebSocketConnection,
  handleApiRequest,
  setWebSocketServer
};
