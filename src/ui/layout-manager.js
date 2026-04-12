// src/ui/layout-manager.js
const blessed = require('blessed');
const { MODES } = require('../utils/helpers');
const { C } = require('./theme');
const { requestRender, forceRender } = require('./render-manager');
const { requestScroll, pauseScroll, resumeScroll } = require('./scroll-manager');
const { getHeebaConfig } = require('../core/config-loader');
const { isVirtualModel } = require('../core/ollama-adapter');
const {
  startLoadingAnimation,
  stopLoadingAnimation,
  startIdleAnimation,
  startTipsAnimation
} = require('./animations');
const { renderMarkdown } = require('./markdown-renderer');
const { clearConversationHistory, cancelLLM } = require('../core/engine');

const SESSION_HEADER_FRAMES = ['✧', '✦', '★', '✦', '✧'];
let sessionHeaderInterval = null;
let sessionHeaderFrameIdx = 0;

const ROOT_ICON_FRAMES = ['◇', '◈', '◇', '◈', '◇'];
let rootIconInterval = null;
let rootIconFrameIdx = 0;

function updateWelcomeCard(UI, screen, state) {
  const m = MODES.auto;
  const config = getHeebaConfig();

  UI.modelTag.setContent(`SelectedModel: ${state.CONFIG.model.replace('.gguf', '')}`);
  UI.topModeIndicator.setContent(`● ${m.name.toUpperCase()}`);
  UI.topModeIndicator.style.fg = m.color;

  UI.modeIndicator.setContent(`● ${m.name.toUpperCase()}`);
  UI.modeIndicator.style.fg = m.color;
  UI.cardTitle.setContent(`Heeba ${m.headerTitle}`);

  UI.welcomeUserEl.setContent(`Welcome back, ${config.user_profile.name}`);
  UI.mascotEl.setContent(m.mascot[0]);
  UI.mascotEl.style.fg = m.color;

  const isVirtual = isVirtualModel(state.CONFIG.model);
  UI.statusLinesEl.setContent(m.statusLines);
  UI.engineInfoEl.setContent(`Engine : ${isVirtual ? 'Ollama (Online)' : 'llama.cpp (local)'}\nModel  : ${state.CONFIG.model}`);
  UI.tipsText.setContent(m.tips.join('   '));

  UI.promptText.setContent(`⟫`);
  UI.promptText.style.fg = '#ffffff';

  UI.footerStatus.setContent('● ready');
  UI.footerStatus.style.fg = C.green;

  updatePageIndicator(UI, state);

  UI.welcomeCard.show();
  UI.cardTitle.setContent('Sessions');
  UI.modeIndicator.setContent(`${SESSION_HEADER_FRAMES[0]} Heeba`);
  UI.modeIndicator.style.fg = C.green;
  UI.statusLinesEl.setContent(`${state.sessions.length} session${state.sessions.length !== 1 ? 's' : ''} · Enter to open`);
  startSessionHeaderAnimation(UI);

  startIdleAnimation(UI, screen, m);
  startTipsAnimation(UI, screen, m);

  requestRender();
}

function clearDynamicContent(UI, state) {
  const toDestroy = [];
  UI.outputArea.children.forEach(c => {
    if (c !== UI.welcomeCard) toDestroy.push(c);
  });
  toDestroy.forEach(c => c.destroy());
  state.lineCount = 0;
}

