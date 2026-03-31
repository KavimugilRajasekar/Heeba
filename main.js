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
const { 
  queryLLM, 
  cancelLLM, 
  getLLMStatus, 
  clearConversationHistory,
  stopServer 
} = require('./src/core/engine');

// ... (Rest of imports)

// ... (State and UI init)

function cleanupAndExit() {
  stopServer();
  process.exit(0);
}

process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
process.on('exit', () => stopServer());

// State
let currentMode = 'task';
let commandHistory = [];
let historyIndex = -1;
let lineCount = 0;
const startTime = Date.now();
const CONFIG = { ...DEFAULT_CONFIG };

// Initialize blessed
const screen = initScreen();
const UI = createUI(screen);
const overlays = createOverlays(UI.container);

// ======================
// UI FUNCTIONS
// ======================

function updateWelcomeCard() {
  const m = MODES[currentMode];
  UI.modeIndicator.setContent(`● ${m.name.toUpperCase()}`);
  UI.modeIndicator.style.fg = m.color;
  UI.cardTitle.setContent(`| Heeba : ${m.headerTitle}`);
  UI.mascotEl.setContent(m.mascot[0]);
  UI.mascotEl.style.fg = m.color;
  UI.statusLinesEl.setContent(m.statusLines);
  UI.engineInfoEl.setContent(`Engine : llama.cpp (local)\nModel  : ${CONFIG.model}`);
  UI.tipsText.setContent(m.tips.map(t => '> ' + t).join('\n'));
  UI.promptText.setContent(`[${m.prompt}]`);
  UI.promptText.style.fg = m.color;
  
  // Start subtle idle animation (blinking)
  startIdleAnimation(UI, screen, m);
}

