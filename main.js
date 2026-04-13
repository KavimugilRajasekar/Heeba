#!/usr/bin/env node
const os = require('os');
const blessed = require('blessed');
const logger = require('./src/utils/logger');

// Modules
const { state, estimateTokens, getPathToPage, deletePage, loadSessions, saveSessions } = require('./src/core/state-manager');
const { DEFAULT_CONFIG, getAvailableModels } = require('./src/core/config');
const { getAllModels, isOnlineModel } = require('./src/core/model-registry');
const { loadHeebaConfig } = require('./src/core/config-loader');
const { initScreen, createUI } = require('./src/ui/components');
const { createOverlays, runBootSequence, startLoadingAnimation } = require('./src/ui/animations');
const { requestRender, forceRender } = require('./src/ui/render-manager');
const { requestScroll } = require('./src/ui/scroll-manager');
const { queryLLM, cancelLLM, clearConversationHistory, stopServer, generateTurnTitle, getTotalTokensUsed } = require('./src/core/engine');
const { parseCommandFromResponse, executeCommand, isSecurityIntentTriggered, runSecurityAuditLoop, extractEmailFromPrompt, isAppAuditIntentTriggered, runAppAuditLoop, printAppAuditStep, runAgenticLoop } = require('./src/core/intent-executor');
const { refreshStats } = require('./src/utils/stats-refresher');
const {
  updateWelcomeCard, renderActivePage, showLoading, navigateToPage,
  openModelSelection, closeModelSelection, openPageList, closePageList,
  startNewSession, startSessionHeaderAnimation, stopSessionHeaderAnimation,
  startRootIconAnimation, stopRootIconAnimation, renderIndexPage, updatePageIndicator,
  clearDynamicContent
} = require('./src/ui/layout-manager');
const { setupInputHandlers, resizeInput } = require('./src/ui/input-manager');
const { C } = require('./src/ui/theme');
const { MODES } = require('./src/utils/helpers');
const { renderMarkdown } = require('./src/ui/markdown-renderer');
const { launchTelegramMode } = require('./src/telegram/telegram-launcher');
const { launchWebMode } = require('./src/web/web-launcher');
const { printAuditStep } = require('./src/core/intent-executor');

const Formatter = require('./src/utils/formatter');

// Helper: Convert ANSI to Blessed tags
function ansiToBlessedTags(str) {
  return Formatter.ansiToBlessed(str);
}


// =============================================
// CLI Argument Parsing
// =============================================
const args = process.argv.slice(2);
const isVersion = args.includes('--version') || args.includes('-v');

// Model Listing Flags
const listAll = args.includes('--list-models');
const listOnline = args.includes('--list-online-models') || args.includes('list-online-models');
const listLocal = args.includes('--list-local-models');

const modelIdx = args.indexOf('--model') !== -1 ? args.indexOf('--model') : args.indexOf('-model');
const modelOverride = modelIdx !== -1 ? args[(modelIdx + 1)] : null;
const promptIdx = args.indexOf('-m') !== -1 ? args.indexOf('-m') : args.indexOf('--message');
const cliPrompt = promptIdx !== -1 ? args[(promptIdx + 1)] : null;
const sessionIdx = args.indexOf('--session') !== -1 ? args.indexOf('--session') : args.indexOf('-session');
const sessionId = sessionIdx !== -1 ? args[(sessionIdx + 1)] : null;
const showMetrics = args.includes('-M') || args.includes('--metrics');
const isLaunch = args.includes('--launch') || args.includes('-launch');
const isLaunchTele = args.includes('--launch-tele') || args.includes('-launch-tele');
const isLaunchWeb = args.includes('--launch-web') || args.includes('-launch-web');
const isHelp = args.includes('--help') || args.includes('-h');

// Web interface port
const portIdx = args.indexOf('-p') !== -1 ? args.indexOf('-p') : args.indexOf('--port');
const webPort = portIdx !== -1 ? parseInt(args[(portIdx + 1)], 10) : 7856;

