#!/usr/bin/env node
const os = require('os');
const blessed = require('blessed');

const { DEFAULT_CONFIG, getAvailableModels } = require('./src/core/config');
const { loadHeebaConfig, getHeebaConfig } = require('./src/core/config-loader');
const { C } = require('./src/ui/theme');
const { initScreen, createUI } = require('./src/ui/components');
const { requestRender, forceRender } = require('./src/ui/render-manager');
const { requestScroll, scrollNow, pauseScroll, resumeScroll } = require('./src/ui/scroll-manager');
const {
  createOverlays,
  runBootSequence,
  startLoadingAnimation,
  stopLoadingAnimation,
  startIdleAnimation,
  startTipsAnimation,
  stopTipsAnimation
} = require('./src/ui/animations');
const { MODES } = require('./src/utils/helpers');
const logger = require('./src/utils/logger');
const {
  queryLLM,
  cancelLLM,
  getLLMStatus,
  clearConversationHistory,
  stopServer,
  getTotalTokensUsed
} = require('./src/core/engine');
const { isVirtualModel } = require('./src/core/ollama-adapter');
const { parseCommandFromResponse, executeCommand } = require('./src/core/intent-executor');
const { renderMarkdown } = require('./src/ui/markdown-renderer');

// Load heeba.json config on startup
const heebaConfig = loadHeebaConfig();
logger.info('CONFIG', `Loaded heeba.json for user: ${heebaConfig.user_profile.name}`);

// ======================
// STATE
// ======================
let currentMode = 'auto';
let commandHistory = [];
let historyIndex = -1;
let lineCount = 12; // Start after WelcomeCard (11 lines + 1 gap)
let lastOutputWasCommand = false;
const startTime = Date.now();
const CONFIG = { ...DEFAULT_CONFIG };
let isProcessingCommand = false;

// Session/PromptPage Workspace State (Auto mode only)
let sessions = [];              // Array of Session objects
let currentSessionIndex = -1;  // Index of active session (-1 = none / at index page)
let currentPageId = null;      // ID of active page node within session
let userScrolledUp = false;     // Track if user manually scrolled during streaming

/**
 * Reconstruction: Get array of pages from root to specific pageId
 */
function getPathToPage(session, pageId) {
  if (!session || !pageId || !session.pages[pageId]) return [];
  const path = [];
  let curr = session.pages[pageId];
  while (curr) {
    path.unshift(curr);
    curr = curr.parentId ? session.pages[curr.parentId] : null;
  }
  return path;
}

/**
 * Branching: Get sister branches (other children of same parent)
 */
function getBrotherPages(session, pageId) {
  if (!session || !pageId || !session.pages[pageId]) return { index: 0, total: 1, list: [] };
  const parentId = session.pages[pageId].parentId;
  const brothers = parentId ? session.pages[parentId].children : [session.rootPageId];
  return {
    index: brothers.indexOf(pageId),
    total: brothers.length,
    list: brothers
  };
}

/**
 * Heuristic Token Counting: (Characters / 4) is a reliable cross-model estimation.
 */
