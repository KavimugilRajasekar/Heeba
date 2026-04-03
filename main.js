#!/usr/bin/env node
const os = require('os');
const blessed = require('blessed');
const logger = require('./src/utils/logger');

// Modules
const { state, estimateTokens, getPathToPage, deletePage } = require('./src/core/state-manager');
const { DEFAULT_CONFIG, getAvailableModels } = require('./src/core/config');
const { loadHeebaConfig } = require('./src/core/config-loader');
const { initScreen, createUI } = require('./src/ui/components');
const { createOverlays, runBootSequence, startLoadingAnimation } = require('./src/ui/animations');
const { requestRender, forceRender } = require('./src/ui/render-manager');
const { requestScroll } = require('./src/ui/scroll-manager');
const { queryLLM, cancelLLM, clearConversationHistory, stopServer, generateTurnTitle } = require('./src/core/engine');
const { parseCommandFromResponse, executeCommand } = require('./src/core/intent-executor');
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

// Load config
const heebaConfig = loadHeebaConfig();
logger.info('CONFIG', `Loaded heeba.json for user: ${heebaConfig.user_profile.name}`);

// Initialize UI
const screen = initScreen();
const UI = createUI(screen);
const overlays = createOverlays(UI.container);

// Stats loop
setInterval(() => refreshStats(UI, screen), 1000);

// Cleanup
function cleanupAndExit() { stopServer(); process.exit(0); }
process.on('SIGINT', cleanupAndExit);
process.on('SIGTERM', cleanupAndExit);
process.on('exit', () => stopServer());