function renderPageRecursive(UI, screen, state, session, pageId, prefix = '', isLast = true) {
  const page = session.pages[pageId];
  if (!page) return;

  const marker = pageId === state.currentPageId ? ' ●' : '';
  const branchChar = isLast ? '└─' : '├─';
  const childPrefix = prefix + (isLast ? '   ' : '│  ');

  const displayTitle = page.title || page.prompt;
  const contentTrunc = displayTitle.length > 40 ? displayTitle.substring(0, 37) + '...' : displayTitle;
  const leftSide = `${prefix}${branchChar} "${contentTrunc}"${marker}`;
  
  blessed.text({
    parent: UI.outputArea,
    top: state.lineCount++,
    left: 0,
    width: '100%',
    content: leftSide,
    fg: pageId === state.currentPageId ? C.yellow : C.dim,
    bold: pageId === state.currentPageId
  });

  if (page.tokens) {
    const termWidth = (typeof screen.width === 'number') ? screen.width : 80;
    const tokenLabel = `(${page.tokens} tks)`;
    const padding = termWidth - leftSide.length - tokenLabel.length - 6;
    
    if (padding > 2) {
      const dots = '─'.repeat(padding);
      blessed.text({ parent: UI.outputArea, top: state.lineCount - 1, left: leftSide.length + 2, content: dots, fg: '#1a1a1a' });
    }

    blessed.text({ parent: UI.outputArea, top: state.lineCount - 1, right: 2, content: tokenLabel, fg: pageId === state.currentPageId ? C.yellow : C.dark, bold: pageId === state.currentPageId });
  }

  const children = page.children || [];
  children.forEach((childId, idx) => {
    renderPageRecursive(UI, screen, state, session, childId, childPrefix, idx === children.length - 1);
  });
}

function renderIndexPage(UI, screen, state) {
  clearDynamicContent(UI, state);
  state.lineCount = 12;

  if (state.sessions.length === 0) {
    blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: '  No sessions yet — type a prompt below to start.', fg: C.dim });
  } else {
    UI.rootIconEl = blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${ROOT_ICON_FRAMES[rootIconFrameIdx]}`, fg: C.green });

    state.sessions.forEach((session, idx) => {
      const isLastSession = idx === state.sessions.length - 1;
      const isCurrent = idx === state.currentSessionIndex;
      const sessionBranch = isLastSession ? '└─' : '├─';
      const recursivePrefix = isLastSession ? '     ' : '  │  ';

      const firstPrompt = session.rootPageId && session.pages[session.rootPageId] ? (session.pages[session.rootPageId].title || session.pages[session.rootPageId].prompt) : '(empty)';
      const displayTitle = session.name || firstPrompt;
      const titleTrunc = displayTitle.length > 44 ? displayTitle.substring(0, 41) + '...' : displayTitle;
      
      const isSelected = (idx === state.selectedSessionIndex && state.currentSessionIndex === -1);
      const marker = isCurrent ? ' ●' : (isSelected ? ' ►' : '');
      const relTime = getRelativeTime(session.lastUpdated);

      blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${sessionBranch} ${idx + 1}  "${titleTrunc}"${marker}`, fg: (isCurrent || isSelected) ? C.yellow : C.cyan, bold: (isCurrent || isSelected) });
      blessed.text({ parent: UI.outputArea, top: state.lineCount - 1, right: 2, content: relTime, fg: C.dark });

      if (session.rootPageId) renderPageRecursive(UI, screen, state, session, session.rootPageId, recursivePrefix, true);
      if (!isLastSession) blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: '  │', fg: C.border });
    });
  }

  state.lineCount++;
  updatePageIndicator(UI, state);
  requestRender();
  requestScroll();
}