function estimateTokens(text) {
  if (!text) return 0;
  // Standard heuristic: 1 token ≈ 4 characters for English text
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Path Analytics: Sum all tokens from root to target page
 */
function calculatePathTokens(session, pageId) {
  const path = getPathToPage(session, pageId);
  return path.reduce((sum, p) => sum + (p.tokens || 0), 0);
}

/**
 * Helper: Find the last page in a linear path starting from a node
 */
function findLeafId(session, pageId) {
  let currId = pageId;
  while (session.pages[currId] && session.pages[currId].children.length > 0) {
    // Always follow the first child by default for navigation
    currId = session.pages[currId].children[0];
  }
  return currId;
}

// Virtual index page (not stored in sessions)
const INDEX_PAGE_ID = 0;

// Session header animation state
let sessionHeaderInterval = null;
const SESSION_HEADER_FRAMES = ['⁛', '⁘', '⁙', '⁘', '⁛'];
let sessionHeaderFrameIdx = 0;

// Keyboard state
let lastShiftPress = 0;

// Initialize blessed
const screen = initScreen();
const UI = createUI(screen);
const overlays = createOverlays(UI.container);

// ======================
// STATS REFRESH
// ======================
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

function refreshStats() {
  try {
    // RAM
    const mem = process.memoryUsage();
    const ramMB = Math.round(mem.rss / 1024 / 1024);
    UI.ramTag.setContent(`RAM: ${ramMB}MB`);

    // Uptime
    const uptime = Math.floor(process.uptime());
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    UI.uptimeTag.setContent(`UpTime: ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);

    // Tokens
    UI.tokenTag.setContent(`Tokens: ${getTotalTokensUsed() || 0}`);

    // CPU
    const currentCpuUsage = process.cpuUsage(lastCpuUsage);
    const currentTime = Date.now();
    const timeDelta = (currentTime - lastCpuTime) * 1000; // to microseconds
    
    // CPU usage across all cores (approximate for this process)
    const cpuPercent = Math.min(100, Math.round((currentCpuUsage.user + currentCpuUsage.system) / timeDelta * 100));
    UI.cpuTag.setContent(`CPU: ${cpuPercent}%`);
    
    lastCpuUsage = process.cpuUsage();
    lastCpuTime = currentTime;

    requestRender();
  } catch (err) {
    // Silently fail to avoid UI crashes during rapid updates
  }
}

setInterval(refreshStats, 1000);


// ======================
// CLEANUP
// ======================
function cleanupAndExit() {
  stopServer();
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
process.on('exit', () => stopServer());

// ======================
// UI FUNCTIONS
// ======================
function updateWelcomeCard() {
  const m = MODES[currentMode];
  const config = getHeebaConfig();
  logger.debug('UI', `Updating welcome card: ${currentMode}`);

  // Top bar updates
  UI.modelTag.setContent(`SelectedModel: ${CONFIG.model.replace('.gguf', '')}`);
  UI.topModeIndicator.setContent(`● ${m.name.toUpperCase()}`);
  UI.topModeIndicator.style.fg = m.color;

  // Welcome card header
  UI.modeIndicator.setContent(`● ${m.name.toUpperCase()}`);
  UI.modeIndicator.style.fg = m.color;
  UI.cardTitle.setContent(`Heeba ${m.headerTitle}`);

  // User name from config
  UI.welcomeUserEl.setContent(`Welcome back, ${config.user_profile.name}`);

  // Mascot
  UI.mascotEl.setContent(m.mascot[0]);
  UI.mascotEl.style.fg = m.color;

  // Info
  const isVirtual = isVirtualModel(CONFIG.model);
  UI.statusLinesEl.setContent(m.statusLines);
  UI.engineInfoEl.setContent(`Engine : ${isVirtual ? 'Ollama (Online)' : 'llama.cpp (local)'}\nModel  : ${CONFIG.model}`);
  UI.tipsText.setContent(m.tips.join('   '));

  // Input prompt
  UI.promptText.setContent(`>`);
  UI.promptText.style.fg = m.color;

  // Footer status
  UI.footerStatus.setContent('● ready');
  UI.footerStatus.style.fg = C.green;

  // Page indicator update
  updatePageIndicator();

  // WelcomeCard visibility: show in auto mode to display sessions list
  if (currentMode === 'auto') {
    UI.welcomeCard.show();
    UI.cardTitle.setContent('Sessions');
    UI.modeIndicator.setContent(`${SESSION_HEADER_FRAMES[0]} Heeba`);
    UI.modeIndicator.style.fg = C.green;
    UI.statusLinesEl.setContent(`${sessions.length} session${sessions.length !== 1 ? 's' : ''} · Enter to open`);
    startSessionHeaderAnimation();
  } else {
    UI.welcomeCard.show();
    stopSessionHeaderAnimation();
  }

  // Start animations
  startIdleAnimation(UI, screen, m);
  startTipsAnimation(UI, screen, m);

  requestRender();
}

// ChatGPT-like auto-scroll to bottom
function autoScroll() {
  requestScroll();
}

function clearOutput() {
  // Destroy all children except the WelcomeCard
  UI.outputArea.children.forEach(c => {
    if (c !== UI.welcomeCard) c.destroy();
  });
  lineCount = 12;
  autoScroll();
}

/**
 * Clear only dynamic content from outputArea (everything except welcomeCard).
 * Used when switching between PromptPages.
 */
function clearDynamicContent() {
  const toDestroy = [];
  UI.outputArea.children.forEach(c => {
    if (c !== UI.welcomeCard) toDestroy.push(c);
  });
  toDestroy.forEach(c => c.destroy());
  lineCount = 0;
}

function addOutput(text, className = '') {
  if (text == null || text === '') return;

  const textStr = String(text);
  const prefix = {
    command: `${MODES[currentMode].prompt} `,
    error: '[ERR] ',
    success: '↬ ',
    info: '',
    llm: '⁜ '
  }[className] || '';
  const color = {
    command: C.purple,
    error: C.red,
    success: C.green,
    info: C.cyan,
    llm: C.yellow
  }[className] || C.dim;

  textStr.split('\n').forEach(line => {
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: prefix + line,
      fg: color
    });
  });
  autoScroll();
}

function addSpacer() {
  lineCount++;
  autoScroll();
}

// ======================
// PROMPT PAGE RENDERING
// ======================

/**
 * Render the Index Page - session list below the WelcomeCard.
 * WelcomeCard is already showing with "Heeba Sessions" title.
 */
function renderPageRecursive(session, pageId, prefix = '', isLast = true) {
  const page = session.pages[pageId];
  if (!page) return;

  const marker = pageId === currentPageId ? ' ●' : '';
  const branchChar = isLast ? '└─' : '├─';
  const childPrefix = prefix + (isLast ? '   ' : '│  ');

  const contentTrunc = page.prompt.length > 40 ? page.prompt.substring(0, 37) + '...' : page.prompt;
  const leftSide = `${prefix}${branchChar} "${contentTrunc}"${marker}`;
  
  // Render the left side (Branch + Prompt)
  blessed.text({
    parent: UI.outputArea,
    top: lineCount++,
    left: 0,
    width: '100%',
    content: leftSide,
    fg: pageId === currentPageId ? C.yellow : C.dim,
    bold: pageId === currentPageId
  });

  // Render the connector and Token Count on the far right if tokens exist
  if (page.tokens) {
    const termWidth = (typeof screen.width === 'number') ? screen.width : 80;
    const tokenLabel = `(${page.tokens} tks)`;
    const padding = termWidth - leftSide.length - tokenLabel.length - 6; // margin buffer
    
    if (padding > 2) {
      const dots = '─'.repeat(padding);
      blessed.text({
        parent: UI.outputArea,
        top: lineCount - 1,
        left: leftSide.length + 2,
        content: dots,
        fg: '#1a1a1a' // ultra-dark / 'lightest contrast' possible
      });
    }

    blessed.text({
      parent: UI.outputArea,
      top: lineCount - 1,
      right: 2,
      content: tokenLabel,
      fg: pageId === currentPageId ? C.yellow : C.dark,
      bold: pageId === currentPageId
    });
  }

  const children = page.children || [];
  children.forEach((childId, idx) => {
    renderPageRecursive(session, childId, childPrefix, idx === children.length - 1);
  });
}

function renderIndexPage() {
  clearDynamicContent();
  lineCount = 12;

  if (sessions.length === 0) {
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: '  No sessions yet — type a prompt below to start.',
      fg: C.dim
    });
  } else {
    // Root tip of the tree
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: '  ◈',
      fg: C.green
    });

    sessions.forEach((session, idx) => {
      const isLastSession = idx === sessions.length - 1;
      const isCurrent = idx === currentSessionIndex;
      const sessionBranch = isLastSession ? '└─' : '├─';
      const recursivePrefix = isLastSession ? '     ' : '  │  ';

      const firstPrompt = session.rootPageId && session.pages[session.rootPageId] 
        ? session.pages[session.rootPageId].prompt 
        : '(empty)';
      const displayTitle = session.name || firstPrompt;
      const titleTrunc = displayTitle.length > 44 ? displayTitle.substring(0, 41) + '...' : displayTitle;
      const marker = isCurrent ? ' ●' : '';
      const relTime = getRelativeTime(session.lastUpdated);

      // Session branch line
      blessed.text({
        parent: UI.outputArea,
        top: lineCount++,
        left: 0,
        width: '100%',
        content: `  ${sessionBranch} ${idx + 1}  "${titleTrunc}"${marker}`,
        fg: isCurrent ? C.yellow : C.cyan,
        bold: isCurrent
      });

      blessed.text({
        parent: UI.outputArea,
        top: lineCount - 1,
        right: 2,
        content: relTime,
        fg: C.dark
      });

      if (session.rootPageId) {
        renderPageRecursive(session, session.rootPageId, recursivePrefix, true);
      }

      if (!isLastSession) {
        blessed.text({
          parent: UI.outputArea,
          top: lineCount++,
          left: 0,
          width: '100%',
          content: '  │',
          fg: C.border
        });
      }
    });
  }

  lineCount++;
  updatePageIndicator();
  requestRender();
  autoScroll();
}

/**
 * Get relative time string (e.g. "2m ago", "1h ago")
 */
function getRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

/**
 * Start the animated session header (⁛ Heeba with rotating symbols)
 */
function startSessionHeaderAnimation() {
  if (sessionHeaderInterval) return; // Already running

  sessionHeaderInterval = setInterval(() => {
    sessionHeaderFrameIdx = (sessionHeaderFrameIdx + 1) % SESSION_HEADER_FRAMES.length;
    UI.modeIndicator.setContent(`${SESSION_HEADER_FRAMES[sessionHeaderFrameIdx]} Heeba`);
    requestRender();
  }, 220);
}

/**
 * Stop the animated session header
 */
function stopSessionHeaderAnimation() {
  if (sessionHeaderInterval) {
    clearInterval(sessionHeaderInterval);
    sessionHeaderInterval = null;
  }
}

/**
 * Render the active PromptPage into the outputArea.
 * Clears all dynamic content and rebuilds from the page data.
 * For Index Page (sessionIndex=-1), shows the WelcomeCard with session list.
 */
function renderActivePage() {
  if (currentSessionIndex === -1) {
    // Show WelcomeCard with session list header
    UI.welcomeCard.show();
    UI.cardTitle.setContent('Sessions');
    UI.modeIndicator.setContent(`${SESSION_HEADER_FRAMES[0]} Heeba`);
    UI.modeIndicator.style.fg = C.green;
    UI.statusLinesEl.setContent(`${sessions.length} session${sessions.length !== 1 ? 's' : ''} · Enter to open`);
    startSessionHeaderAnimation();
    renderIndexPage();
    return;
  }

  if (currentSessionIndex < 0 || currentSessionIndex >= sessions.length) return;
  const session = sessions[currentSessionIndex];
  if (!currentPageId || !session.pages[currentPageId]) return;

  // Stop header animation when viewing a session page
  stopSessionHeaderAnimation();
  clearDynamicContent();
  UI.welcomeCard.hide();
  lineCount = 1;

  // Render ONLY the current active page node
  const page = session.pages[currentPageId];
  
  // ── User prompt ──
  blessed.text({
    parent: UI.outputArea,
    top: lineCount++,
    left: 0,
    width: '100%',
    content: `  ※ You`,
    fg: C.purple,
    bold: true
  });

  blessed.text({
    parent: UI.outputArea,
    top: lineCount++,
    left: 0,
    width: '100%',
    content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`,
    fg: C.border
  });

  page.prompt.split('\n').forEach(pl => {
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: `  ${pl}`,
      fg: C.fg
    });
  });

  lineCount++; // spacer

  // ── LLM Response ──
  if (page.response) {
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: `  ⁜ Heeba`,
      fg: C.yellow,
      bold: true
    });

    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`,
      fg: C.border
    });

    const termWidth = (typeof screen.width === 'number') ? screen.width : 80;
    const mdLines = renderMarkdown(page.response, termWidth);
    mdLines.forEach(ml => {
      blessed.text({
        parent: UI.outputArea,
        top: lineCount++,
        left: 0,
        width: '100%',
        content: ml.content,
        fg: ml.fg,
        bold: ml.bold
      });
    });
  }

  updatePageIndicator();
  requestRender();
  autoScroll();
}

function updatePageIndicator() {
  if (currentSessionIndex === -1) {
    UI.pageIndicator.setContent(' Sessions ');
    return;
  }
  const session = sessions[currentSessionIndex];
  if (!currentPageId || !session.pages[currentPageId]) return;

  const path = getPathToPage(session, currentPageId);
  const brothers = getBrotherPages(session, currentPageId);
  const totalTokens = calculatePathTokens(session, currentPageId);
  
  let label = ` Page ${path.length} `;
  if (brothers.total > 1) {
    label += `[Branch ${brothers.index + 1}/${brothers.total}] `;
  }
  
  // Context Usage Meter
  const limit = CONFIG.contextLength || 4096;
  const usage = Math.round((totalTokens / limit) * 100);
  label += `| Context: ${totalTokens} / ${limit} (${usage}%) `;

  UI.pageIndicator.setContent(label);
  
  // Visual Alert: change colors based on context usage
  if (usage > 90) UI.pageIndicator.style.fg = C.red;
  else if (usage > 70) UI.pageIndicator.style.fg = C.yellow;
  else UI.pageIndicator.style.fg = C.green;

  requestRender();
}

/**
 * Branch Switching: Switch between parallel branches (Shift + Left/Right)
 */
function switchBranch(direction) {
  if (currentSessionIndex === -1) return;
  const session = sessions[currentSessionIndex];
  if (!currentPageId || !session.pages[currentPageId]) return;

  const brothers = getBrotherPages(session, currentPageId);
  if (brothers.total <= 1) return; // No other branches here

  let nextIdx = (brothers.index + direction) % brothers.total;
  if (nextIdx < 0) nextIdx = brothers.total - 1;

  currentPageId = brothers.list[nextIdx];
  // If we switch to a branch, the path might end elsewhere, but findLeafId helps
  // Actually, we usually want to stay at the same depth.
  renderActivePage();
}

/**
 * Navigate to a specific page ID within a session.
 * @param {number} sessionIdx - Session index (-1 for index page)
 * @param {string} pageId - Page node ID
 */
function navigateToPage(sessionIdx, pageId) {
  if (sessionIdx === -1) {
    currentSessionIndex = -1;
    currentPageId = null;
    renderActivePage();
    setTimeout(() => { UI.inputBox.focus(); }, 30);
    return;
  }

  if (sessionIdx < 0 || sessionIdx >= sessions.length) return;
  currentSessionIndex = sessionIdx;
  currentPageId = pageId || sessions[sessionIdx].rootPageId;
  
  renderActivePage();
}function showLoading(show) {
  if (show) {
    UI.promptText.setContent(`>`);
    startLoadingAnimation(UI, overlays, screen, MODES[currentMode]);
  } else {
    UI.promptText.setContent(`>`);
    stopLoadingAnimation(UI, overlays, screen, MODES[currentMode]);
  }
  UI.footerStatus.setContent(show ? '● busy' : '● ready');
  UI.footerStatus.style.fg = show ? C.yellow : C.green;
  requestRender();
}

function switchMode(newMode) {
  logger.info('MODE', `Switching: ${currentMode} → ${newMode}`);

  overlays.modeOverlayText.setContent(`Switching to ${MODES[newMode].name} mode...`);
  overlays.modeOverlayText.style.fg = MODES[newMode].color;
  overlays.modeOverlay.show();
  overlays.modeOverlay.setFront();
  forceRender();

  setTimeout(() => {
    overlays.modeOverlay.hide();
    currentMode = newMode;
    updateWelcomeCard();

    // When switching to auto mode with existing sessions, render the index page
    if (newMode === 'auto' && sessions.length > 0) {
      navigateToPage(-1, -1);
    } else if (newMode === 'task') {
      // Task mode: restore traditional chat view with WelcomeCard
      clearDynamicContent();
      lineCount = 12;
      UI.welcomeCard.show();
      addSpacer();
      addOutput(`Switched to ${MODES[newMode].name} Mode`, 'success');
    } else {
      addSpacer();
      addOutput(`Switched to ${MODES[newMode].name} Mode`, 'success');
    }
    requestRender();
  }, 500);
}

function openModelSelection() {
  const models = getAvailableModels();
  if (currentMode !== 'auto') {
    addOutput('Scanning engine/models/...', 'info');
  }
  pauseScroll();

  if (models.length === 0) {
    if (currentMode !== 'auto') {
      addOutput('No models found in engine/models/', 'error');
    }
    return;
  }

  UI.inputContainer.hide();
  UI.modelList.setItems(models);
  UI.modelList.setLabel(` [ SELECT MODEL: ${models.length} FOUND ] `);
  UI.modelList.show();
  UI.modelList.focus();
  forceRender();
}

function closeModelSelection() {
  UI.modelList.hide();
  UI.inputContainer.show();
  UI.inputBox.focus();
  resumeScroll();
  forceRender();
}

// ======================
// COMMAND LOGIC
// ======================

async function processCommand(input) {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';

  if (trimmed === 'mode task' || trimmed === 'mode auto') {
    switchMode(trimmed === 'mode task' ? 'task' : 'auto');
    return '';
  }

  if (trimmed === 'help') {
    return `Available Commands:
  [S-Space]  - Switch mode (DINO <-> CAT)
  mode task  - Switch to DINO mode
  mode auto  - Switch to CAT mode
  models     - List available models
  model <n>  - Select model by number
  model <name> - Select model by name
  clear      - Clear terminal output
  info       - Show system information
  cancel     - Cancel ongoing LLM request
  help       - Show this help`;
  }

  if (trimmed === 'models') {
    openModelSelection();
    return '';
  }

  if (trimmed.startsWith('model ')) {
    const models = getAvailableModels();
    const sel = input.trim().substring(6).trim();
    if (!sel) return 'Usage: model <number|filename>';

    let newModel;
    const num = parseInt(sel);
    if (!isNaN(num) && num > 0 && num <= models.length) {
      newModel = models[num - 1];
    } else {
      newModel = models.find(m => m.toLowerCase() === sel.toLowerCase());
    }

    if (newModel) {
      CONFIG.model = newModel;
      clearConversationHistory();
      updateWelcomeCard();
      if (currentMode !== 'auto') {
        addSpacer(); 
      }
      return `Model set to: ${newModel}`;
    }
    return `Model not found: ${sel}`;
  }

  if (trimmed === 'clear') {
    clearOutput();
    if (currentMode === 'auto') {
      clearConversationHistory();
      UI.welcomeCard.show();
      updatePageIndicator();
      lineCount = 12;
    }
    return '';
  }

  if (trimmed === 'info') {
    const models = getAvailableModels();
    return `Heeba Terminal v1.0
