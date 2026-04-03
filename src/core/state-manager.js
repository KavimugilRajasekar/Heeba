// src/core/state-manager.js
const { DEFAULT_CONFIG } = require('./config');

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
  const brothers = parentId ? session.pages[parentId].children : [session.rootPageId];
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

module.exports = {
  state,
  getPathToPage,
  getBrotherPages,
  estimateTokens,
  calculatePathTokens,
  findLeafId
};
