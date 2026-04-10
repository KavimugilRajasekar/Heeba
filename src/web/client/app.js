// src/web/client/app.js
// Heeba Web Interface — Monochrome Edition

(function () {
  'use strict';

  // ── Tab ID ──
  let tabId = sessionStorage.getItem('heeba_tab_id');
  if (!tabId) {
    tabId = Math.random().toString(36).substring(2, 11);
    sessionStorage.setItem('heeba_tab_id', tabId);
  }

  // ── State ──
  let ws = null;
  let connected = false;
  let models = [];
  let currentModel = '';
  let bridgeData = null;
  let pendingPageId = null;
  let isStreaming = false;
  let commandPaletteOpen = false;
  let sidebarCollapsed = false;

  // ── DOM ──
  const $ = id => document.getElementById(id);
  const conversation = $('conversation');
  const promptInput = $('prompt-input');
  const btnSend = $('btn-send');
  const btnCancel = $('btn-cancel');
  const modelSelect = $('model-select');
  const sessionTree = $('session-tree');
  const btnNewSession = $('btn-new-session');
  const btnToggleSidebar = $('toggle-sidebar');
  const statRam = $('stat-ram');
  const statUptime = $('stat-uptime');
  const statTokens = $('stat-tokens');
  const statCpu = $('stat-cpu');

  // ── Icons (monochrome SVGs) ──
  const I = {
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    chevL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>`,
    chevR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    cmd: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>`,
    layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
    x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  };

  // ── Toast ──
  const toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  document.body.appendChild(toastContainer);

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${I[type] || I.info}<span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(10px)';
      toast.style.transition = 'all 0.2s';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  // ── WebSocket ──
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/ws`);

    ws.onopen = () => {
      connected = true;
      showConnectionStatus('connected');
      ws.send(JSON.stringify({ type: 'init', tabId }));
      startStatsLoop();
    };

    ws.onclose = () => {
      connected = false;
      showConnectionStatus('disconnected');
      setTimeout(connect, 2500);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = event => {
      handleMessage(JSON.parse(event.data));
    };
  }

  function showConnectionStatus(status) {
    let el = $('connection-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'connection-status';
      document.body.appendChild(el);
    }
    const dotClass = status === 'connected' ? 'green' : status === 'disconnected' ? 'red' : 'yellow';
    const dotText = status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Reconnecting...' : 'Connecting...';
    el.innerHTML = `<span class="status-dot ${dotClass}"></span> ${dotText}`;
    el.style.opacity = '1';
    if (status === 'connected') {
      setTimeout(() => { if (el) { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); } }, 2000);
    }
  }

  // ── Message Handler ──
  function handleMessage(msg) {
    switch (msg.type) {
      case 'init_ack':
        bridgeData = msg.data.bridgeData;
        currentModel = msg.data.config.model;
        renderSessionTree();
        renderWelcome();
        loadModels();
        break;

      case 'token':
        appendToken(msg.data.pageId, msg.data.token);
        break;

      case 'page_started':
        pendingPageId = msg.data.pageId;
        startAssistantBubble(pendingPageId, msg.data.prompt);
        isStreaming = true;
        btnSend.disabled = true;
        btnCancel.classList.remove('hidden');
        btnCancel.style.display = 'flex';
        break;

      case 'page_done':
        finishAssistantBubble(msg.data.pageId, msg.data.response, msg.data.tokens);
        isStreaming = false;
        btnSend.disabled = false;
        btnCancel.classList.add('hidden');
        btnCancel.style.display = 'none';
        pendingPageId = null;
        ws.send(JSON.stringify({ type: 'get_state' }));
        break;

      case 'error':
        finishAssistantBubble(msg.data.pageId, `Error: ${msg.data.message}`, 0);
        isStreaming = false;
        btnSend.disabled = false;
        btnCancel.classList.add('hidden');
        btnCancel.style.display = 'none';
        showToast(`Error: ${msg.data.message}`, 'error');
        break;

      case 'state_data':
      case 'navigate_ack':
      case 'switch_session_ack':
      case 'switch_page_ack':
        bridgeData = msg.data;
        renderSessionTree();
        renderConversation();
        break;

      case 'session_renamed':
      case 'session_deleted':
      case 'page_deleted':
        ws.send(JSON.stringify({ type: 'get_state' }));
        break;

      case 'model_set':
        currentModel = msg.data.model;
        showToast(`Model: ${msg.data.model}`, 'info');
        break;

      case 'models_data':
        models = msg.data;
        renderModelSelect();
        break;

      case 'stats_data':
        updateStats(msg.data);
        break;
    }
  }

  // ── Stats ──
  function updateStats(data) {
    if (data.ramMB !== undefined) {
      statRam.innerHTML = `<span class="label">RAM</span><span class="value">${data.ramMB}MB</span>`;
    }
    if (data.uptime !== undefined) {
      const h = Math.floor(data.uptime / 3600);
      const m = Math.floor((data.uptime % 3600) / 60);
      const s = data.uptime % 60;
      statUptime.innerHTML = `<span class="label">Up</span><span class="value">${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}</span>`;
    }
    if (data.tokens !== undefined) {
      statTokens.innerHTML = `<span class="label">Tokens</span><span class="value">${data.tokens}</span>`;
    }
    if (data.cpu !== undefined) {
      statCpu.innerHTML = `<span class="label">CPU</span><span class="value">${data.cpu}%</span>`;
    }
  }

  // ── Welcome ──
  function renderWelcome() {
    const welcome = document.createElement('div');
    welcome.id = 'welcome-msg';
    welcome.innerHTML = `
      <div class="welcome-logo">HEEBA</div>
      <div class="welcome-subtitle">Autonomous Agentic Intelligence Engine</div>
      <div class="welcome-features">
        <div class="feature-chip">${I.cmd}<span>Streaming Responses</span></div>
        <div class="feature-chip">${I.layers}<span>Branch Navigation</span></div>
        <div class="feature-chip">${I.layers}<span>Email Automation</span></div>
        <div class="feature-chip">${I.cmd}<span>Command Execution</span></div>
        <div class="feature-chip">${I.layers}<span>Multi-Model Support</span></div>
        <div class="feature-chip">${I.cmd}<span>Code Analysis</span></div>
      </div>
      <div class="welcome-hint">Type a prompt below to get started</div>
    `;
    conversation.appendChild(welcome);
    conversation.scrollTop = conversation.scrollHeight;
  }

  // ── Model Select ──
  function renderModelSelect() {
    modelSelect.innerHTML = '';
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      if (m === currentModel || m.startsWith(currentModel)) opt.selected = true;
      modelSelect.appendChild(opt);
    });
  }

  // ── Session Tree ──
  function renderSessionTree() {
    sessionTree.innerHTML = '';

    if (!bridgeData || !bridgeData.sessions || bridgeData.sessions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = `<p>No sessions yet</p><span>Start a conversation below</span>`;
      sessionTree.appendChild(empty);
      return;
    }

    bridgeData.sessions.forEach((session, idx) => {
      const isActive = bridgeData.sessionIndex === session.index;
      const el = document.createElement('div');
      el.className = 'session-item';
      el.style.animationDelay = `${idx * 0.04}s`;

      const card = document.createElement('div');
      card.className = `session-card${isActive ? ' active' : ''}`;

      const icons2 = ['◇', '◆', '○', '●', '★', '◉'];
      const icon = icons2[idx % icons2.length];

      card.innerHTML = `
        <div class="session-header">
          <span class="session-icon">${icon}</span>
          <span class="session-name">${session.name || 'Untitled'}</span>
        </div>
        <div class="session-meta">
          <span>${Object.keys(session.pages || {}).length} pages</span>
          <span>${relativeTime(session.lastUpdated || Date.now())}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'switch_session', sessionIndex: session.index }));
      });

      card.addEventListener('contextmenu', e => {
        e.preventDefault();
        showSessionMenu(e, session);
      });

      el.appendChild(card);

      if (isActive && bridgeData.tree) {
        const treeEl = document.createElement('div');
        treeEl.className = 'page-tree';
        renderPageNodes(treeEl, bridgeData.tree);
        el.appendChild(treeEl);
      }

      sessionTree.appendChild(el);
    });
  }

  function relativeTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  }

  function renderPageNodes(container, node, depth = 0) {
    const isCurrent = bridgeData && bridgeData.pageId === node.id;
    const nodeEl = document.createElement('div');
    nodeEl.className = `page-node${isCurrent ? ' current' : ''}`;
    nodeEl.style.paddingLeft = `${depth * 10 + 8}px`;

    const glyph = node.children && node.children.length > 0 ? '◉' : '●';
    nodeEl.innerHTML = `
      <span class="branch-glyph">${glyph}</span>
      <span class="page-title">${node.title || '...'}</span>
    `;

    nodeEl.addEventListener('click', () => {
      ws.send(JSON.stringify({ type: 'switch_page', pageId: node.id }));
    });

    container.appendChild(nodeEl);
    if (node.children) node.children.forEach(child => renderPageNodes(container, child, depth + 1));
  }

  // ── Context Menu ──
  function showSessionMenu(e, session) {
    closeContextMenu();
    const menu = document.createElement('div');
    menu.id = 'ctx-menu';
    menu.style.cssText = `top:${e.clientY}px;left:${e.clientX}px`;

    [
      { label: 'Rename', icon: I.edit, action: () => {
        const name = prompt('Session name:', session.name);
        if (name !== null) ws.send(JSON.stringify({ type: 'rename_session', sessionId: session.id, name }));
      }},
      { label: 'Delete', icon: I.trash, danger: true, action: () => {
        if (confirm(`Delete "${session.name || 'Untitled'}"?`)) {
          ws.send(JSON.stringify({ type: 'delete_session', sessionId: session.id }));
        }
      }},
    ].forEach(item => {
      const el = document.createElement('div');
      el.className = `ctx-item${item.danger ? ' danger' : ''}`;
      el.innerHTML = `${item.icon}<span>${item.label}</span>`;
      el.addEventListener('click', () => { item.action(); closeContextMenu(); });
      menu.appendChild(el);
    });

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }), 0);
  }

  function closeContextMenu() {
    const m = document.getElementById('ctx-menu');
    if (m) m.remove();
    document.removeEventListener('click', closeContextMenu);
  }

  // ── Conversation ──
  function renderConversation() {
    if (!bridgeData || bridgeData.sessionIndex < 0) {
      conversation.innerHTML = '';
      renderWelcome();
      return;
    }

    const w = $('welcome-msg');
    if (w) w.remove();

    const session = bridgeData.sessions[bridgeData.sessionIndex];
    if (!session) return;

    conversation.innerHTML = '';

    function collectPages(pageId, pages, list = []) {
      if (!pageId || !pages[pageId]) return list;
      list.push(pages[pageId]);
      (pages[pageId].children || []).forEach(cid => collectPages(cid, pages, list));
      return list;
    }

    collectPages(session.rootPageId, session.pages).forEach(page => {
      appendUserBubble(page.prompt);
      if (page.response) appendAssistantBubble(page.id, page.response, !page._streaming);
    });

    conversation.scrollTop = conversation.scrollHeight;
  }

  function appendUserBubble(text) {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `
      <div class="role-badge">${I.user}<span>You</span></div>
      <div class="bubble">${escapeHtml(text)}</div>
    `;
    conversation.appendChild(msg);
    scrollToBottom();
  }

  function startAssistantBubble(pageId, prompt) {
    const w = $('welcome-msg');
    if (w) w.remove();
    appendUserBubble(prompt);

    const msg = document.createElement('div');
    msg.className = 'message assistant streaming';
    msg.dataset.pageId = pageId;
    msg.innerHTML = `
      <div class="role-badge">${I.cmd}<span>Heeba</span></div>
      <div class="bubble" id="bubble-${pageId}">
        <div class="typing-indicator"><span></span><span></span><span></span></div>
      </div>
    `;
    conversation.appendChild(msg);
    scrollToBottom();
  }

  function appendToken(pageId, token) {
    const bubble = document.getElementById(`bubble-${pageId}`);
    if (!bubble) return;

    const typing = bubble.querySelector('.typing-indicator');
    if (typing) typing.remove();

    const text = (bubble.dataset.text || '') + token;
    bubble.dataset.text = text;
    bubble.innerHTML = renderMarkdown(text);
    scrollToBottom();
  }

  function finishAssistantBubble(pageId, response) {
    const msgEl = conversation.querySelector(`.message.streaming[data-page-id="${pageId}"]`);
    if (msgEl) {
      msgEl.classList.remove('streaming');
      const bubble = msgEl.querySelector('.bubble');
      if (bubble) {
        bubble.dataset.text = response;
        bubble.innerHTML = renderMarkdown(response);
      }
    }
    scrollToBottom();
  }

  function scrollToBottom() {
    conversation.scrollTop = conversation.scrollHeight;
  }

  // ── Markdown ──
  function parseTableToHtml(text) {
    // Convert ```table blocks to HTML tables
    if (!text || !text.includes('```table')) return null;

    const match = text.match(/^(.*?)\n\n```table\n([\s\S]*?)```/);
    if (!match) return null;

    const title = match[1].trim();
    const tableContent = match[2];
    const lines = tableContent.split('\n').filter(l => l.trim() && l.startsWith('│'));

    if (lines.length === 0) return null;

    // Parse header row
    const headerCells = lines[0].split('│').map(c => c.trim()).filter(c => c && c !== '#');
    if (headerCells.length === 0) return null;

    // Parse data rows (skip separator lines)
    const dataRows = [];
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].includes('─') || lines[i].includes('┼')) continue;
      const cells = lines[i].split('│').map(c => c.trim()).filter(c => c);
      if (cells.length >= 1 && !isNaN(parseInt(cells[0]))) {
        dataRows.push(cells.slice(1));
      }
    }

    let html = `<div class="table-wrapper"><div class="table-title">${escapeHtml(title)}</div>`;
    html += '<table class="data-table"><thead><tr>';
    headerCells.forEach(h => { html += `<th>${escapeHtml(h)}</th>`; });
    html += '</tr></thead><tbody>';

    dataRows.forEach(row => {
      html += '<tr>';
      for (let i = 0; i < headerCells.length; i++) {
        html += `<td>${escapeHtml(row[i] || '')}</td>`;
      }
      html += '</tr>';
    });

    if (dataRows.length === 0) {
      html += `<tr><td colspan="${headerCells.length}" class="empty-cell">No data found</td></tr>`;
    }

    html += '</tbody></table></div>';
    return html;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    let h = text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Handle table blocks specially
    const tableMatch = h.match(/^(.*?)\n\n```table\n([\s\S]*?)```/);
    if (tableMatch) {
      const before = h.slice(0, tableMatch.index);
      const after = h.slice(tableMatch.index + tableMatch[0].length);
      const tableHtml = parseTableToHtml(tableMatch[0]);
      return renderMarkdown(before) + (tableHtml || '') + renderMarkdown(after);
    }

    h = h.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, l, c) => `<pre><code>${c.trim()}</code></pre>`);
    h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
    h = h.replace(/_(.+?)_/g, '<em>$1</em>');
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    h = h.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    h = h.replace(/^[-*+] (.+)$/gm, '<li>$1</li>');
    h = h.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    h = h.replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
    h = h.replace(/^[-*_]{3,}$/gm, '<hr>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    h = h.replace(/\u2713 (.+)/g, '<span class="success-inline">&#10003; $1</span>');
    h = h.replace(/\u2717 (.+)/g, '<span class="error-inline">&#10007; $1</span>');
    h = h.replace(/\n\n+/g, '</p><p>');
    h = h.replace(/\n/g, '<br>');

    return `<p>${h}</p>`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Command Palette ──
  function openCommandPalette() {
    if (commandPaletteOpen) return;
    commandPaletteOpen = true;

    const overlay = document.createElement('div');
    overlay.id = 'command-palette';
    overlay.innerHTML = `
      <div class="palette-input-wrapper">
        <input class="palette-input" type="text" placeholder="Type a command..." autofocus>
        <div class="palette-results">
          ${[
            { icon: I.plus, title: 'New Session', desc: 'Start a fresh conversation', key: 'Ctrl+N', action: () => sendCmd({ type: 'switch_session', sessionIndex: -1 }) },
            { icon: I.chevL, title: 'Go to Parent', desc: 'Navigate up the branch tree', key: '\u2191', action: () => sendCmd({ type: 'navigate', direction: 'up' }) },
            { icon: I.layers, title: 'Go to Root', desc: 'Jump to session index', key: 'Esc', action: () => sendCmd({ type: 'switch_session', sessionIndex: -1 }) },
            { icon: I.chevL, title: 'Previous Branch', desc: 'Switch to previous sibling', key: 'Shift+\u2190', action: () => sendCmd({ type: 'navigate', direction: 'left' }) },
            { icon: I.chevR, title: 'Next Branch', desc: 'Switch to next sibling', key: 'Shift+\u2192', action: () => sendCmd({ type: 'navigate', direction: 'right' }) },
            { icon: I.x, title: 'Cancel Generation', desc: 'Stop the current response', key: 'Ctrl+C', action: () => sendCmd({ type: 'cancel' }) },
          ].map((cmd, i) => `
            <div class="palette-item${i === 0 ? ' selected' : ''}" data-idx="${i}">
              <div class="item-icon">${cmd.icon}</div>
              <div class="item-text">
                <div class="item-title">${cmd.title}</div>
                <div class="item-desc">${cmd.desc}</div>
              </div>
              <div class="item-shortcut"><kbd>${cmd.key}</kbd></div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    const input = overlay.querySelector('.palette-input');
    const results = overlay.querySelector('.palette-results');
    let selectedIdx = 0;
    const commands = [...results.querySelectorAll('.palette-item')].map((el, i) => ({
      el,
      action: [
        () => sendCmd({ type: 'switch_session', sessionIndex: -1 }),
        () => sendCmd({ type: 'navigate', direction: 'up' }),
        () => sendCmd({ type: 'switch_session', sessionIndex: -1 }),
        () => sendCmd({ type: 'navigate', direction: 'left' }),
        () => sendCmd({ type: 'navigate', direction: 'right' }),
        () => sendCmd({ type: 'cancel' }),
      ][i]
    }));

    input.addEventListener('keydown', e => {
      const items = [...results.querySelectorAll('.palette-item:not([style*="display: none"])')];
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(items, (selectedIdx + 1) % items.length); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(items, (selectedIdx - 1 + items.length) % items.length); }
      if (e.key === 'Enter') { e.preventDefault(); items[selectedIdx]?.click(); }
      if (e.key === 'Escape') closeCommandPalette();
    });

    results.addEventListener('click', e => {
      const item = e.target.closest('.palette-item');
      if (item) commands[item.dataset.idx].action();
    });

    overlay.addEventListener('click', e => { if (e.target === overlay) closeCommandPalette(); });

    function setSelected(items, idx) {
      selectedIdx = idx;
      items.forEach((item, i) => item.classList.toggle('selected', i === idx));
      items[idx]?.scrollIntoView({ block: 'nearest' });
    }

    setTimeout(() => input.focus(), 30);
  }

  function closeCommandPalette() {
    const p = document.getElementById('command-palette');
    if (p) { commandPaletteOpen = false; p.remove(); }
  }

  function sendCmd(obj) {
    if (ws && connected) ws.send(JSON.stringify(obj));
  }

  // ── Sidebar Toggle ──
  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    $('sidebar').classList.toggle('collapsed', sidebarCollapsed);
    const btn = $('toggle-sidebar');
    if (btn) btn.innerHTML = sidebarCollapsed ? I.chevR : I.chevL;
  }

  // ── Input ──
  promptInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); sendPrompt(); }
  });

  promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = Math.min(promptInput.scrollHeight, 120) + 'px';
  });

  btnSend.addEventListener('click', sendPrompt);
  btnCancel.addEventListener('click', () => {
    sendCmd({ type: 'cancel' });
    isStreaming = false;
    btnSend.disabled = false;
    btnCancel.classList.add('hidden');
    btnCancel.style.display = 'none';
  });

  btnNewSession.addEventListener('click', () => {
    sendCmd({ type: 'switch_session', sessionIndex: -1 });
    promptInput.focus();
  });

  btnToggleSidebar.addEventListener('click', toggleSidebar);

  modelSelect.addEventListener('change', () => {
    sendCmd({ type: 'set_model', model: modelSelect.value });
  });

  // ── Keyboard Shortcuts ──
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      commandPaletteOpen ? closeCommandPalette() : openCommandPalette();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      sendCmd({ type: 'switch_session', sessionIndex: -1 });
      promptInput.focus();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && document.activeElement !== promptInput) {
      if (isStreaming) sendCmd({ type: 'cancel' });
      return;
    }

    if (e.key === 'Escape') {
      if (commandPaletteOpen) { closeCommandPalette(); return; }
      sendCmd({ type: 'switch_session', sessionIndex: -1 });
      return;
    }

    if (document.activeElement !== promptInput && !commandPaletteOpen) {
      const dirs = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (dirs[e.key]) { e.preventDefault(); sendCmd({ type: 'navigate', direction: dirs[e.key] }); }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft') { e.preventDefault(); sendCmd({ type: 'navigate', direction: 'up' }); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight') { e.preventDefault(); sendCmd({ type: 'navigate', direction: 'down' }); }
    if (e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); sendCmd({ type: 'navigate', direction: 'left' }); }
    if (e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); sendCmd({ type: 'navigate', direction: 'right' }); }
  });

  // ── Stats Loop ──
  let statsInterval = null;
  function startStatsLoop() {
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(() => {
      if (connected) sendCmd({ type: 'get_stats' });
    }, 2500);
  }

  function loadModels() {
    if (connected) sendCmd({ type: 'get_models' });
  }

  function sendPrompt() {
    const text = promptInput.value.trim();
    if (!text || isStreaming || !connected) return;
    promptInput.value = '';
    promptInput.style.height = 'auto';
    sendCmd({ type: 'prompt', prompt: text });
  }

  // ── Init ──
  connect();
})();