════════════════════════════════════
Current Mode: ${MODES[currentMode].name}
Status    : ${getLLMStatus() ? 'LLM Running' : 'Ready'}
Uptime    : ${Math.floor((Date.now() - startTime) / 1000)}s

ENGINE CONFIG
════════════════════════════════════
Engine    : llama-cli.exe (llama.cpp)
Model     : ${CONFIG.model}
Model OK  : ${models.length > 0 ? '[OK] Found (' + models.length + ')' : '[ERR] None'}
Context   : ${CONFIG.contextLength} tokens
Threads   : ${CONFIG.threads}`;
  }

  if (trimmed === 'cancel') {
    if (getLLMStatus()) { cancelLLM(); showLoading(false); return 'LLM request cancelled.'; }
    return 'No LLM request to cancel.';
  }

  if (currentMode === 'auto') {
    // Session Workspace: Branching Tree Logic
    let session;
    if (currentSessionIndex === -1 || currentSessionIndex >= sessions.length) {
      // Create new session
      session = {
        id: Date.now().toString(36),
        name: null,
        pages: {}, // Dictionary of page nodes: { id: { prompt, response, parentId, children: [] } }
        rootPageId: null,
        createdAt: Date.now(),
        lastUpdated: Date.now()
      };
      sessions.push(session);
      currentSessionIndex = sessions.length - 1;
      currentPageId = null; 
    } else {
      session = sessions[currentSessionIndex];
    }

    const newPageId = Math.random().toString(36).substring(2, 9);
    const newPage = {
      id: newPageId,
      prompt: input,
      response: '',
      parentId: currentPageId, // Points to where we branched from
      children: [],
      scrollOffset: 0,
      createdAt: Date.now(),
      _streaming: true
    };

    // Add to session 
    session.pages[newPageId] = newPage;
    
    // Wire up parent/child relationship
    if (!session.rootPageId) {
      session.rootPageId = newPageId;
    } else if (currentPageId && session.pages[currentPageId]) {
      session.pages[currentPageId].children.push(newPageId);
    }

    // Set as active
    currentPageId = newPageId;
    session.lastUpdated = Date.now();
    userScrolledUp = false;

    // Build History from current branch path (excluding the new prompt itself)
    const historyPath = getPathToPage(session, newPage.parentId);
    const llmHistory = historyPath.map(p => ({
      user: p.prompt,
      assistant: p.response
    }));

    // Hide WelcomeCard — full screen for chat
    UI.welcomeCard.hide();
    updatePageIndicator();

    // Render the new page (prompt + "Thinking...")
    renderActivePage();

    showLoading(true);
    isProcessingCommand = true;

    // Response header (shown before thinking starts)
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: `  ⁜ Heeba`,
      fg: C.yellow,
      bold: true
    });
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`,
      fg: C.border
    });

    // Create animated thinking indicator inside the page (below response header)
    const thinkingFrames = ['○', '◎', '◉', '●', '◉', '◎'];
    let frame = 0;
    let thinkingEl = blessed.text({
      parent: UI.outputArea,
      top: lineCount,
      left: 0,
      width: '100%',
      content: `  ${thinkingFrames[0]} Thinking...`,
      fg: C.cyan
    });
    requestRender();

    const thinkingInterval = setInterval(() => {
      frame = (frame + 1) % thinkingFrames.length;
      if (thinkingEl) {
        thinkingEl.setContent(`  ${thinkingFrames[frame]} Thinking...`);
        requestRender();
      }
    }, 150);

    let liveTextEl = null;
    let fullResponse = '';
    let thinkingDestroyed = false;

    try {
      await queryLLM(input, currentMode, CONFIG, (token) => {
        // Destroy thinking indicator on first token
        if (!thinkingDestroyed && thinkingEl) {
          clearInterval(thinkingInterval);
          thinkingEl.destroy();
          thinkingEl = null;
          thinkingDestroyed = true;
        }

        if (!liveTextEl) {
          startLoadingAnimation(UI, overlays, screen, MODES[currentMode], true);
          // Re-render the page fresh with response header.
          clearDynamicContent();
          lineCount = 1;

          // User prompt section
          blessed.text({ parent: UI.outputArea, top: lineCount++, left: 0, width: '100%', content: `  ※ You`, fg: C.purple, bold: true });
          blessed.text({ parent: UI.outputArea, top: lineCount++, left: 0, width: '100%', content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`, fg: C.border });
          input.split('\n').forEach(pl => {
            blessed.text({ parent: UI.outputArea, top: lineCount++, left: 0, width: '100%', content: `  ${pl}`, fg: C.fg });
          });
          lineCount++; // spacer

          // Response header
          blessed.text({ parent: UI.outputArea, top: lineCount++, left: 0, width: '100%', content: `  ⁜ Heeba`, fg: C.yellow, bold: true });
          blessed.text({ parent: UI.outputArea, top: lineCount++, left: 0, width: '100%', content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`, fg: C.border });

          // Live streaming element
          liveTextEl = blessed.text({
            parent: UI.outputArea,
            top: lineCount++,
            left: 0,
            width: '100%',
            content: '  ',
            fg: C.fg
          });
        }

        liveTextEl.setContent(liveTextEl.getContent() + token);
        fullResponse += token;

        // Auto-scroll during streaming unless user manually scrolled up
        if (!userScrolledUp) {
          requestScroll();
        }
        requestRender();
      }, llmHistory);

      showLoading(false);

      // Finalize token count for this Page Node
      newPage._streaming = false;
      newPage.response = fullResponse;
      newPage.tokens = estimateTokens(newPage.prompt + newPage.response);

      // If this is the root node and session has no name, use the first prompt
      if (!session.name && session.rootPageId === newPageId) {
        session.name = newPage.prompt.substring(0, 30);
      }

      // Re-render the page with proper markdown formatting
      renderActivePage();
      // Restore input focus so the I-beam cursor is visible again immediately
      setTimeout(() => { UI.inputBox.focus(); }, 30);

      // Check for structured commands in LLM response
      const command = parseCommandFromResponse(fullResponse);
      if (command && command.action) {
        // Build rich context: give the handler the live session and re-render callbacks
        const ctx = {
          screen,
          UI,
          currentSession: (currentSessionIndex >= 0 && currentSessionIndex < sessions.length)
            ? sessions[currentSessionIndex]
            : null,
          onSessionRenamed: (newName) => {
            // Update WelcomeCard header to reflect the new name immediately
            UI.cardTitle.setContent(newName);
            requestRender();
          },
          onSessionDeleted: () => {
            // Remove this session from the array
            if (currentSessionIndex >= 0 && currentSessionIndex < sessions.length) {
              sessions.splice(currentSessionIndex, 1);
            }
            // Reset to index page
            currentSessionIndex = -1;
            currentPageId       = null;
            userScrolledUp      = false;
            // Re-render the index page (WelcomeCard + updated tree)
            renderActivePage();
            setTimeout(() => { UI.inputBox.focus(); }, 30);
          }
        };
        const result = await executeCommand(command, ctx);
        if (result && result.success) {
          if (command.action === 'update_user_profile') {
            updateWelcomeCard();
          }
          // Append command result to the page response
          newPage.response += `\n\n---\n\u2713 ${result.message}`;
          renderActivePage();
        } else if (result) {
          newPage.response += `\n\n---\n\u2717 Failed: ${result.message}`;
          renderActivePage();
        }
        setTimeout(() => { UI.inputBox.focus(); }, 30);
        return '';
      }

      return '';
    } catch (err) {
      if (!thinkingDestroyed && thinkingEl) {
        clearInterval(thinkingInterval);
        thinkingEl.destroy();
      }
      showLoading(false);
      newPage._streaming = false;
      newPage.response = `LLM Error: ${err.message}`;
      renderActivePage();
      // Restore cursor on error path too
      setTimeout(() => { UI.inputBox.focus(); }, 30);
      logger.error('ENGINE', err);
      isProcessingCommand = false;
      return '';
    } finally {
      isProcessingCommand = false;
    }
  }

  if (trimmed.startsWith('ask heeba') || trimmed.startsWith('heeba')) {
    return `Heeba is ready!\nSwitch to Auto Mode (Shift+Space) to chat with LLM.`;
  }

  return `Command not found: ${input}\nType "help" for available commands.`;
}