// Command Logic
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

    const parentId = session.pages[state.currentPageId]?.parentId;
    deletePage(session, state.currentPageId, 'branch');
    state.currentPageId = parentId;
    state.userScrolledUp = false;
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
      // Try matching without suffix
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

  UI.welcomeCard.hide();
  updatePageIndicator(UI, state);
  renderActivePage(UI, screen, state);
  showLoading(UI, overlays, screen, state, true);
  state.isProcessingCommand = true;

  // Thinking indicator logic
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

  let liveTextEl = null;
  let fullResponse = '';
  let thinkingDestroyed = false;

  try {
    await queryLLM(input, state.currentMode, state.CONFIG, (token) => {
      if (!thinkingDestroyed && thinkingEl) { clearInterval(thinkingInterval); thinkingEl.destroy(); thinkingEl = null; thinkingDestroyed = true; }
      if (!liveTextEl) {
        startLoadingAnimation(UI, overlays, screen, MODES.auto, true);
        clearDynamicContent(UI, state); state.lineCount = 1;
        blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ※ You`, fg: C.purple, bold: true });
        blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`, fg: C.border });
        input.split('\n').forEach(pl => { blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${pl}`, fg: C.fg }); });
        state.lineCount++;
        blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ⁜ Heeba`, fg: C.yellow, bold: true });
        blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`, fg: C.border });
        liveTextEl = blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: '  ', fg: C.fg });
      }
      liveTextEl.setContent(liveTextEl.getContent() + token);
      fullResponse += token;
      if (!state.userScrolledUp) requestScroll();
      requestRender();
    }, llmHistory);

    showLoading(UI, overlays, screen, state, false);
    newPage._streaming = false;
    newPage.response = fullResponse;
    newPage.tokens = estimateTokens(newPage.prompt + newPage.response);

    if (!newPage.title) {
      generateTurnTitle(newPage.prompt, newPage.response, state.CONFIG).then(title => {
        if (title) {
          newPage.title = title;
          if (session.rootPageId === newPageId && !session.name) session.name = title;
          if (state.currentSessionIndex === -1) renderIndexPage(UI, screen, state);
        }
      }).catch(() => {});
    }

    renderActivePage(UI, screen, state);
    setTimeout(() => { UI.inputBox.focus(); }, 30);

    const command = parseCommandFromResponse(fullResponse);
    if (command && command.action) {
      const result = await executeCommand(command, {
        screen, UI,
        currentSession: (state.currentSessionIndex >= 0 && state.currentSessionIndex < state.sessions.length) ? state.sessions[state.currentSessionIndex] : null,
        currentPage: newPage,
        onSessionRenamed: (newName) => { if (state.currentSessionIndex === -1) UI.cardTitle.setContent(newName); renderIndexPage(UI, screen, state); requestRender(); },
        onConversationRenamed: (newTitle) => { renderIndexPage(UI, screen, state); requestRender(); },
        onSessionDeleted: () => {
          if (state.currentSessionIndex >= 0 && state.currentSessionIndex < state.sessions.length) state.sessions.splice(state.currentSessionIndex, 1);
          state.currentSessionIndex = -1; state.currentPageId = null; state.userScrolledUp = false;
          renderActivePage(UI, screen, state);
          setTimeout(() => { UI.inputBox.focus(); }, 30);
        },
        onPageDeleted: (newCurrentPageId) => {
          state.currentPageId = newCurrentPageId;
          state.userScrolledUp = false;
          renderActivePage(UI, screen, state);
          setTimeout(() => { UI.inputBox.focus(); }, 30);
        }
      });
      if (result && result.success) {
        if (command.action === 'update_user_profile') updateWelcomeCard(UI, screen, state);
        newPage.response += `\n\n---\n\u2713 ${result.message}`;
        renderActivePage(UI, screen, state);
      } else if (result) {
        newPage.response += `\n\n---\n\u2717 Failed: ${result.message}`;
        renderActivePage(UI, screen, state);
      }
      setTimeout(() => { UI.inputBox.focus(); }, 30);
    }
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
  goToPrevPage: () => {
    if (state.currentSessionIndex === -1) return;
    const session = state.sessions[state.currentSessionIndex];
    const parentId = session.pages[state.currentPageId]?.parentId;
    if (parentId) { state.currentPageId = parentId; renderActivePage(UI, screen, state); }
    else { const oldIdx = state.currentSessionIndex; navigateToPage(UI, screen, state, -1, null); state.selectedSessionIndex = oldIdx >= 0 ? oldIdx : 0; renderActivePage(UI, screen, state); }
  },
  goToNextPage: () => {
    if (state.currentSessionIndex === -1) { if (state.sessions[state.selectedSessionIndex]) navigateToPage(UI, screen, state, state.selectedSessionIndex, null); }
    else {
      const session = state.sessions[state.currentSessionIndex];
      const children = session.pages[state.currentPageId]?.children;
      if (children && children.length > 0) { state.currentPageId = children[0]; renderActivePage(UI, screen, state); }
    }
  },
  switchBranch: (dir) => {
    if (state.currentSessionIndex === -1) return;
    const { getBrotherPages } = require('./src/core/state-manager');
    const b = getBrotherPages(state.sessions[state.currentSessionIndex], state.currentPageId);
    if (b.total > 1) {
      let nid = (b.index + dir) % b.total;
      if (nid < 0) nid = b.total - 1;
      state.currentPageId = b.list[nid];
      renderActivePage(UI, screen, state);
    }
  },
  closePageList: () => closePageList(UI)
};

// Input Handling Setup
setupInputHandlers(UI, screen, state, overlays, actions);

// Model selection handler
UI.modelList.on('select', (item) => {
  const content = (item.getText ? item.getText() : item.content);
  state.CONFIG.model = content.split('{')[0].split('(')[0].trim();
  clearConversationHistory();
  updateWelcomeCard(UI, screen, state);
  closeModelSelection(UI);
  if (state.currentSessionIndex === -1) renderActivePage(UI, screen, state);
});

// Page list selection handler
UI.pageListView.on('select', (item, idx) => {
  closePageList(UI);
  if (state.currentSessionIndex === -1) navigateToPage(UI, screen, state, idx, null);
  else {
    const { getPathToPage } = require('./src/core/state-manager');
    const path = getPathToPage(state.sessions[state.currentSessionIndex], state.currentPageId);
    if (path[idx]) navigateToPage(UI, screen, state, state.currentSessionIndex, path[idx].id);
  }
});

// Global events
screen.on('resize', () => { if (state.sessions.length > 0 && state.currentSessionIndex >= 0) renderActivePage(UI, screen, state); requestRender(); });
screen.key(['q', 'C-c'], () => { cancelLLM(); cleanupAndExit(); });
screen.key('escape', () => {
    if (UI.pageListView.visible) closePageList(UI);
    else if (UI.modelList.visible) closeModelSelection(UI);
    else if (state.sessions.length > 0) navigateToPage(UI, screen, state, -1, -1);
    else { cancelLLM(); cleanupAndExit(); }
});

// Start
(async () => {
  logger.info('APP', 'Starting Heeba Terminal');
  updateWelcomeCard(UI, screen, state);
  forceRender();
  await runBootSequence(overlays, UI, screen, state.CONFIG);
  navigateToPage(UI, screen, state, -1, -1);
  logger.info('APP', 'Boot complete');
})();