function getRelativeTime(timestamp) {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function startSessionHeaderAnimation(UI) {
  if (sessionHeaderInterval) return;
  sessionHeaderInterval = setInterval(() => {
    sessionHeaderFrameIdx = (sessionHeaderFrameIdx + 1) % SESSION_HEADER_FRAMES.length;
    UI.modeIndicator.setContent(`${SESSION_HEADER_FRAMES[sessionHeaderFrameIdx]} Heeba`);
    requestRender();
  }, 220);
}

function stopSessionHeaderAnimation() {
  if (sessionHeaderInterval) { clearInterval(sessionHeaderInterval); sessionHeaderInterval = null; }
}

function startRootIconAnimation(UI) {
  if (rootIconInterval) return;
  rootIconInterval = setInterval(() => {
    rootIconFrameIdx = (rootIconFrameIdx + 1) % ROOT_ICON_FRAMES.length;
    if (UI.rootIconEl) { UI.rootIconEl.setContent(`  ${ROOT_ICON_FRAMES[rootIconFrameIdx]}`); requestRender(); }
  }, 350);
}

function stopRootIconAnimation(UI) {
  if (rootIconInterval) { clearInterval(rootIconInterval); rootIconInterval = null; UI.rootIconEl = null; }
}

function renderActivePage(UI, screen, state) {
  const { getPathToPage } = require('../core/state-manager'); // Avoid circular deps
  
  if (state.currentSessionIndex === -1) {
    UI.welcomeCard.show();
    UI.cardTitle.setContent('Sessions');
    UI.modeIndicator.setContent(`${SESSION_HEADER_FRAMES[0]} Heeba`);
    UI.modeIndicator.style.fg = C.green;
    UI.statusLinesEl.setContent(`${state.sessions.length} session${state.sessions.length !== 1 ? 's' : ''} · Enter to open`);
    startSessionHeaderAnimation(UI);
    startRootIconAnimation(UI);
    renderIndexPage(UI, screen, state);
    return;
  }

  if (state.currentSessionIndex < 0 || state.currentSessionIndex >= state.sessions.length) return;
  const session = state.sessions[state.currentSessionIndex];
  if (!state.currentPageId || !session.pages[state.currentPageId]) return;

  stopSessionHeaderAnimation();
  stopRootIconAnimation(UI);
  clearDynamicContent(UI, state);
  UI.welcomeCard.hide();
  state.lineCount = 1;

  const page = session.pages[state.currentPageId];
  
  blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ※ You`, fg: C.purple, bold: true });
  blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`, fg: C.border });

  page.prompt.split('\n').forEach(pl => { blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${pl}`, fg: C.fg }); });
  state.lineCount++;

  if (page.response) {
    blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ⁜ Heeba`, fg: C.yellow, bold: true });
    blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: `  ${'─'.repeat(Math.max(20, (screen.width || 80) - 6))}`, fg: C.border });

    const mdLines = renderMarkdown(page.response, (screen.width || 80));
    mdLines.forEach(ml => { blessed.text({ parent: UI.outputArea, top: state.lineCount++, left: 0, width: '100%', content: ml.content, fg: ml.fg, bold: ml.bold, tags: true }); });
  }

  updatePageIndicator(UI, state);
  requestRender();
  requestScroll();
}

function updatePageIndicator(UI, state) {
  const { getPathToPage, getBrotherPages, calculatePathTokens } = require('../core/state-manager');

  if (state.currentSessionIndex === -1) {
    UI.pageIndicator.setContent(' Sessions ');
    return;
  }
  const session = state.sessions[state.currentSessionIndex];
  if (!state.currentPageId || !session.pages[state.currentPageId]) return;

  const path = getPathToPage(session, state.currentPageId);
  const brothers = getBrotherPages(session, state.currentPageId);
  const totalTokens = calculatePathTokens(session, state.currentPageId);
  
  let label = ` Page ${path.length} `;
  if (brothers.total > 1) label += `[Branch ${brothers.index + 1}/${brothers.total}] `;
  
  const limit = state.CONFIG.contextLength || 4096;
  const usage = Math.round((totalTokens / limit) * 100);
  label += `| Context: ${totalTokens} / ${limit} (${usage}%) `;

  UI.pageIndicator.setContent(label);
  
  if (usage > 90) UI.pageIndicator.style.fg = C.red;
  else if (usage > 70) UI.pageIndicator.style.fg = C.yellow;
  else UI.pageIndicator.style.fg = C.green;

  requestRender();
}

function showLoading(UI, overlays, screen, state, show) {
  UI.promptText.setContent(`⟫`);
  UI.promptText.style.fg = '#ffffff';
  if (show) {
    startLoadingAnimation(UI, overlays, screen, MODES.auto);
  } else {
    stopLoadingAnimation(UI, overlays, screen, MODES.auto);
  }
  UI.footerStatus.setContent(show ? '● busy' : '● ready');
  UI.footerStatus.style.fg = show ? C.yellow : C.green;
  requestRender();
}