// ======================
// INPUT HANDLING
// ======================

function resizeInput() {
  // Skip resize if we're processing a command
  if (isProcessingCommand) return;

  const text = UI.inputBox.getValue();
  // Get numeric width, providing a safe fallback
  const width = (typeof UI.inputBox.width === 'number' ? UI.inputBox.width : screen.width - 6) - 2;

  const bufferLines = text.split('\n');
  let visualLines = 0;
  bufferLines.forEach(line => {
    // If empty line, it takes 1 row. If long, it wraps.
    visualLines += Math.max(1, Math.ceil(line.length / Math.max(1, width)));
  });

  const newHeight = Math.min(12, visualLines); // Cap height at 12 lines

  if (UI.inputBox.height !== newHeight) {
    UI.inputBox.height = newHeight;
    UI.inputContainer.height = newHeight + 2;

    // Recalculate outputArea height:
    // Start height: 3 (top) + newHeight + 1 (footer) + 1 padding = 5 + newHeight
    UI.outputArea.height = `100%-${5 + newHeight}`;
    requestRender();
  }
}

// Handle submission via Enter (without shift)
UI.inputBox.key('enter', async (ch, key) => {
  if (key.shift) return;

  const command = UI.inputBox.getValue().trim();
  if (!command) {
    UI.inputBox.clearValue();
    UI.inputBox.height = 1;
    UI.inputContainer.height = 3;
    // Offset calculation: Top(3) + Input(1) + Footer(1) + Padding(1) = 6
    UI.outputArea.height = '100%-7';
    requestRender();
    setTimeout(() => { UI.inputBox.focus(); }, 50);
    return;
  }

  UI.inputBox.clearValue();

  // Reset height after submission
  UI.inputBox.height = 1;
  UI.inputContainer.height = 3;
  // Offset calculation: Top(3) + Input(1) + Footer(1) + Padding(1) = 6
  UI.outputArea.height = '100%-7';

  // In Auto mode, don't append to global chat — processCommand handles page rendering
  if (currentMode !== 'auto') {
    addSpacer();
    addOutput(command, 'command');
    lastOutputWasCommand = true;
  }

  const response = await processCommand(command);
  if (response && currentMode !== 'auto') { addSpacer(); addOutput(response, 'response'); addSpacer(); }
  // In auto mode, responses are handled within processCommand via PromptPage rendering

  if (command) {
    commandHistory.push(command);
    historyIndex = commandHistory.length;
  }

  // Reset input field state completely
  UI.inputBox.clearValue();
  UI.inputBox.height = 1;
  UI.inputContainer.height = 3;
  UI.outputArea.height = '100%-7';
  try {
    UI.inputBox.setValue('');
  } catch (e) {}

  requestRender();
  setTimeout(() => { UI.inputBox.focus(); }, 50);
});

