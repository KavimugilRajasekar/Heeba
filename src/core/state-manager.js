// src/core/state-manager.js
const { DEFAULT_CONFIG } = require('./config');
const { SESSION_FILE } = require('../utils/paths');
const fs = require('fs');
const path = require('path');

const state = {
  currentMode: 'auto',
  commandHistory: [],
  historyIndex: -1,
  lineCount: 12,
  lastOutputWasCommand: false,
  startTime: Date.now(),
  CONFIG: { ...DEFAULT_CONFIG },
  isProcessingCommand: false,
  sessions: [],
  currentSessionIndex: -1,
  selectedSessionIndex: 0,
  currentPageId: null,
  userScrolledUp: false,
  browserEnabled: false,
  browserType: 'chromium',
  browserVisible: false,
};

const getPathToPage = (session, pageId) => {
  if (!session || !pageId || !session.pages[pageId]) return [];
  const path = [];
  let curr = session.pages[pageId];
  while (curr) {
    path.unshift(curr);
    curr = curr.parentId ? session.pages[curr.parentId] : null;
  }
  return path;
};

const getBrotherPages = (session, pageId) => {
  if (!session || !pageId || !session.pages[pageId]) return { index: 0, total: 1, list: [] };
  const parentId = session.pages[pageId].parentId;
  if (!parentId) {
    // Root page has no siblings — return itself as the sole sibling
    return { index: 0, total: 1, list: [pageId] };
  }
  const brothers = session.pages[parentId].children;
  return {
    index: brothers.indexOf(pageId),
    total: brothers.length,
    list: brothers
  };
};

const estimateTokens = (text) => {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
};

const calculatePathTokens = (session, pageId) => {
  const path = getPathToPage(session, pageId);
  return path.reduce((sum, p) => sum + (p.tokens || 0), 0);
};

const findLeafId = (session, pageId) => {
  let currId = pageId;
  while (session.pages[currId] && session.pages[currId].children.length > 0) {
    currId = session.pages[currId].children[0];
  }
  return currId;
};

// Delete a page (and optionally its branch)
const deletePage = (session, pageId, scope = 'current') => {
  if (!session || !pageId || !session.pages[pageId]) return false;

  const page = session.pages[pageId];

  if (scope === 'branch') {
    // Recursively collect all descendant IDs
    const toDelete = [];
    const collectDescendants = (id) => {
      toDelete.push(id);
      const children = session.pages[id]?.children || [];
      children.forEach(collectDescendants);
    };
    collectDescendants(pageId);

    // Remove from parent's children
    if (page.parentId && session.pages[page.parentId]) {
      session.pages[page.parentId].children =
        session.pages[page.parentId].children.filter(cid => cid !== pageId);
    }

    // Delete all pages in branch
    toDelete.forEach(id => delete session.pages[id]);
  } else {
    // Delete only current page, promote children to parent
    const parentId = page.parentId;

    if (parentId && session.pages[parentId]) {
      // Remove this page from parent's children
      session.pages[parentId].children =
        session.pages[parentId].children.filter(cid => cid !== pageId);

      // Add current page's children to parent
      page.children.forEach(childId => {
        if (session.pages[childId]) {
          session.pages[childId].parentId = parentId;
          session.pages[parentId].children.push(childId);
        }
      });
    }

    delete session.pages[pageId];
  }

  return true;
};

// Get the parent page ID after deletion (for navigation)
const getParentAfterDelete = (session, pageId) => {
  if (!session || !pageId) return null;
  const page = session.pages[pageId];
  return page?.parentId || null;
};

/**
 * Load sessions from disk (session.json next to heeba.exe)
 * Restores sessions across app restarts.
 */
function loadSessions() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = fs.readFileSync(SESSION_FILE, 'utf8');
      const parsed = JSON.parse(data);
      // Validate basic structure
      if (Array.isArray(parsed.sessions)) {
        state.sessions = parsed.sessions;
        state.currentSessionIndex = parsed.currentSessionIndex ?? -1;
        state.selectedSessionIndex = parsed.selectedSessionIndex ?? 0;
        state.currentPageId = parsed.currentPageId ?? null;
      }
    }
  } catch (e) {
    // Silently ignore corrupt session files
  }
}

/**
 * Save sessions to disk (session.json next to heeba.exe)
 * Called on every meaningful state change and at exit.
 */
function saveSessions() {
  try {
    const dir = path.dirname(SESSION_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      sessions: state.sessions,
      currentSessionIndex: state.currentSessionIndex,
      selectedSessionIndex: state.selectedSessionIndex,
      currentPageId: state.currentPageId,
      savedAt: new Date().toISOString()
    };
    fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    // Silently ignore write failures
  }
}

module.exports = {
  state,
  getPathToPage,
  getBrotherPages,
  estimateTokens,
  calculatePathTokens,
  findLeafId,
  deletePage,
  getParentAfterDelete,
  loadSessions,
  saveSessions
};
