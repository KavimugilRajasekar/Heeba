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

// PromptPage Workspace State (Auto mode only)
let pages = [];           // Array of PromptPage objects
let currentPageIndex = -1; // Index of the active page (-1 = no pages)
let userScrolledUp = false; // Track if user manually scrolled during streaming

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

  // WelcomeCard visibility: hide if we have pages in auto mode
  if (currentMode === 'auto' && pages.length > 0) {
    UI.welcomeCard.hide();
  } else {
    UI.welcomeCard.show();
  }

  // Start animations
  startIdleAnimation(UI, screen, m);
  startTipsAnimation(UI, screen, m);

  requestRender();
}

function updatePageIndicator() {
  if (currentMode === 'auto' && pages.length > 0) {
    UI.pageIndicator.setContent(`Page ${currentPageIndex + 1}/${pages.length}`);
  } else {
    UI.pageIndicator.setContent('');
  }
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
    llm: '↪ '
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
 * Render the active PromptPage into the outputArea.
 * Clears all dynamic content and rebuilds from the page data.
 */
function renderActivePage() {
  if (currentPageIndex < 0 || currentPageIndex >= pages.length) return;

  const page = pages[currentPageIndex];
  clearDynamicContent();
  UI.welcomeCard.hide();

  // ── User prompt header ──
  lineCount = 1;

  // Prompt label
  blessed.text({
    parent: UI.outputArea,
    top: lineCount++,
    left: 0,
    width: '100%',
    content: `  ※ You`,
    fg: C.purple,
    bold: true
  });

  // Separator
  blessed.text({
    parent: UI.outputArea,
    top: lineCount++,
    left: 0,
    width: '100%',
    content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`,
    fg: C.border
  });

  // User prompt text (wrapped)
  const promptLines = page.prompt.split('\n');
  promptLines.forEach(pl => {
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
    // Response label
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: `  ↪ Heeba`,
      fg: C.yellow,
      bold: true
    });

    // Separator
    blessed.text({
      parent: UI.outputArea,
      top: lineCount++,
      left: 0,
      width: '100%',
      content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`,
      fg: C.border
    });

    // Render markdown response
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

  lineCount++; // trailing spacer
  updatePageIndicator();
  requestRender();
  autoScroll();
}

/**
 * Navigate to a specific page index.
 */
function navigateToPage(idx) {
  if (idx < 0 || idx >= pages.length) return;
  // Save current scroll offset
  if (currentPageIndex >= 0 && currentPageIndex < pages.length) {
    pages[currentPageIndex].scrollOffset = UI.outputArea.getScroll();
  }
  currentPageIndex = idx;
  renderActivePage();
  // Restore saved scroll offset
  if (pages[currentPageIndex].scrollOffset) {
    try { UI.outputArea.setScroll(pages[currentPageIndex].scrollOffset); } catch(e) {}
  }
}

function showLoading(show) {
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

    // When switching to auto mode with existing pages, render the last page
    if (newMode === 'auto' && pages.length > 0) {
      renderActivePage();
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
  addOutput('Scanning engine/models/...', 'info');
  pauseScroll();

  if (models.length === 0) {
    addOutput('No models found in engine/models/', 'error');
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
      addSpacer(); 
      return `Model set to: ${newModel}`;
    }
    return `Model not found: ${sel}`;
  }

  if (trimmed === 'clear') {
    clearOutput();
    if (currentMode === 'auto') {
      clearConversationHistory();
      pages = [];
      currentPageIndex = -1;
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
    // PromptPage Workspace: Create a new page for this prompt
    const newPage = {
      id: pages.length + 1,
      prompt: input,
      response: '',
      scrollOffset: 0,
      createdAt: Date.now(),
      _streaming: true
    };
    pages.push(newPage);
    currentPageIndex = pages.length - 1;
    userScrolledUp = false;

    // Hide WelcomeCard permanently after first prompt
    UI.welcomeCard.hide();
    updatePageIndicator();

    // Render the new page (shows the prompt + "Thinking...")
    renderActivePage();

    showLoading(true);
    isProcessingCommand = true;

    // Create animated thinking indicator inside the page
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
          // Re-render the page fresh with response header
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
          blessed.text({ parent: UI.outputArea, top: lineCount++, left: 0, width: '100%', content: `  ↪ Heeba`, fg: C.yellow, bold: true });
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
      });

      showLoading(false);

      // Store final response in the page
      newPage.response = fullResponse;
      newPage._streaming = false;

      // Re-render the page with proper markdown formatting
      renderActivePage();

      // Check for structured commands in LLM response
      const command = parseCommandFromResponse(fullResponse);
      if (command && command.action) {
        const ctx = { screen, UI };
        const result = await executeCommand(command, ctx);
        if (result && result.success) {
          if (command.action === 'update_user_profile') {
            updateWelcomeCard();
          }
          // Append command result to the page response
          newPage.response += `\n\n---\n✓ ${result.message}`;
          renderActivePage();
        } else if (result) {
          newPage.response += `\n\n---\n✗ Failed: ${result.message}`;
          renderActivePage();
        }
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
  addSpacer();
  addOutput(`Model set to: ${newModel}`, 'success');
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

// Ctrl+Left: Previous page
screen.key('C-left', () => {
  if (currentMode === 'auto' && pages.length > 0 && currentPageIndex > 0) {
    navigateToPage(currentPageIndex - 1);
  }
});

// Ctrl+Right: Next page
screen.key('C-right', () => {
  if (currentMode === 'auto' && pages.length > 0 && currentPageIndex < pages.length - 1) {
    navigateToPage(currentPageIndex + 1);
  }
});

// Ctrl+L: Open page list view
screen.key('C-l', () => {
  if (currentMode === 'auto' && pages.length > 0 && !UI.pageListView.visible) {
    openPageList();
  }
});

// Page list helpers
function openPageList() {
  pauseScroll();
  const items = pages.map((p, i) => {
    const truncated = p.prompt.length > 50 ? p.prompt.substring(0, 47) + '...' : p.prompt;
    const marker = i === currentPageIndex ? ' ●' : '';
    return `  ${i + 1}. ${truncated}${marker}`;
  });
  UI.pageListView.setItems(items);
  UI.pageListView.setLabel(` {bold}◆ PROMPT PAGES (${pages.length}) ◆{/bold} `);
  UI.pageListView.select(currentPageIndex);
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
  navigateToPage(idx);
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
  if (currentMode === 'auto' && pages.length > 0 && currentPageIndex >= 0) {
    renderActivePage();
  }
  requestRender();
});

screen.key(['q', 'C-c'], () => {
  cancelLLM();
  cleanupAndExit();
});

// Escape: Jump to latest page (Auto mode) or quit
screen.key('escape', () => {
  if (UI.pageListView.visible) {
    closePageList();
    return;
  }
  if (UI.modelList.visible) {
    closeModelSelection();
    return;
  }
  if (currentMode === 'auto' && pages.length > 0) {
    // Jump to latest page
    navigateToPage(pages.length - 1);
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

  addOutput('Heeba | Code Space v1.0 - Online', 'success');
  addOutput('Engine: llama.cpp (local GGUF)', 'info');
  addOutput(`Model: ${CONFIG.model}`, 'info');
  addOutput('Type "help" for available commands', 'info');
  addSpacer();

  logger.info('APP', 'Boot complete');
})();