// Watch for changes to resize the input box
UI.inputBox.on('keypress', (ch, key) => {
  // Use setImmediate to wait for the value to update in blessed
  setImmediate(() => resizeInput());
});

// Manual cursor navigation helpers
UI.inputBox.key('left', () => {
  if (UI.inputBox._clines) {
    // Basic navigation for blessed textarea
    screen.focusOffset(-1);
    requestRender();
  }
});

UI.inputBox.key('right', () => {
  if (UI.inputBox._clines) {
    screen.focusOffset(1);
    requestRender();
  }
});

UI.modelList.on('select', (item) => {
  const content = (item.getText ? item.getText() : item.content);
  // Strip tags if any, then strip (Online) label
  const newModel = content.split('{')[0].split('(')[0].trim();
  
  CONFIG.model = newModel;
  clearConversationHistory();
  updateWelcomeCard();
  closeModelSelection();
  
  if (currentMode !== 'auto') {
    addSpacer();
    addOutput(`Model set to: ${newModel}`, 'success');
  } else if (currentSessionIndex === -1) {
    // Refresh the index page tree/header to show the new model
    renderActivePage();
  }
});

// ======================
// KEYBOARD HANDLING
// ======================

// Model list navigation
UI.modelList.key(['up', 'k'], () => { UI.modelList.up(); requestRender(); });
UI.modelList.key(['down', 'j'], () => { UI.modelList.down(); requestRender(); });
UI.modelList.key('escape', () => closeModelSelection());