function autoScroll() {
  UI.outputArea.setScroll(Infinity);
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
  const prefix = { command: `[${MODES[currentMode].prompt}] `, error: '[ERR] ', success: '[OK] ', info: '>> ', llm: '[AI] ' }[className] || '';
  const color = { command: C.purple, error: C.red, success: C.green, info: C.cyan, llm: C.yellow }[className] || C.dim;

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

function addSpacer() { lineCount++; autoScroll(); }

function showLoading(show) { 
  if (show) {
    UI.promptText.setContent(`[thinking...]`);
    startLoadingAnimation(UI, overlays, screen, MODES[currentMode]);
  } else {
    UI.promptText.setContent(`[${MODES[currentMode].prompt}]`);
    stopLoadingAnimation(UI, overlays, screen, MODES[currentMode]);
  }
}

function switchMode(newMode) {
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
  
  // Dynamic scanning indicator
  addOutput('Scanning engine/models/...', 'info');
  
  if (models.length === 0) {
    addOutput('No models found in engine/models/', 'error');
    return;
  }

  UI.inputContainer.hide();
  UI.modelList.setItems(models);
  UI.modelList.setLabel(` [ SELECT MODEL: ${models.length} FOUND ] `);
  UI.modelList.show();
  
  // Delay focus slightly to ensure the hide event has cleared the focus path
  setTimeout(() => {
    UI.modelList.focus();
    screen.render();
  }, 10);
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
  Shift+Space - Switch mode (DINO <-> CAT)
  mode task   - Switch to DINO mode
  mode auto   - Switch to CAT mode
  models      - List available models
  model <n>   - Select model by number
  model <name> - Select model by name
  clear       - Clear terminal output
  info        - Show system information
  cancel      - Cancel ongoing LLM request
  help        - Show this help`;
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
      return `Model set to: ${newModel}\nConversation history cleared.`;
    }
    return `Model not found: ${sel}\nUse "models" to see available models.`;
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
    addOutput('Thinking...', 'info');
    
    let liveTextEl = null;
    let fullResponse = '';

    try {
      const response = await queryLLM(input, currentMode, CONFIG, (token) => {
        if (!liveTextEl) {
            // Success: Switch from Thinking (Blink) to Talking (Mouth)
            startLoadingAnimation(UI, overlays, screen, MODES[currentMode], true);
            addSpacer();
            liveTextEl = require('blessed').text({
                parent: UI.outputArea,
                top: lineCount++,
                left: 0,
                width: '100%',
                content: '[AI] ',
                fg: C.yellow
            });
        }
        liveTextEl.setContent(liveTextEl.getContent() + token);
        
        // Auto-scroll logic (scroll to bottom as text grows)
        autoScroll();
      });

      // Final stop: Return mascot to idle
      showLoading(false);
      
      // Cleanup and finalize line count
      if (liveTextEl) {
          const actualLines = liveTextEl.getLines().length;
          if (actualLines > 1) lineCount += (actualLines - 1);
      }
      return '';
    } catch (err) {
      showLoading(false);
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

UI.inputBox.on('submit', async () => {
  const command = UI.inputBox.getValue();
  UI.inputBox.clearValue();
  if (!command.trim()) { 
    screen.render();
    setTimeout(() => { UI.inputBox.focus(); screen.render(); }, 50);
    return;
  }
  
  addOutput(command, 'command');
  const response = await processCommand(command);
  if (response) { addSpacer(); addOutput(response, 'response'); }
  if (command.trim()) { commandHistory.push(command); historyIndex = commandHistory.length; }
  screen.render();
  setTimeout(() => { UI.inputBox.focus(); screen.render(); }, 50);
});

// Model list selection handlers
UI.modelList.on('select', (item) => {
  const newModel = (item.getText ? item.getText() : item.content).split('(')[0].trim();
  CONFIG.model = newModel;
  clearConversationHistory();
  updateWelcomeCard();
  
  UI.modelList.hide();
  UI.inputContainer.show();
  UI.inputBox.focus();
  addSpacer();
  addOutput(`Model set to: ${newModel}`, 'success');
  screen.render();
});

UI.modelList.key('escape', () => {
  UI.modelList.hide();
  UI.inputContainer.show();
  UI.inputBox.focus();
  screen.render();
});

// Explicit arrow key handling for the list
UI.modelList.key(['up', 'k'], () => {
  UI.modelList.up();
  screen.render();
});

UI.modelList.key(['down', 'j'], () => {
  UI.modelList.down();
  screen.render();
});

// Manual Enter handler for bulletproof selection
UI.modelList.key('enter', () => {
  const selectedIndex = UI.modelList.selected;
  const items = UI.modelList.items; // This is an array of listitem elements
  const item = items[selectedIndex];
  if (!item) return;

  const content = (item.getText ? item.getText() : item.content).split('(')[0].trim();
  
  CONFIG.model = content;
  clearConversationHistory();
  updateWelcomeCard();
  
  UI.modelList.hide();
  UI.inputContainer.show();
  UI.inputBox.focus();
  addSpacer();
  addOutput(`Model set to: ${content}`, 'success');
  screen.render();
});

UI.inputBox.key('up', () => {
  if (historyIndex > 0) { historyIndex--; UI.inputBox.setValue(commandHistory[historyIndex]); screen.render(); }
});

UI.inputBox.key('down', () => {
  if (historyIndex < commandHistory.length - 1) { 
    historyIndex++; UI.inputBox.setValue(commandHistory[historyIndex]); 
  } else { 
    historyIndex = commandHistory.length; UI.inputBox.clearValue(); 
  }
  screen.render();
});

// Mode switch (Shift+Space)
screen.key(['S-space', 'S- '], () => {
  switchMode(currentMode === 'task' ? 'auto' : 'task');
});

// Fallback for terminals that handle Shift+Space as S then Space
let pendingSpace = false;
screen.key('S', () => { 
  if (UI.modelList.visible) return; // Ignore during selection
  pendingSpace = true; 
  setTimeout(() => { pendingSpace = false; }, 300); 
});
screen.key('space', () => {
  if (pendingSpace) {
    pendingSpace = false;
    switchMode(currentMode === 'task' ? 'auto' : 'task');
  }
});

screen.on('resize', () => { screen.render(); });
screen.key(['escape', 'q', 'C-c'], () => { cancelLLM(); process.exit(0); });

// ======================
// START
// ======================

(async () => {
  updateWelcomeCard();
  screen.render();
  await runBootSequence(overlays, UI, screen, CONFIG);
  addOutput('Heeba Terminal v1.0 - Online', 'success');
  addOutput('Engine: llama.cpp (local GGUF)', 'info');
  addOutput(`Model: ${CONFIG.model}`, 'info');
  addOutput('Type "help" for available commands', 'info');
  addSpacer();
})();
