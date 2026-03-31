#!/usr/bin/env node

const { DEFAULT_CONFIG, getAvailableModels } = require('./src/core/config');
const { C } = require('./src/ui/theme');
const { initScreen, createUI } = require('./src/ui/components');
const {
  createOverlays,
  runBootSequence,
  startLoadingAnimation,
  stopLoadingAnimation,
  startIdleAnimation
} = require('./src/ui/animations');
const { MODES } = require('./src/utils/helpers');
const logger = require('./src/utils/logger');
const {
  queryLLM,
  cancelLLM,
  getLLMStatus,
  clearConversationHistory,
  stopServer
} = require('./src/core/engine');

// ======================
// STATE
// ======================
let currentMode = 'task';
let commandHistory = [];
let historyIndex = -1;
let lineCount = 0;
let lastOutputWasCommand = false;
const startTime = Date.now();
const CONFIG = { ...DEFAULT_CONFIG };

// Keyboard state
let lastShiftPress = 0;

// Initialize blessed
const screen = initScreen();
const UI = createUI(screen);
const overlays = createOverlays(UI.container);

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
  logger.debug('UI', `Updating welcome card: ${currentMode}`);

  // Top bar - only update model name
  UI.modelTag.setContent(CONFIG.model.replace('.gguf', ''));

  // Welcome card header
  UI.modeIndicator.setContent(`● ${m.name.toUpperCase()}`);
  UI.modeIndicator.style.fg = m.color;
  UI.cardTitle.setContent(`Heeba ${m.headerTitle}`);
  UI.cardHeaderRight.setContent(getLLMStatus() ? 'llama.cpp ●' : 'llama.cpp');

  // Mascot
  UI.mascotEl.setContent(m.mascot[0]);
  UI.mascotEl.style.fg = m.color;

  // Info
  UI.statusLinesEl.setContent(m.statusLines);
  UI.engineInfoEl.setContent(`Engine : llama.cpp (local)\nModel  : ${CONFIG.model}`);
  UI.tipsText.setContent(m.tips.join('   '));

  // Input prompt
  UI.promptText.setContent(`>`);
  UI.promptText.style.fg = m.color;

  // Footer status
  UI.footerStatus.setContent('● ready');
  UI.footerStatus.style.fg = C.green;

  // Start idle animation
  startIdleAnimation(UI, screen, m);
}

// ChatGPT-like auto-scroll to bottom
function autoScroll() {
  UI.outputArea.setScroll(999999); // Set to a very large number to scroll to bottom
  screen.render();
}

function clearOutput() {
  UI.outputArea.children.forEach(c => c.destroy());
  lineCount = 0;
  autoScroll();
}