// Redundant enter handler removed to prevent double-execution crashes

// Input history navigation
UI.inputBox.key('up', () => {
  // Only navigate history if we are in single-line mode or empty
  if (UI.inputBox.getLines().length > 1 && UI.inputBox.getValue().trim() !== '') return;

  if (historyIndex > 0) {
    historyIndex--;
    const cmd = commandHistory[historyIndex];
    UI.inputBox.setValue(cmd);
    setImmediate(() => {
      resizeInput();
      requestRender();
    });
  }
});

UI.inputBox.key('down', () => {
  // Only navigate history if we are in single-line mode or empty
  if (UI.inputBox.getLines().length > 1 && UI.inputBox.getValue().trim() !== '') return;

  if (historyIndex < commandHistory.length - 1) {
    historyIndex++;
    const cmd = commandHistory[historyIndex];
    UI.inputBox.setValue(cmd);
  } else {
    historyIndex = commandHistory.length;
    UI.inputBox.clearValue();
  }
  setImmediate(() => {
    resizeInput();
    requestRender();
  });
});

// ==============================================
// MODE SWITCH - SHIFT+SPACE
// ==============================================

// Direct Shift+Space combination
screen.key('S-space', () => {
  logger.debug('KEYBOARD', 'S-space detected');
  if (!UI.modelList.visible && !UI.pageListView.visible) {
    switchMode(currentMode === 'task' ? 'auto' : 'task');
  }
});

