// src/web/session-bridge.js
// Maps each browser tab (by tabId) to a Heeba session branch.
// Each tab gets its own session context while sharing the global state.

const { state, getPathToPage, getBrotherPages } = require('../core/state-manager');

const tabSessions = new Map(); // tabId -> { sessionIndex, pageId }

function createBridge(tabId) {
  if (!tabSessions.has(tabId)) {
    // New tab: start at session index 0 or the currently active session
    tabSessions.set(tabId, {
      sessionIndex: state.sessions.length > 0 ? 0 : -1,
      pageId: null
    });
  }
  return getBridge(tabId);
}

function getBridge(tabId) {
  return tabSessions.get(tabId) || null;
}

function removeBridge(tabId) {
  tabSessions.delete(tabId);
}

// Navigate within the session tree for a given tab
function navigateBranch(tabId, direction) {
  const bridge = getBridge(tabId);
  if (!bridge) return null;

  const { sessionIndex, pageId } = bridge;

  if (sessionIndex < 0 || sessionIndex >= state.sessions.length) {
    // No session yet — try to navigate to first session
    if (state.sessions.length > 0) {
      bridge.sessionIndex = 0;
      bridge.pageId = null;
      return getBridgeData(tabId);
    }
    return null;
  }

  const session = state.sessions[sessionIndex];

  if (direction === 'up') {
    // Go to parent page
    if (pageId && session.pages[pageId]) {
      const parentId = session.pages[pageId].parentId;
      bridge.pageId = parentId || null;
    } else {
      // Already at root, go to session list
      bridge.sessionIndex = -1;
      bridge.pageId = null;
    }
  } else if (direction === 'down') {
    // Go to first child
    if (pageId && session.pages[pageId]) {
      const children = session.pages[pageId].children;
      if (children.length > 0) {
        bridge.pageId = children[0];
      }
    } else if (session.rootPageId) {
      // No current page — go to root of current session
      bridge.pageId = session.rootPageId;
    }
  } else if (direction === 'left') {
    // Previous sibling
    if (pageId) {
      const { index, total, list } = getBrotherPages(session, pageId);
      if (total > 1) {
        const prevIndex = (index - 1 + total) % total;
        bridge.pageId = list[prevIndex];
      }
    }
  } else if (direction === 'right') {
    // Next sibling
    if (pageId) {
      const { index, total, list } = getBrotherPages(session, pageId);
      if (total > 1) {
        const nextIndex = (index + 1) % total;
        bridge.pageId = list[nextIndex];
      }
    }
  }

  return getBridgeData(tabId);
}

// Switch to a different session for a tab
function switchToSession(tabId, sessionIndex) {
  const bridge = getBridge(tabId);
  if (!bridge) return null;

  if (sessionIndex < 0 || sessionIndex >= state.sessions.length) {
    bridge.sessionIndex = -1;
    bridge.pageId = null;
  } else {
    bridge.sessionIndex = sessionIndex;
    const session = state.sessions[sessionIndex];
    bridge.pageId = session ? session.rootPageId : null;
  }

  return getBridgeData(tabId);
}

// Switch to a specific page for a tab
function switchToPage(tabId, pageId) {
  const bridge = getBridge(tabId);
  if (!bridge) return null;

  if (bridge.sessionIndex >= 0 && bridge.sessionIndex < state.sessions.length) {
    const session = state.sessions[bridge.sessionIndex];
    if (pageId && session.pages[pageId]) {
      bridge.pageId = pageId;
    }
  }

  return getBridgeData(tabId);
}

function getBridgeData(tabId) {
  const bridge = getBridge(tabId);
  if (!bridge) return null;

  const { sessionIndex, pageId } = bridge;

  if (sessionIndex < 0) {
    // Browsing sessions list
    return {
      sessionIndex,
      pageId: null,
      sessions: state.sessions.map((s, i) => ({
        index: i,
        name: s.name || 'Untitled Session',
        id: s.id,
        pageCount: Object.keys(s.pages).length
      }))
    };
  }

  const session = state.sessions[sessionIndex];
  if (!session) return null;

  // Build the page tree for the current session
  function buildTree(pageId, depth = 0) {
    if (!pageId || !session.pages[pageId]) return null;
    const page = session.pages[pageId];
    return {
      id: page.id,
      title: page.title || page.prompt.substring(0, 40),
      prompt: page.prompt,
      depth,
      hasChildren: page.children.length > 0,
      children: page.children.map(cid => buildTree(cid, depth + 1)).filter(Boolean)
    };
  }

  return {
    sessionIndex,
    pageId,
    sessionName: session.name || 'Untitled Session',
    sessionId: session.id,
    rootPageId: session.rootPageId,
    tree: session.rootPageId ? buildTree(session.rootPageId) : null,
    currentPath: pageId ? getPathToPage(session, pageId).map(p => p.id) : []
  };
}

module.exports = {
  createBridge,
  getBridge,
  removeBridge,
  navigateBranch,
  switchToSession,
  switchToPage,
  getBridgeData
};