function addOutput(text, className = '') {
  if (text == null || text === '') return;

  const textStr = String(text);
  const prefix = {
    command: `${MODES[currentMode].prompt} `,
    error: '[ERR] ',
    success: '[OK] ',
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
    require('blessed').text({
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

function showLoading(show) {
  if (show) {
    UI.promptText.setContent(`>`);
    startLoadingAnimation(UI, overlays, screen, MODES[currentMode]);
  } else {
    UI.promptText.setContent(`>`);
    stopLoadingAnimation(UI, overlays, screen, MODES[currentMode]);
  }
  UI.cardHeaderRight.setContent(show ? 'llama.cpp ●' : 'llama.cpp');
  UI.footerStatus.setContent(show ? '● busy' : '● ready');
  UI.footerStatus.style.fg = show ? C.yellow : C.green;
}

function switchMode(newMode) {
  logger.info('MODE', `Switching: ${currentMode} → ${newMode}`);

  overlays.modeOverlayText.setContent(`Switching to ${MODES[newMode].name} mode...`);
  overlays.modeOverlayText.style.fg = MODES[newMode].color;
  overlays.modeOverlay.show();
  overlays.modeOverlay.setFront();
  screen.render();

  setTimeout(() => {
    overlays.modeOverlay.hide();
    currentMode = newMode;
    updateWelcomeCard();
    screen.render();
    addSpacer();
    addOutput(`Switched to ${MODES[newMode].name} Mode`, 'success');
  }, 500);
}

function openModelSelection() {
  const models = getAvailableModels();
  addOutput('Scanning engine/models/...', 'info');

  if (models.length === 0) {
    addOutput('No models found in engine/models/', 'error');
    return;
  }

  UI.inputContainer.hide();
  UI.modelList.setItems(models);
  UI.modelList.setLabel(` [ SELECT MODEL: ${models.length} FOUND ] `);
  UI.modelList.show();
  UI.modelList.focus();
  screen.render();
}

function closeModelSelection() {
  UI.modelList.hide();
  UI.inputContainer.show();
  UI.inputBox.focus();
  screen.render();
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
      return `Model set to: ${newModel}`;
    }
    return `Model not found: ${sel}`;
  }

  if (trimmed === 'clear') {
    clearOutput();
    if (currentMode === 'auto') clearConversationHistory();
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
    showLoading(true);
    
    // Create animated thinking indicator
    const thinkingFrames = ['○', '◎', '◉', '●', '◉', '◎'];
    let frame = 0;
    const thinkingEl = require('blessed').text({
      parent: UI.outputArea,
      top: lineCount,
      left: 0,
      width: '100%',
      content: `${thinkingFrames[0]} Thinking...`,
      fg: C.cyan
    });
    
    const thinkingInterval = setInterval(() => {
      frame = (frame + 1) % thinkingFrames.length;
      thinkingEl.setContent(`${thinkingFrames[frame]} Thinking...`);
      screen.render();
    }, 150);

    let liveTextEl = null;

    try {
      await queryLLM(input, currentMode, CONFIG, (token) => {
        // Destroy thinking indicator on first token
        if (thinkingEl) {
          clearInterval(thinkingInterval);
          thinkingEl.destroy();
          // Reset thinkingEl ref to prevent further calls
          // (Actually, the lineCount will be overwritten by liveTextEl)
        }

        if (!liveTextEl) {
          startLoadingAnimation(UI, overlays, screen, MODES[currentMode], true);
          addSpacer();
          liveTextEl = require('blessed').text({
            parent: UI.outputArea,
            top: lineCount++,
            left: 0,
            width: '100%',
            content: '↪ ',
            fg: C.yellow
          });
        }
        liveTextEl.setContent(liveTextEl.getContent() + token);
        autoScroll();
      });

      showLoading(false);

      if (liveTextEl) {
        const actualLines = liveTextEl.getLines().length;
        if (actualLines > 1) lineCount += (actualLines - 1);
      }
      return '';
    } catch (err) {
      if (thinkingEl) { clearInterval(thinkingInterval); thinkingEl.destroy(); }
      showLoading(false);
      logger.error('ENGINE', err);
      return `LLM Error: ${err.message}`;
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
    // Start height: 12 (top) + 1 (bottom gap) + 3 (input) + 1 (footer) = 17
    // Each extra input line adds +1 to negative offset
    UI.outputArea.height = `100%-${16 + newHeight}`; 
    screen.render();
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
    UI.outputArea.height = '100%-17';
    screen.render();
    setTimeout(() => { UI.inputBox.focus(); screen.render(); }, 50);
    return;
  }

  UI.inputBox.clearValue();
  
  // Reset height after submission
  UI.inputBox.height = 1;
  UI.inputContainer.height = 3;
  UI.outputArea.height = '100%-17';
  
  addOutput(command, 'command');
  lastOutputWasCommand = true;

  const response = await processCommand(command);
  if (response) { addSpacer(); addOutput(response, 'response'); }

  if (command) {
    commandHistory.push(command);
    historyIndex = commandHistory.length;
  }

  screen.render();
  setTimeout(() => { UI.inputBox.focus(); screen.render(); }, 50);
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
    screen.render();
  }
});

UI.inputBox.key('right', () => {
  if (UI.inputBox._clines) {
    screen.focusOffset(1);
    screen.render();
  }
});

UI.modelList.on('select', (item) => {
  const newModel = (item.getText ? item.getText() : item.content).split('(')[0].trim();
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
UI.modelList.key(['up', 'k'], () => { UI.modelList.up(); screen.render(); });
UI.modelList.key(['down', 'j'], () => { UI.modelList.down(); screen.render(); });
UI.modelList.key('escape', () => closeModelSelection());

UI.modelList.key('enter', () => {
  const selectedIndex = UI.modelList.selected;
  const items = UI.modelList.items;
  const item = items[selectedIndex];
  if (!item) return;

  const content = (item.getText ? item.getText() : item.content).split('(')[0].trim();
  CONFIG.model = content;
  clearConversationHistory();
  updateWelcomeCard();
  closeModelSelection();
  addSpacer();
  addOutput(`Model set to: ${content}`, 'success');
});

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
      screen.render();
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
    screen.render();
  });
});

// ==============================================
// MODE SWITCH - SHIFT+SPACE
// ==============================================

// Direct Shift+Space combination
screen.key('S-space', () => {
  logger.debug('KEYBOARD', 'S-space detected');
  if (!UI.modelList.visible) {
    switchMode(currentMode === 'task' ? 'auto' : 'task');
  }
});

// Space as fallback only if not typing
screen.key('space', () => {
  if (UI.modelList.visible) {
    UI.modelList.down();
    screen.render();
  }
});

// Ctrl+g as universal fallback
screen.key('C-g', () => {
  logger.debug('KEYBOARD', 'Ctrl+g detected');
  if (!UI.modelList.visible) {
    switchMode(currentMode === 'task' ? 'auto' : 'task');
  }
});

// ==============================================
// GLOBAL KEYS
// ==============================================

screen.on('resize', () => { screen.render(); });

screen.key(['escape', 'q', 'C-c'], () => {
  cancelLLM();
  cleanupAndExit();
});

// ======================
// START
// ======================

(async () => {
  logger.info('APP', 'Starting Heeba Terminal');

  updateWelcomeCard();
  screen.render();

  await runBootSequence(overlays, UI, screen, CONFIG);

  addOutput('Heeba Terminal v1.0 - Online', 'success');
  addOutput('Engine: llama.cpp (local GGUF)', 'info');
  addOutput(`Model: ${CONFIG.model}`, 'info');
  addOutput('Type "help" for available commands', 'info');
  addSpacer();

  logger.info('APP', 'Boot complete');
})();