// Space as fallback only if not typing
screen.key('space', () => {
  if (UI.modelList.visible) {
    UI.modelList.down();
    requestRender();
  }
});

// Ctrl+g as universal fallback
screen.key('C-g', () => {
  logger.debug('KEYBOARD', 'Ctrl+g detected');
  if (!UI.modelList.visible && !UI.pageListView.visible) {
    switchMode(currentMode === 'task' ? 'auto' : 'task');
  }
});

// ==============================================
// PROMPT PAGE NAVIGATION (Auto mode)
// ==============================================

// Page navigation helper functions
function goToPrevPage() {
  if (currentSessionIndex === -1) return;
  const session = sessions[currentSessionIndex];
  if (!currentPageId || !session.pages[currentPageId]) return;

  const parentId = session.pages[currentPageId].parentId;
  if (parentId) {
    currentPageId = parentId;
    renderActivePage();
  } else {
    // Return to index
    navigateToPage(-1, null);
  }
}

function goToNextPage() {
  if (currentMode !== 'auto' || sessions.length === 0) return;

  if (currentSessionIndex === -1) {
    // At index page - navigate to first session's root
    navigateToPage(0, null);
    return;
  }

  const session = sessions[currentSessionIndex];
  if (!currentPageId || !session.pages[currentPageId]) return;

  const children = session.pages[currentPageId].children;
  if (children && children.length > 0) {
    currentPageId = children[0];
    renderActivePage();
  }
}

function openPageListIfAvailable() {
  if (currentMode === 'auto' && sessions.length > 0 && !UI.pageListView.visible) {
    openPageList();
  }
}

// Ctrl+Left / Ctrl+P: Previous page (bound on both screen AND inputBox)
screen.key('C-left', goToPrevPage);
UI.inputBox.key('C-left', goToPrevPage);
screen.key('C-p', goToPrevPage);
UI.inputBox.key('C-p', goToPrevPage);

// Ctrl+Right: Next page (Ctrl+N is used for new session)
screen.key('C-right', goToNextPage);
UI.inputBox.key('C-right', goToNextPage);

// Ctrl+L: Open page list view
screen.key('C-l', openPageListIfAvailable);
UI.inputBox.key('C-l', openPageListIfAvailable);