// Telegram sub-flags
const teleListen = args.includes('-l');
const uidIdx = args.indexOf('-uid');
const teleUid = uidIdx !== -1 ? args[(uidIdx + 1)] : null;


// Helper to show CLI help
function showHelp() {
  const { version } = require('./package.json');
  console.log(`\x1b[36m
   __    __   _______  _______ .______      ___      
  |  |  |  | |   ____||   ____||   _  \\    /   \\     
  |  |__|  | |  |__   |  |__   |  |_)  |  /  ^  \\    
  |   __   | |   __|  |   __|  |   _  <  /  /_\\  \\   
  |  |  |  | |  |____ |  |____ |  |_)  |/  _____  \\  
  |__|  |__| |_______||_______||______//__/     \\__\\ 
                                                     \x1b[0m`);
  console.log(`\x1b[32m  Heeba Intelligence Engine (v${version})\x1b[0m`);
  console.log(`\x1b[90m  The Autonomous Agentic Assistant for your Terminal\x1b[0m\n`);

  console.log(`\x1b[1mUSAGE:\x1b[0m`);
  console.log(`  heeba [options]`);
  console.log(`  node main.js [options]\n`);

  console.log(`\x1b[1mOPTIONS:\x1b[0m`);
  console.log(`  \x1b[33m--launch\x1b[0m                    Start the Interactive Terminal UI (TUI)`);
  console.log(`  \x1b[33m--launch-web\x1b[0m                Start the Local Web Interface`);
  console.log(`  \x1b[33m-p <port>\x1b[0m                   Port for web interface (default: 7856)`);
  console.log(`  \x1b[33m--help, -h\x1b[0m                  Show this help information`);
  console.log(`  \x1b[33m--version, -v\x1b[0m               Show version number`);
  console.log(`  \x1b[33m-m "<prompt>"\x1b[0m               Execute a natural language query in stateless mode`);
  console.log(`  \x1b[33m-model "<name>"\x1b[0m             Override the default LLM for a query`);
  console.log(`  \x1b[33m--session "<id>"\x1b[0m            Resume or start a specific session for a CLI query`);
  console.log(`  \x1b[33m-M\x1b[0m                          Show performance metrics after CLI query`);
  console.log(`  \x1b[33m--list-models\x1b[0m               List all available models`);
  console.log(`  \x1b[33m--list-online-models\x1b[0m        List only online-based models`);
  console.log(`  \x1b[33m--list-local-models\x1b[0m         List only locally hosted models\n`);

  console.log(`\x1b[1mTELEGRAM INTERFACE:\x1b[0m`);
  console.log(`  \x1b[33m--launch-tele -l\x1b[0m            Listen mode — log /start users & their IDs`);
  console.log(`  \x1b[33m--launch-tele -uid <ID>\x1b[0m     Server mode — bind bot to a Telegram User ID`);
  console.log(`  \x1b[33m--launch-tele -model <M> -uid <ID>\x1b[0m  Server mode with model override\n`);

  console.log(`\x1b[1mEXAMPLES:\x1b[0m`);
  console.log(`  heeba --launch`);
  console.log(`  heeba --launch-web`);
  console.log(`  heeba --launch-web -p 9000`);
  console.log(`  heeba -m "Summarize my emails from this morning"`);
  console.log(`  heeba -m "Show my system status" -M`);
  console.log(`  heeba --launch-tele -l`);
  console.log(`  heeba --launch-tele -model ollama-gpt-oss -uid <YOUR_TELEGRAM_ID>\n`);

  process.exit(0);
}

if (isHelp || (args.length === 0)) {
  showHelp();
}

if (isVersion) {
  const { version } = require('./package.json');
  console.log(`heeba v${version}`);
  process.exit(0);
}