function switchMode(UI, screen, overlays, state, newMode) {
  overlays.modeOverlayText.setContent(`Switching to ${MODES[newMode].name} mode...`);
  overlays.modeOverlayText.style.fg = MODES[newMode].color;
  overlays.modeOverlay.show();
  overlays.modeOverlay.setFront();
  forceRender();

  setTimeout(() => {
    overlays.modeOverlay.hide();
    state.currentMode = newMode;
    updateWelcomeCard(UI, screen, state);
    if (newMode === 'auto' && state.sessions.length > 0) navigateToPage(UI, screen, state, -1, -1);
    requestRender();
  }, 500);
}

function navigateToPage(UI, screen, state, sessionIdx, pageId) {
  if (sessionIdx === -1) {
    state.currentSessionIndex = -1;
    state.currentPageId = null;
    renderActivePage(UI, screen, state);
    setTimeout(() => { UI.inputBox.focus(); }, 30);
    return;
  }

  if (sessionIdx < 0 || sessionIdx >= state.sessions.length) return;
  state.currentSessionIndex = sessionIdx;
  state.currentPageId = pageId || state.sessions[sessionIdx].rootPageId;
  
  renderActivePage(UI, screen, state);
}

function openModelSelection(UI) {
  const { getAvailableModels } = require('../core/config');
  const models = getAvailableModels();
  if (models.length === 0) return;
  pauseScroll();
  UI.inputContainer.hide();
  UI.modelList.setItems(models);
  UI.modelList.setLabel(` [ SELECT MODEL: ${models.length} FOUND ] `);
  UI.modelList.show();
  UI.modelList.focus();
  forceRender();
}

function closeModelSelection(UI) {
  UI.modelList.hide();
  UI.inputContainer.show();
  UI.inputBox.focus();
  resumeScroll();
  forceRender();
}

function openPageList(UI, state) {
  const { getPathToPage } = require('../core/state-manager');
  pauseScroll();

  if (state.currentSessionIndex === -1) {
    const items = state.sessions.map((s, i) => {
      const rootPage = s.pages[s.rootPageId];
      const prompt = rootPage ? rootPage.prompt : '(empty)';
      return `  ${i + 1}. ${s.name || (prompt.length > 50 ? prompt.substring(0, 47) + '...' : prompt)}${i === state.currentSessionIndex ? ' ●' : ''}`;
    });
    UI.pageListView.setItems(items);
    UI.pageListView.setLabel(` {bold}◆ SESSIONS (${state.sessions.length}) ◆{/bold} `);
    UI.pageListView.select(0);
  } else {
    const session = state.sessions[state.currentSessionIndex];
    const path = getPathToPage(session, state.currentPageId);
    const items = path.map((p, i) => `  ${i + 1}. ${p.prompt.length > 50 ? p.prompt.substring(0, 47) + '...' : p.prompt}${p.id === state.currentPageId ? ' ●' : ''}`);
    UI.pageListView.setItems(items);
    UI.pageListView.setLabel(` {bold}◆ BRANCH PATH (${path.length} steps) ◆{/bold} `);
    const stepIdx = path.findIndex(p => p.id === state.currentPageId);
    UI.pageListView.select(stepIdx >= 0 ? stepIdx : 0);
  }

  UI.inputContainer.hide(); UI.pageListView.show(); UI.pageListView.focus(); forceRender();
}

function closePageList(UI) {
  UI.pageListView.hide(); UI.inputContainer.show(); UI.inputBox.focus(); resumeScroll(); forceRender();
}

function startNewSession(UI, screen, state) {
  if (UI.modelList.visible || UI.pageListView.visible) return;
  state.currentSessionIndex = -1; state.currentPageId = null; state.userScrolledUp = false;
  renderActivePage(UI, screen, state);
  setTimeout(() => { UI.inputBox.focus(); }, 30);
}

module.exports = {
  updateWelcomeCard, clearDynamicContent, renderIndexPage, renderActivePage, updatePageIndicator,
  showLoading, switchMode, navigateToPage, openModelSelection, closeModelSelection,
  openPageList, closePageList, startNewSession, startRootIconAnimation, stopRootIconAnimation,
  startSessionHeaderAnimation, stopSessionHeaderAnimation
};