// Ctrl+N: Start new session
function startNewSession() {
  if (currentMode !== 'auto') return;
  if (UI.modelList.visible || UI.pageListView.visible) return;

  // Navigate back to the index page. The new session object will be created
  // automatically in processCommand() when the user sends their first prompt.
  // This avoids creating a ghost empty session prematurely.
  currentSessionIndex = -1;
  currentPageId = null;
  userScrolledUp = false;

  // renderActivePage() handles showing the WelcomeCard + session list correctly.
  renderActivePage();
  // Restore cursor so the user can immediately type for a new chat.
  setTimeout(() => { UI.inputBox.focus(); }, 30);
}

// Nav: Shift + Left/Right for branch switching
screen.key('S-left', () => switchBranch(-1));
UI.inputBox.key('S-left', () => switchBranch(-1));
screen.key('S-right', () => switchBranch(1));
UI.inputBox.key('S-right', () => switchBranch(1));

screen.key('C-n', startNewSession);
UI.inputBox.key('C-n', startNewSession);

// Page list helpers
function openPageList() {
  pauseScroll();

  if (currentSessionIndex === -1) {
    // At index page - show session list
    const items = sessions.map((s, i) => {
      const rootPage = s.pages[s.rootPageId];
      const prompt = rootPage ? rootPage.prompt : '(empty)';
      const truncated = prompt.length > 50 ? prompt.substring(0, 47) + '...' : prompt;
      const marker = i === currentSessionIndex ? ' ●' : '';
      return `  ${i + 1}. ${s.name || truncated}${marker}`;
    });
    UI.pageListView.setItems(items);
    UI.pageListView.setLabel(` {bold}◆ SESSIONS (${sessions.length}) ◆{/bold} `);
    UI.pageListView.select(0);
  } else {
    // Within a session - show the CURRENT PATH (branch)
    const session = sessions[currentSessionIndex];
    const path = getPathToPage(session, currentPageId);
    
    const items = path.map((p, i) => {
      const truncated = p.prompt.length > 50 ? p.prompt.substring(0, 47) + '...' : p.prompt;
      const marker = p.id === currentPageId ? ' ●' : '';
      return `  ${i + 1}. ${truncated}${marker}`;
    });
    
    UI.pageListView.setItems(items);
    UI.pageListView.setLabel(` {bold}◆ BRANCH PATH (${path.length} steps) ◆{/bold} `);
    
    // Select the current step in path
    const currentStepIdx = path.findIndex(p => p.id === currentPageId);
    UI.pageListView.select(currentStepIdx >= 0 ? currentStepIdx : 0);
  }

  UI.inputContainer.hide();
  UI.pageListView.show();
  UI.pageListView.focus();
  forceRender();
}

function closePageList() {
  UI.pageListView.hide();
  UI.inputContainer.show();
  UI.inputBox.focus();
  resumeScroll();
  forceRender();
}

// Page list event handlers
UI.pageListView.on('select', (item, idx) => {
  closePageList();
  if (currentSessionIndex === -1) {
    // Navigate to root of selected session
    navigateToPage(idx, null);
  } else {
    // Navigate to selected page in the current branch path
    const session = sessions[currentSessionIndex];
    const path = getPathToPage(session, currentPageId);
    if (path[idx]) {
      navigateToPage(currentSessionIndex, path[idx].id);
    }
  }
});

UI.pageListView.key(['up', 'k'], () => { UI.pageListView.up(); requestRender(); });
UI.pageListView.key(['down', 'j'], () => { UI.pageListView.down(); requestRender(); });
UI.pageListView.key('escape', () => closePageList());

// Track user scroll during streaming
UI.outputArea.on('scroll', () => {
  if (isProcessingCommand && currentMode === 'auto') {
    // If user scrolled away from the bottom, mark as scrolled up
    const scrollHeight = UI.outputArea.getScrollHeight();
    const currentScroll = UI.outputArea.getScroll();
    const viewHeight = UI.outputArea.height;
    if (scrollHeight - currentScroll > viewHeight + 2) {
      userScrolledUp = true;
    } else {
      userScrolledUp = false;
    }
  }
});

// ==============================================
// GLOBAL KEYS
// ==============================================

screen.on('resize', () => {
  // Re-render active page on resize for proper line wrapping
  if (currentMode === 'auto' && sessions.length > 0 && currentSessionIndex >= 0) {
    renderActivePage();
  }
  requestRender();
});

screen.key(['q', 'C-c'], () => {
  cancelLLM();
  cleanupAndExit();
});

// Escape: Return to Index Page (Auto mode) or quit
screen.key('escape', () => {
  if (UI.pageListView.visible) {
    closePageList();
    return;
  }
  if (UI.modelList.visible) {
    closeModelSelection();
    return;
  }
  if (currentMode === 'auto') {
    if (sessions.length > 0) {
      // Return to Index Page
      navigateToPage(-1, -1);
    } else {
      cancelLLM();
      cleanupAndExit();
    }
  } else {
    cancelLLM();
    cleanupAndExit();
  }
});

// ======================
// START
// ======================

(async () => {
  logger.info('APP', 'Starting Heeba Terminal');

  updateWelcomeCard();
  forceRender();

  await runBootSequence(overlays, UI, screen, CONFIG);

  // In Auto mode, suppress boot messages since session history takes that space
  if (currentMode !== 'auto') {
    addOutput('Heeba | Code Space v1.0 - Online', 'success');
    addOutput('Engine: llama.cpp (local GGUF)', 'info');
    addOutput(`Model: ${CONFIG.model}`, 'info');
    addOutput('Type "help" for available commands', 'info');
    addSpacer();
  } else {
    // In auto mode, show session index page
    navigateToPage(-1, -1);
  }

  logger.info('APP', 'Boot complete');
})();
