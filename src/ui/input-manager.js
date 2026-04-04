// src/ui/input-manager.js
const { requestRender } = require('./render-manager');

function resizeInput(UI, screen, state) {
  if (state.isProcessingCommand) return;
  const text = UI.inputBox.getValue();
  const width = (typeof UI.inputBox.width === 'number' ? UI.inputBox.width : screen.width - 6) - 2;
  const bufferLines = text.split('\n');
  let visualLines = 0;
  bufferLines.forEach(line => { visualLines += Math.max(1, Math.ceil(line.length / Math.max(1, width))); });
  const newHeight = Math.min(12, visualLines);
  if (UI.inputBox.height !== newHeight) {
    UI.inputBox.height = newHeight;
    UI.inputContainer.height = newHeight + 2;
    UI.outputArea.height = `100%-${5 + newHeight}`;
    requestRender();
  }
}

function setupInputHandlers(UI, screen, state, overlays, actions) {
  const { processCommand, navigateToPage, renderActivePage, openModelSelection, closeModelSelection, startNewSession, openPageListIfAvailable } = actions;

  UI.inputBox.key('enter', async (ch, key) => {
    if (key.shift) return;
    const command = UI.inputBox.getValue().trim();
    if (!command) {
      if (state.currentSessionIndex === -1 && state.sessions.length > 0) {
        navigateToPage(state.selectedSessionIndex, null);
        return;
      }
      UI.inputBox.clearValue(); UI.inputBox.height = 1; UI.inputContainer.height = 3; UI.outputArea.height = '100%-7';
      requestRender(); UI.inputBox.focus(); return;
    }
    UI.inputBox.clearValue(); UI.inputBox.height = 1; UI.inputContainer.height = 3; UI.outputArea.height = '100%-7';
    await processCommand(command);
    if (command) { state.commandHistory.push(command); state.historyIndex = state.commandHistory.length; }
    requestRender(); UI.inputBox.focus();
  });

  UI.inputBox.on('keypress', () => resizeInput(UI, screen, state));

  UI.inputBox.key('up', () => {
    if (state.currentSessionIndex === -1 && UI.inputBox.getValue().trim() === '' && state.sessions.length > 0) {
      if (state.selectedSessionIndex > 0) { state.selectedSessionIndex--; renderActivePage(); }
      return;
    }
    if (UI.inputBox.getLines().length > 1 && UI.inputBox.getValue().trim() !== '') return;
    if (state.historyIndex > 0) {
      state.historyIndex--;
      UI.inputBox.setValue(state.commandHistory[state.historyIndex]);
      setImmediate(() => { resizeInput(UI, screen, state); requestRender(); });
    }
  });

  UI.inputBox.key('down', () => {
    if (state.currentSessionIndex === -1 && UI.inputBox.getValue().trim() === '' && state.sessions.length > 0) {
      if (state.selectedSessionIndex < state.sessions.length - 1) { state.selectedSessionIndex++; renderActivePage(); }
      return;
    }
    if (UI.inputBox.getLines().length > 1 && UI.inputBox.getValue().trim() !== '') return;
    if (state.historyIndex < state.commandHistory.length - 1) {
      state.historyIndex++;
      UI.inputBox.setValue(state.commandHistory[state.historyIndex]);
    } else {
      state.historyIndex = state.commandHistory.length;
      UI.inputBox.clearValue();
    }
    setImmediate(() => { resizeInput(UI, screen, state); requestRender(); });
  });

  // Navigation and other global-ish keys that are often focused on input
  UI.inputBox.key('C-left', actions.goToPrevPage);
  UI.inputBox.key('C-right', actions.goToNextPage);
  UI.inputBox.key('C-p', actions.goToPrevPage);
  UI.inputBox.key('C-l', actions.openPageListIfAvailable);
  UI.inputBox.key('C-n', actions.startNewSession);
  UI.inputBox.key('S-left', () => actions.switchBranch(-1));
  UI.inputBox.key('S-right', () => actions.switchBranch(1));

  UI.inputBox.key('left', () => { if (UI.inputBox._clines) { screen.focusOffset(-1); requestRender(); } });
  UI.inputBox.key('right', () => { if (UI.inputBox._clines) { screen.focusOffset(1); requestRender(); } });

  UI.modelList.key(['up', 'k', 'down', 'j', 'escape'], (ch, key) => {
     if (key.name === 'escape') closeModelSelection();
     else if (key.name === 'up' || ch === 'k') { UI.modelList.up(); requestRender(); }
     else if (key.name === 'down' || ch === 'j') { UI.modelList.down(); requestRender(); }
  });

  UI.pageListView.key(['up', 'k', 'down', 'j', 'escape'], (ch, key) => {
    if (key.name === 'escape') actions.closePageList();
    else if (key.name === 'up' || ch === 'k') { UI.pageListView.up(); requestRender(); }
    else if (key.name === 'down' || ch === 'j') { UI.pageListView.down(); requestRender(); }
  });
}

module.exports = { resizeInput, setupInputHandlers };