// Handle Model Listing
if (listAll || listOnline || listLocal) {
  const allModels = getAllModels();
  let filtered = allModels;
  let title = "All Available Models";

  if (listOnline) {
    filtered = allModels.filter(m => isOnlineModel(m));
    title = "Online Models";
  } else if (listLocal) {
    filtered = allModels.filter(m => !isOnlineModel(m));
    title = "Local Models";
  }

  console.log(`\n\x1b[36m◈ Heeba Model Registry: ${title}\x1b[0m`);
  console.log(`\x1b[90m${'─'.repeat(40)}\x1b[0m`);
  
  if (filtered.length === 0) {
    console.log(`  (No models found matching criteria)`);
  } else {
    filtered.forEach((m, i) => {
      const type = isOnlineModel(m) ? '\x1b[33m[Online]\x1b[0m' : '\x1b[32m[Local]\x1b[0m';
      console.log(`  ${(i + 1).toString().padStart(2)}. ${type} ${m}`);
    });
  }
  
  console.log(`\x1b[90m${'─'.repeat(40)}\x1b[0m\n`);
  process.exit(0);
}

// Load config
const heebaConfig = loadHeebaConfig();
Object.assign(state.CONFIG, heebaConfig);
logger.info('CONFIG', `Loaded heeba.json for user: ${heebaConfig.user_profile.name}`);

// Helper: Display CLI Metrics
function displayCLIMetrics() {
  const totalTokens = getTotalTokensUsed();
  const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
  console.log(`\n\x1b[90m${'─'.repeat(40)}\x1b[0m`);
  console.log(`\x1b[33mMetrics:\x1b[0m`);
  console.log(`  ◈ Tokens Used: ${totalTokens}`);
  console.log(`  ◈ Free RAM: ${freeMem} GB`);
  console.log(`  ◈ Model: ${state.CONFIG.model}`);
  console.log(`\x1b[90m${'─'.repeat(40)}\x1b[0m`);
}

// =============================================
// Stateless CLI Mode Logic
// =============================================
async function runStateless(prompt, model) {
  console.log(`\x1b[36m◈ Heeba Stateless Mode\x1b[0m`);
  if (model) {
    state.CONFIG.model = model;
    console.log(`\x1b[90mModel Override: ${model}\x1b[0m`);
  }
  console.log(`\x1b[90mQuery: "${prompt}"\x1b[0m\n`);

  // Check if this is a security audit intent
  const intentRules = heebaConfig.intent_routing_rules || {};
  if (isSecurityIntentTriggered(prompt, intentRules)) {
    console.log(`\x1b[35m⁜ Security Audit Mode Activated\x1b[0m\n`);
    const emailTo = extractEmailFromPrompt(prompt);
    const auditResult = await runSecurityAuditLoop(
      prompt,
      (p, mode) => queryLLM(p, mode, state.CONFIG, null),
      15,
      { emailTo }
    );
    // Conclusion is already displayed by printAuditStep in the auditor
    if (!auditResult || !auditResult.conclusion) {
      console.log(`\x1b[31m[X] Security audit did not reach a conclusion.\x1b[0m`);
    }

    if (showMetrics) displayCLIMetrics();
    stopServer();
    process.exit(0);
  }

  // Check if this is an app audit intent
  if (isAppAuditIntentTriggered(prompt, intentRules)) {
    console.log(`\x1b[35m⁜ App Endpoint Audit Mode Activated\x1b[0m\n`);
    const auditResult = await runAppAuditLoop(
      prompt,
      (p, mode) => queryLLM(p, mode, state.CONFIG, null),
      15,
      { isTUI: false }
    );
    // Conclusion is already displayed by printAppAuditStep in the auditor
    if (!auditResult || !auditResult.conclusion) {
      console.log(`\x1b[31m[X] App audit did not reach a conclusion.\x1b[0m`);
    }

    if (showMetrics) displayCLIMetrics();
    stopServer();
    process.exit(0);
  }

  process.stdout.write(`\x1b[33m⁜ Heeba:\x1b[0m\n`);
  
  try {
    const agentResult = await runAgenticLoop(
      prompt,
      (p, mode) => queryLLM(p, mode, state.CONFIG, null),
      5,
      {
        context: { screen: null, UI: null, config: state.CONFIG },
        onStep: (step) => {
          if (step.phase === 'planning') {
            process.stdout.write(`\x1b[90m◈ Designing strategic plan...\x1b[0m\r`);
          } else if (step.phase === 'plan_ready') {
            const TreeReporter = require('./src/utils/tree-reporter');
            const tree = new TreeReporter('Strategic Roadmap', 'Front-loaded approach');
            step.plan.forEach((s, i) => tree.branch(`Step ${i + 1}`, s));
            
            const renderedLines = renderMarkdown(tree.toString(), process.stdout.columns || 80, false);
            process.stdout.write('\n');
            renderedLines.forEach(line => process.stdout.write(line.content + '\n'));
          } else if (step.phase === 'executing') {
            process.stdout.write(`\n\x1b[32m◈ [Step ${step.iteration}] ${step.stepTitle} → Action: ${step.action}...\x1b[0m\n`);
          } else if (step.phase === 'result') {
            if (step.success) {
               process.stdout.write(`\x1b[32m✔ ${step.result.split('\n')[0]}\x1b[0m\n`);
            } else {
               process.stdout.write(`\x1b[31m✘ Failed: ${step.result.split('\n')[0]}\x1b[0m\n`);
            }
          }
        }
      }
    );

    // Render the final response (the last text block from the LLM)
    const finalResponse = agentResult.finalResponse;
    const renderedLines = renderMarkdown(finalResponse, process.stdout.columns || 80, false);
    renderedLines.forEach(line => {
      process.stdout.write(line.content + '\n');
    });

    // Metrics
    if (showMetrics) displayCLIMetrics();

    stopServer();
    process.exit(0);
  } catch (err) {
    console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
    stopServer();
    process.exit(1);
  }
}

// Check if we should enter Web mode
if (isLaunchWeb) {
  launchWebMode(webPort);
} else
// Check if we should enter Telegram mode
if (isLaunchTele) {
  launchTelegramMode({
    listenOnly: teleListen,
    bindUid: teleUid,
    modelOverride: modelOverride
  });
} else if (cliPrompt) {
  runStateless(cliPrompt, modelOverride);
} else if (isLaunch) {

  // =============================================
  // Terminal UI Mode Logic
  // =============================================
  const screen = initScreen();
  const UI = createUI(screen);
  const overlays = createOverlays(UI.container);

  // Stats loop
  setInterval(() => refreshStats(UI, screen), 1000);

  // Cleanup
  let isExiting = false;
  function cleanupAndExit() {
    if (isExiting) return;
    isExiting = true;
    saveSessions();
    stopServer();
    process.exit(0);
  }
  process.on('SIGINT', cleanupAndExit);
  process.on('SIGTERM', cleanupAndExit);
  process.on('exit', () => stopServer());

  // Command Logic (TUI)
  async function processCommand(input) {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return '';

    if (trimmed === 'models' || trimmed === '[models]') { openModelSelection(UI); return ''; }
    if (trimmed === '[exit]') { cleanupAndExit(); return ''; }

    if (trimmed === '[delete page]') {
      const session = (state.currentSessionIndex >= 0 && state.currentSessionIndex < state.sessions.length)
          ? state.sessions[state.currentSessionIndex] : null;
      if (!session || !state.currentPageId) return 'No page to delete.';
      if (session.rootPageId === state.currentPageId) return 'Cannot delete the root page of a session.';

      const parentId = session.pages[state.currentPageId].parentId;
      deletePage(session, state.currentPageId, 'branch');
      state.currentPageId = parentId;
      state.userScrolledUp = false;
      saveSessions();
      renderActivePage(UI, screen, state);
      return '';
    }

    if (trimmed.startsWith('model ')) {
      const models = getAvailableModels();
      const sel = input.trim().substring(6).trim();
      if (!sel) return 'Usage: model <number|filename>';
      let newModel;
      const num = parseInt(sel);
      if (!isNaN(num) && num > 0 && num <= models.length) newModel = models[num - 1];
      else newModel = models.find(m => m.toLowerCase() === sel.toLowerCase());

      if (!newModel) {
        newModel = models.find(m => {
          const clean = m.split('(')[0].trim().toLowerCase();
          return clean === sel.toLowerCase();
        });
      }

      if (newModel) {
        state.CONFIG.model = newModel.split('(')[0].trim();
        clearConversationHistory();
        updateWelcomeCard(UI, screen, state);
        return `Model set to: ${state.CONFIG.model}`;
      }
      return `Model not found: ${sel}`;
    }

    // Session Workspace: Branching Tree Logic
    let session;
    if (state.currentSessionIndex === -1 || state.currentSessionIndex >= state.sessions.length) {
      session = { id: Date.now().toString(36), name: null, pages: {}, rootPageId: null, createdAt: Date.now(), lastUpdated: Date.now() };
      state.sessions.push(session);
      state.currentSessionIndex = state.sessions.length - 1;
      state.currentPageId = null;
      saveSessions();
    } else session = state.sessions[state.currentSessionIndex];

    const newPageId = Math.random().toString(36).substring(2, 9);
    const newPage = { id: newPageId, prompt: input, response: '', parentId: state.currentPageId, children: [], createdAt: Date.now(), _streaming: true };
    session.pages[newPageId] = newPage;
    if (!session.rootPageId) session.rootPageId = newPageId;
    else if (state.currentPageId && session.pages[state.currentPageId]) session.pages[state.currentPageId].children.push(newPageId);

    state.currentPageId = newPageId;
    session.lastUpdated = Date.now();
    state.userScrolledUp = false;

    const historyPath = getPathToPage(session, newPage.parentId);
    const llmHistory = historyPath.map(p => ({ user: p.prompt, assistant: p.response }));

    // Check for security audit intent
    const intentRules = state.CONFIG.intent_routing_rules || {};
    if (isSecurityIntentTriggered(input, intentRules)) {
      state.isProcessingCommand = true; // Set busy state immediately
      showLoading(UI, overlays, screen, state, false);
      
      const startMsg = `\n\x1b[35m  ⁜ Security Audit Mode Activated\x1b[0m`;
      blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: startMsg, fg: C.yellow });
      
      newPage.response = `━━━ SECURITY AUDIT INITIATED ━━━\n\n`;
      requestRender();

      try {
        const auditResult = await runSecurityAuditLoop(
          input,
          (p, mode) => queryLLM(p, mode, state.CONFIG, null),
          15,
          { 
            isTUI: false, 
            silent: true,
            emailTo: extractEmailFromPrompt(input),
            onStep: (step) => {
              const formattedLines = printAuditStep(step, false, true); // silent=true
              formattedLines.forEach(line => {
                const ansiLine = `  ${ansiToBlessedTags(line)}`;
                // Persist to page state
                newPage.response += line + '\n';
                
                // Live update the UI
                blessed.text({
                  parent: UI.outputArea,
                  top: state.lineCount++,
                  left: 0,
                  width: '100%',
                  content: ansiLine,
                  tags: true
                });
              });
              requestScroll();
              requestRender();
            }
          }
        );

        if (auditResult && auditResult.conclusion) {
          const c = auditResult.conclusion;
          newPage.response += `\n\n━━━ SECURITY AUDIT RESULTS ━━━\n`;
          newPage.response += `Score: ${c.security_score || 'Inconclusive'}\n\n`;
          if (c.findings && c.findings.length > 0) {
            newPage.response += `Findings:\n`;
            c.findings.forEach((f, i) => { newPage.response += `  ${i + 1}. ${f}\n`; });
            newPage.response += `\n`;
          }
          if (c.recommended_fixes && c.recommended_fixes.length > 0) {
            newPage.response += `Recommended Fixes:\n`;
            c.recommended_fixes.forEach((f, i) => { newPage.response += `  ${i + 1}. ${f}\n`; });
          }
          newPage.response += `\nAudit completed in ${auditResult.iterations} iterations.`;
        }
      } catch (err) {
        const errorMsg = `\n\x1b[31m  ! Audit Error: ${err.message}\x1b[0m`;
        blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: errorMsg });
        newPage.response += `\n\n[AUDIT FAILED]: ${err.message}`;
      } finally {
        renderActivePage(UI, screen, state);
        state.isProcessingCommand = false;
        setTimeout(() => { UI.inputBox.focus(); }, 30);
      }
      return;
    }

    // Check for app audit intent
    if (isAppAuditIntentTriggered(input, intentRules)) {
      state.isProcessingCommand = true; // Set busy state immediately
      showLoading(UI, overlays, screen, state, false);
      
      const startMsg = `\n\x1b[35m  ⁜ App Endpoint Audit Mode Activated\x1b[0m`;
      blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: startMsg, fg: C.yellow });
      
      newPage.response = `━━━ APP AUDIT INITIATED ━━━\n\n`;
      requestRender();

      try {
        const auditResult = await runAppAuditLoop(
          input,
          (p, mode) => queryLLM(p, mode, state.CONFIG, null),
          15,
          { 
            isTUI: true, 
            silent: true,
            onStep: (step) => {
               const lines = printAppAuditStep(step, true, true); // isTUI=true, silent=true
               lines.forEach(line => {
                  const ansiLine = `  ${ansiToBlessedTags(line)}`;
                  // Persist to page state
                  newPage.response += line + '\n';

                  // Live update the UI
                  blessed.text({
                    parent: UI.outputArea,
                    top: state.lineCount++,
                    left: 0,
                    width: '100%',
                    content: ansiLine,
                    tags: true
                  });
               });
               requestScroll();
               requestRender();
            }
          }
        );

        if (auditResult && auditResult.conclusion) {
          const c = auditResult.conclusion;
          newPage.response += `\n\n━━━ APP AUDIT RESULTS ━━━\n\n`;
          
          if (c.detailed_table) {
             newPage.response += c.detailed_table + '\n\n';
          } else if (c.endpoints && c.endpoints.length > 0) {
             newPage.response += `Port: ${c.port}\n\n`;
             newPage.response += `| Method | Path | Status | Latency |\n`;
             newPage.response += `|--------|------|--------|---------|\n`;
             c.endpoints.forEach(e => {
                newPage.response += `| ${e.method} | ${e.path} | ${e.status} | ${e.latency || 'N/A'} |\n`;
             });
             newPage.response += `\n`;
          } else {
             newPage.response += `Port: ${c.port}\nNo endpoints detected.\n\n`;
          }
          
          newPage.response += `Summary: ${c.summary || 'Scan complete.'}`;
        }
      } catch (err) {
        const errorMsg = `\n\x1b[31m  ! App Audit Error: ${err.message}\x1b[0m`;
        blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: errorMsg });
        newPage.response += `\n\n[APP AUDIT FAILED]: ${err.message}`;
      } finally {
        renderActivePage(UI, screen, state);
        state.isProcessingCommand = false;
        setTimeout(() => { UI.inputBox.focus(); }, 30);
      }
      return;
    }

    UI.welcomeCard.hide();
    updatePageIndicator(UI, state);
    renderActivePage(UI, screen, state);
    showLoading(UI, overlays, screen, state, true);
    state.isProcessingCommand = true;

    // Thinking indicator
    blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ⁜ Heeba`, fg: C.yellow, bold: true });
    blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`, fg: C.border });

    const thinkingFrames = ['○', '◎', '◉', '●', '◉', '◎'];
    let frame = 0;
    let thinkingEl = blessed.text({ parent: UI.outputArea, top: state.lineCount, left: 0, width: '100%', content: `  ${thinkingFrames[0]} Thinking...`, fg: C.cyan });
    requestRender();

    const thinkingInterval = setInterval(() => {
      frame = (frame + 1) % thinkingFrames.length;
      if (thinkingEl) { thinkingEl.setContent(`  ${thinkingFrames[frame]} Thinking...`); requestRender(); }
    }, 150);

    let thinkingDestroyed = false;

    try {
      const agentResult = await runAgenticLoop(
        input,
        (p, mode) => queryLLM(p, mode, state.CONFIG, null, llmHistory),
        5,
        {
          context: {
            screen, UI, config: state.CONFIG,
            currentSession: (state.currentSessionIndex >= 0 && state.currentSessionIndex < state.sessions.length) ? state.sessions[state.currentSessionIndex] : null,
            currentPage: newPage,
            onSessionRenamed: (newName) => { if (state.currentSessionIndex === -1) UI.cardTitle.setContent(newName); renderIndexPage(UI, screen, state); requestRender(); },
            onConversationRenamed: (newTitle) => { renderIndexPage(UI, screen, state); requestRender(); },
            onSessionDeleted: () => { if (state.currentSessionIndex >= 0 && state.currentSessionIndex < state.sessions.length) state.sessions.splice(state.currentSessionIndex, 1); state.currentSessionIndex = -1; state.currentPageId = null; state.userScrolledUp = false; saveSessions(); renderActivePage(UI, screen, state); setTimeout(() => { UI.inputBox.focus(); }, 30); },
            onPageDeleted: (newCurrentPageId) => { state.currentPageId = newCurrentPageId; state.userScrolledUp = false; saveSessions(); renderActivePage(UI, screen, state); setTimeout(() => { UI.inputBox.focus(); }, 30); }
          },
          onStep: (step) => {
            const isStartOrPlanning = step.phase === 'start' || step.phase === 'planning';
            if (!thinkingDestroyed && thinkingEl && !isStartOrPlanning) { 
              clearInterval(thinkingInterval); 
              thinkingEl.destroy(); 
              thinkingEl = null; 
              thinkingDestroyed = true; 
            }

            if (step.phase === 'planning') {
              if (thinkingEl) thinkingEl.setContent(`  ${thinkingFrames[frame]} Designing strategic plan...`);
              requestRender();
            } else if (step.phase === 'plan_ready') {
              const TreeReporter = require('./src/utils/tree-reporter');
              const tree = new TreeReporter('Heeba\'s Roadmap', 'Scientific Plan');
              step.plan.forEach((s, i) => tree.branch(`Step ${i + 1}`, s));
              
              newPage.response += `\n` + tree.toString() + `\n\n`;
              renderActivePage(UI, screen, state);
            } else if (step.phase === 'executing') {
              const msg = `\n◈ [Step ${step.iteration}] ${step.stepTitle} → action: ${step.action}...`;
              newPage.response += msg;
              renderActivePage(UI, screen, state);
              if (!state.userScrolledUp) requestScroll();
            } else if (step.phase === 'result') {
              const icon = step.success ? '✔' : '✘';
              const sanitizedResult = ansiToBlessedTags(step.result.split('\n')[0]);
              newPage.response += `\n${icon} ${sanitizedResult}`;
              renderActivePage(UI, screen, state);
              if (!state.userScrolledUp) requestScroll();
            }
          }
        }
      );

      showLoading(UI, overlays, screen, state, false);
      newPage._streaming = false;
      newPage.response = agentResult.finalResponse;
      
      // If the response contains actions that were executed, they were added to newPage.response in onStep.
      // But agentResult.finalResponse is just the last text response.
      // We might want to construct a full history for the page.
      let fullPageResponse = '';
      agentResult.history.forEach(h => {
        fullPageResponse += `\n\n◈ Executing Action: ${h.action}...\n`;
        fullPageResponse += `✔ ${h.result}\n`;
      });
      fullPageResponse += `\n${agentResult.finalResponse}`;
      newPage.response = fullPageResponse.trim();

      newPage.tokens = estimateTokens(newPage.prompt + newPage.response);

      if (!newPage.title) {
        generateTurnTitle(newPage.prompt, newPage.response, state.CONFIG).then(title => {
          if (title) { newPage.title = title; if (session.rootPageId === newPageId && !session.name) session.name = title; if (state.currentSessionIndex === -1) renderIndexPage(UI, screen, state); }
        }).catch(() => {});
      }

      renderActivePage(UI, screen, state);
      setTimeout(() => { UI.inputBox.focus(); }, 30);
    } catch (err) {
      if (!thinkingDestroyed && thinkingEl) { clearInterval(thinkingInterval); thinkingEl.destroy(); }
      showLoading(UI, overlays, screen, state, false);
      newPage._streaming = false; newPage.response = `LLM Error: ${err.message}`;
      renderActivePage(UI, screen, state);
      setTimeout(() => { UI.inputBox.focus(); }, 30);
      logger.error('ENGINE', err);
    } finally { state.isProcessingCommand = false; }
  }

  // Navigation Actions
  const actions = {
    processCommand,
    navigateToPage: (idx, pid) => navigateToPage(UI, screen, state, idx, pid),
    renderActivePage: () => renderActivePage(UI, screen, state),
    openModelSelection: () => openModelSelection(UI),
    closeModelSelection: () => closeModelSelection(UI),
    startNewSession: () => startNewSession(UI, screen, state),
    openPageListIfAvailable: () => { if (state.sessions.length > 0 && !UI.pageListView.visible) openPageList(UI, state); },
    goToPrevPage: () => { if (state.currentSessionIndex === -1) return; const session = state.sessions[state.currentSessionIndex]; const parentId = session.pages[state.currentPageId]?.parentId; if (parentId) { state.currentPageId = parentId; renderActivePage(UI, screen, state); } else { const oldIdx = state.currentSessionIndex; navigateToPage(UI, screen, state, -1, null); state.selectedSessionIndex = oldIdx >= 0 ? oldIdx : 0; renderActivePage(UI, screen, state); } },
    goToNextPage: () => { if (state.currentSessionIndex === -1) { if (state.sessions[state.selectedSessionIndex]) navigateToPage(UI, screen, state, state.selectedSessionIndex, null); } else { const session = state.sessions[state.currentSessionIndex]; const children = session.pages[state.currentPageId]?.children; if (children && children.length > 0) { state.currentPageId = children[0]; renderActivePage(UI, screen, state); } } },
    switchBranch: (dir) => { if (state.currentSessionIndex === -1) return; const { getBrotherPages } = require('./src/core/state-manager'); const b = getBrotherPages(state.sessions[state.currentSessionIndex], state.currentPageId); if (b.total > 1) { let nid = (b.index + dir) % b.total; if (nid < 0) nid = b.total - 1; state.currentPageId = b.list[nid]; renderActivePage(UI, screen, state); } },
    closePageList: () => closePageList(UI)
  };

  setupInputHandlers(UI, screen, state, overlays, actions);

  UI.modelList.on('select', (item) => {
    const content = (item.getText ? item.getText() : item.content);
    state.CONFIG.model = content.split('{')[0].split('(')[0].trim();
    clearConversationHistory();
    updateWelcomeCard(UI, screen, state);
    closeModelSelection(UI);
    if (state.currentSessionIndex === -1) renderActivePage(UI, screen, state);
  });

  UI.pageListView.on('select', (item, idx) => {
    closePageList(UI);
    if (state.currentSessionIndex === -1) navigateToPage(UI, screen, state, idx, null);
    else { const { getPathToPage } = require('./src/core/state-manager'); const path = getPathToPage(state.sessions[state.currentSessionIndex], state.currentPageId); if (path[idx]) navigateToPage(UI, screen, state, state.currentSessionIndex, path[idx].id); }
  });

  screen.on('resize', () => { if (state.sessions.length > 0 && state.currentSessionIndex >= 0) renderActivePage(UI, screen, state); requestRender(); });
  screen.key(['q', 'C-c'], () => { cancelLLM(); cleanupAndExit(); });
  screen.key('escape', () => { if (UI.pageListView.visible) closePageList(UI); else if (UI.modelList.visible) closeModelSelection(UI); else if (state.sessions.length > 0) navigateToPage(UI, screen, state, -1, -1); else { cancelLLM(); cleanupAndExit(); } });

  // Start (TUI)
  (async () => {
    logger.info('APP', 'Starting Heeba Terminal');
    loadSessions();
    updateWelcomeCard(UI, screen, state);
    forceRender();
    await runBootSequence(overlays, UI, screen, state.CONFIG);
    navigateToPage(UI, screen, state, -1, -1);
    logger.info('APP', 'Boot complete');
  })();
}
