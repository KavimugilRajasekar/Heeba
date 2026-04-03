// src/core/intent-executor.js
const fs = require('fs');
const path = require('path');
const { getHeebaConfig, reloadConfig } = require('./config-loader');
const { testOllamaConnection, queryOllama } = require('./ollama-adapter');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const { convert } = require('html-to-text');

let lastMailList = []; // Array of UIDs from last fetch_emails

const CACHE_DIR = path.join(process.cwd(), '.cache', 'email');
const EXPORT_DIR = path.join(process.cwd(), 'exports');

// Ensure directories exist
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const getEmailCredentials = () => {
  try {
    const credPath = path.join(process.cwd(), 'credentials.json');
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      return creds.email;
    }
  } catch (err) { }
  return null;
};

const truncate = (str, len) => {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 2) + '..' : str;
};

const pad = (str, len) => {
  const s = String(str);
  return s + ' '.repeat(Math.max(0, len - s.length));
};

const getCachePath = (dateStr) => path.join(CACHE_DIR, `${dateStr}.json`);

const saveToCache = (dateStr, emails) => {
  try {
    fs.writeFileSync(getCachePath(dateStr), JSON.stringify(emails, null, 2));
  } catch (e) { console.error('Cache save failed', e); }
};

const getFromCache = (dateStr) => {
  const p = getCachePath(dateStr);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { return null; }
  }
  return null;
};

const formatTimeline = (emails, title) => {
  if (!emails || emails.length === 0) return `No emails found for: ${title}`;
  
  let output = `[Timeline: ${title}]\n\n`;
  emails.forEach((msg, idx) => {
    const time = msg.date ? new Date(msg.date).toTimeString().substring(0, 5) : '--:--';
    const from = truncate(msg.from, 20);
    const sub = truncate(msg.subject, 40);
    output += `  ${time}  ${pad(from, 20)}  ${sub} (#${idx + 1})\n`;
  });
  return output;
};

const emailToTable = (emails, title, context) => {
  const termWidth = context.screen?.width || 80;
  const availableWidth = Math.max(50, termWidth - 10);
  
  const wIdx = 4 + 1;
  const wDate = 10 + 1;
  const wFrom = Math.floor((availableWidth - wIdx - wDate) * 0.3) + 1;
  const wSub = (availableWidth - wIdx - wDate - wFrom - 6) + 1;

  let table = `${title}\n\n\`\`\`table\n`;
  table += `┌${'─'.repeat(wIdx)}┬${'─'.repeat(wDate)}┬${'─'.repeat(wFrom)}┬${'─'.repeat(wSub)}┐\n`;
  table += `│ ${pad('#', wIdx - 1)}│ ${pad('Date', wDate - 1)}│ ${pad('From', wFrom - 1)}│ ${pad('Subject', wSub - 1)}│\n`;
  table += `├${'─'.repeat(wIdx)}┼${'─'.repeat(wDate)}┼${'─'.repeat(wFrom)}┼${'─'.repeat(wSub)}┤\n`;

  emails.forEach((msg, idx) => {
    const date = msg.date ? new Date(msg.date).toISOString().split('T')[0] : '????-??-??';
    const from = msg.from || '(Unknown)';
    const subject = msg.subject || '(No Subject)';
    table += `│ ${pad(idx + 1, wIdx - 1)}│ ${pad(date, wDate - 1)}│ ${pad(truncate(from, wFrom - 1), wFrom - 1)}│ ${pad(truncate(subject, wSub - 1), wSub - 1)}│\n`;
    
    // Add separator between rows (but not after the last one)
    if (idx < emails.length - 1) {
      table += `├${'─'.repeat(wIdx)}┼${'─'.repeat(wDate)}┼${'─'.repeat(wFrom)}┼${'─'.repeat(wSub)}┤\n`;
    }
  });
  table += `└${'─'.repeat(wIdx)}┴${'─'.repeat(wDate)}┴${'─'.repeat(wFrom)}┴${'─'.repeat(wSub)}┘\n\`\`\``;
  return table;
};

// Map time ranges to start/end hours
const TIME_MAPPING = {
  morning: { start: 5, end: 12 },
  afternoon: { start: 12, end: 17 },
  evening: { start: 17, end: 21 },
  night: { start: 21, end: 5 }
};

// Command handlers map
const commandHandlers = {
  update_user_profile: async (params, { screen, UI }) => {
    const config = getHeebaConfig();
    const { field, value } = params;

    if (!field || !value) {
      return { success: false, message: 'Missing field or value' };
    }

    if (field === 'name') {
      config.user_profile.name = value;
      config.user_profile.how_to_address = value;
    } else if (field === 'how_to_address') {
      config.user_profile.how_to_address = value;
    } else if (field === 'communication_style') {
      config.user_profile.communication_style = value;
    } else {
      return { success: false, message: `Unknown field: ${field}` };
    }

    // Persist to heeba.json
    const configPath = path.join(process.cwd(), 'heeba.json');
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      // Reload config in config-loader
      reloadConfig();
      return { success: true, message: `Updated ${field} to "${value}"` };
    } catch (err) {
      return { success: false, message: `Failed to save: ${err.message}` };
    }
  },

  generate_code: async (params) => {
    // Placeholder for code generation logic
    return {
      success: true,
      message: `Code generation task queued: ${params.task_description || 'No description'}`
    };
  },

  debug_code: async (params) => {
    // Placeholder for debug logic
    return {
      success: true,
      message: `Debug task queued: ${params.error_description || 'No error description'}`
    };
  },

  analyze_file: async (params) => {
    // Placeholder for file analysis logic
    return {
      success: true,
      message: `File analysis queued: ${params.file_path || 'No path'}`
    };
  },

  update_config: async (params) => {
    const config = getHeebaConfig();
    const { section, field, value } = params;

    if (!section || !field || value === undefined) {
      return { success: false, message: 'Missing section, field, or value' };
    }

    try {
      if (config[section] && typeof config[section] === 'object') {
        config[section][field] = value;
      } else if (section === 'root') {
        config[field] = value;
      } else {
        // Create section if it doesn't exist
        config[section] = { [field]: value };
      }

      const configPath = path.join(process.cwd(), 'heeba.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      reloadConfig();
      return { success: true, message: `Updated config: [${section}].${field} = ${value}` };
    } catch (err) {
      return { success: false, message: `Failed to update config: ${err.message}` };
    }
  },

  rename_session: async (params, context) => {
    const { name } = params;
    if (!name || !name.trim()) {
      return { success: false, message: 'No session name provided.' };
    }
    const trimmedName = name.trim();

    // context.currentSession is the live session object from main.js
    if (!context.currentSession) {
      return { success: false, message: 'No active session to rename.' };
    }

    context.currentSession.name = trimmedName;

    // Fire callback so main.js can re-render the Index Page tree
    if (typeof context.onSessionRenamed === 'function') {
      context.onSessionRenamed(trimmedName);
    }

    return { success: true, message: `Session renamed to "${trimmedName}"` };
  },

  rename_conversation: async (params, context) => {
    const { title } = params;
    if (!title || !title.trim()) {
      return { success: false, message: 'No conversation title provided.' };
    }
    const trimmedTitle = title.trim();

    if (!context.currentPage) {
      return { success: false, message: 'No active conversation turn to rename.' };
    }

    context.currentPage.title = trimmedTitle;

    // Fire callback so main.js can re-render the Index Page tree
    if (typeof context.onConversationRenamed === 'function') {
      context.onConversationRenamed(trimmedTitle);
    }

    return { success: true, message: `Conversation turn renamed to "${trimmedTitle}"` };
  },

  delete_session: async (params, context) => {
    if (!context.currentSession) {
      return { success: false, message: 'No active session to delete.' };
    }

    // Fire callback — main.js removes the session from the array and navigates back
    if (typeof context.onSessionDeleted === 'function') {
      context.onSessionDeleted();
    }

    return { success: true, message: 'Session deleted.' };
  },

  add_ollama_model: async (params) => {
    const { virtual_name, actual_model, api_key, endpoint } = params;

    if (!virtual_name || !actual_model || !api_key || !endpoint) {
      return { success: false, message: 'Missing model details (name, key, or endpoint)' };
    }

    // Step 1: Test connection
    const test = await testOllamaConnection(api_key, endpoint, actual_model);
    if (!test.success) {
      return { success: false, message: `Connection test failed: ${test.message}` };
    }

    // Step 2: Load and update credentials.json
    try {
      const credPath = path.join(process.cwd(), 'credentials.json');
      let credentials = { ollama: { api_key, endpoint, models: [] } };
      
      if (fs.existsSync(credPath)) {
        credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      }

      // Add or update model
      const existingIdx = credentials.ollama.models.findIndex(m => m.virtual_name === virtual_name);
      if (existingIdx >= 0) {
        credentials.ollama.models[existingIdx] = { virtual_name, actual_model };
      } else {
        credentials.ollama.models.push({ virtual_name, actual_model });
      }

      fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), 'utf8');
      return { success: true, message: `Model "${virtual_name}" added and verified!` };
    } catch (err) {
      return { success: false, message: `Failed to save credentials: ${err.message}` };
    }
  },

  fetch_emails: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured in credentials.json' };

    const days = params.days || 3;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch({ since: sinceDate }, { envelope: true });
        const emails = [];
        lastMailList = []; 

        for await (let msg of messages) {
          emails.push({
            uid: msg.uid,
            date: msg.envelope.date,
            from: msg.envelope.from[0].name || msg.envelope.from[0].address,
            subject: msg.envelope.subject || '(No Subject)'
          });
          lastMailList.push(msg.uid);
        }

        if (emails.length === 0) {
          return { success: true, message: `No recent emails found in the last ${days} days.` };
        }

        const table = emailToTable(emails, `Recent Emails (last ${days} days)`, context);
        return { success: true, message: table + `\nType "Read email #" to open.` };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `IMAP Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  fetch_emails_by_date: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured.' };

    const { from, to } = params;
    const dateStr = from ? from.split('T')[0] : new Date().toISOString().split('T')[0];
    
    // Check Cache
    const cached = getFromCache(dateStr);
    if (cached && !params.refresh) {
      lastMailList = cached.map(m => m.uid);
      const table = emailToTable(cached, `Emails on ${dateStr} (Cached)`, context);
      return { success: true, message: table };
    }

    const searchCriteria = { };
    if (from) searchCriteria.since = new Date(from);
    if (to) searchCriteria.before = new Date(to);

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch(searchCriteria, { envelope: true });
        const emails = [];
        lastMailList = [];

        for await (let msg of messages) {
          emails.push({
            uid: msg.uid,
            date: msg.envelope.date,
            from: msg.envelope.from[0].name || msg.envelope.from[0].address,
            subject: msg.envelope.subject || '(No Subject)'
          });
          lastMailList.push(msg.uid);
        }

        saveToCache(dateStr, emails);
        const table = emailToTable(emails, `Emails on ${dateStr}`, context);
        return { success: true, message: table + `\nType "Read email #" to open.` };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `IMAP Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  fetch_unread_by_date: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured.' };

    const dateStr = params.date || new Date().toISOString().split('T')[0];
    const since = new Date(dateStr);
    const before = new Date(since);
    before.setDate(before.getDate() + 1);

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch({ since, before, unseen: true }, { envelope: true });
        const emails = [];
        lastMailList = [];

        for await (let msg of messages) {
          emails.push({
            uid: msg.uid,
            date: msg.envelope.date,
            from: msg.envelope.from[0].name || msg.envelope.from[0].address,
            subject: msg.envelope.subject || '(No Subject)'
          });
          lastMailList.push(msg.uid);
        }

        if (emails.length === 0) return { success: true, message: `No unread emails found for ${dateStr}.` };

        const table = emailToTable(emails, `Unread Emails on ${dateStr}`, context);
        return { success: true, message: table };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `IMAP Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  fetch_emails_by_timerange: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured.' };

    const { date, time_range } = params;
    const dateStr = date || new Date().toISOString().split('T')[0];
    const range = TIME_MAPPING[time_range] || TIME_MAPPING.morning;

    const since = new Date(dateStr);
    since.setHours(range.start, 0, 0, 0);
    const before = new Date(dateStr);
    before.setHours(range.end, 0, 0, 0);

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch({ since, before }, { envelope: true });
        const emails = [];
        lastMailList = [];

        for await (let msg of messages) {
          emails.push({
            uid: msg.uid,
            date: msg.envelope.date,
            from: msg.envelope.from[0].name || msg.envelope.from[0].address,
            subject: msg.envelope.subject || '(No Subject)'
          });
          lastMailList.push(msg.uid);
        }

        if (emails.length === 0) return { success: true, message: `No emails found for ${dateStr} ${time_range}.` };

        const table = emailToTable(emails, `${time_range.toUpperCase()} Emails on ${dateStr}`, context);
        return { success: true, message: table };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `IMAP Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  fetch_emails_by_filter: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured.' };

    const { date, from_contains, subject_contains } = params;
    const searchCriteria = {};
    if (date) {
      searchCriteria.since = new Date(date);
      const before = new Date(date);
      before.setDate(before.getDate() + 1);
      searchCriteria.before = before;
    }
    if (from_contains) searchCriteria.from = from_contains;
    if (subject_contains) searchCriteria.subject = subject_contains;

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch(searchCriteria, { envelope: true });
        const emails = [];
        lastMailList = [];

        for await (let msg of messages) {
          emails.push({
            uid: msg.uid,
            date: msg.envelope.date,
            from: msg.envelope.from[0].name || msg.envelope.from[0].address,
            subject: msg.envelope.subject || '(No Subject)'
          });
          lastMailList.push(msg.uid);
        }

        if (emails.length === 0) return { success: true, message: `No emails found matching filters.` };

        const table = emailToTable(emails, `Search Results`, context);
        return { success: true, message: table };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `IMAP Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  fetch_threads_by_sender: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured.' };

    const { sender, date } = params;
    const searchCriteria = { from: sender };
    if (date) {
      searchCriteria.since = new Date(date);
      const before = new Date(date);
      before.setDate(before.getDate() + 1);
      searchCriteria.before = before;
    }

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        // Fetch with headers for threading
        const messages = await client.fetch(searchCriteria, { envelope: true, headers: ['Message-ID', 'In-Reply-To', 'References'] });
        const emails = [];
        lastMailList = [];

        for await (let msg of messages) {
          emails.push({
            uid: msg.uid,
            date: msg.envelope.date,
            from: msg.envelope.from[0].name || msg.envelope.from[0].address,
            subject: msg.envelope.subject || '(No Subject)',
            messageId: msg.headers.get('message-id'),
            inReplyTo: msg.headers.get('in-reply-to')
          });
          lastMailList.push(msg.uid);
        }

        if (emails.length === 0) return { success: true, message: `No emails found for thread analysis.` };

        // Simple threading logic: find responses to the same subject or messageId
        let output = `[Threads with ${sender}]\n\n`;
        const groups = {};
        emails.forEach(m => {
          const key = m.subject.replace(/^Re:\s*/i, '');
          if (!groups[key]) groups[key] = [];
          groups[key].push(m);
        });

        Object.entries(groups).forEach(([sub, list]) => {
          output += ` ◈ ${sub}\n`;
          list.sort((a,b) => new Date(a.date) - new Date(b.date)).forEach(m => {
            const time = new Date(m.date).toLocaleString();
            output += `   └─ ${time} : ${m.from}\n`;
          });
          output += `\n`;
        });

        return { success: true, message: output };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `IMAP Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  export_emails_by_date: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured.' };

    const dateStr = params.date || new Date().toISOString().split('T')[0];
    const since = new Date(dateStr);
    const before = new Date(since);
    before.setDate(before.getDate() + 1);

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch({ since, before }, { envelope: true });
        let content = `# Emails for ${dateStr}\n\n`;
        let count = 0;

        for await (let msg of messages) {
          count++;
          const date = msg.envelope.date.toLocaleString();
          const from = msg.envelope.from[0].name || msg.envelope.from[0].address;
          const subject = msg.envelope.subject || '(No Subject)';
          content += `## ${count}. ${subject}\n- **From**: ${from}\n- **Date**: ${date}\n\n---\n\n`;
        }

        if (count === 0) return { success: true, message: `No emails to export for ${dateStr}.` };

        const ext = params.format === 'txt' ? 'txt' : 'md';
        const fileName = `${dateStr}-emails.${ext}`;
        const filePath = path.join(EXPORT_DIR, fileName);
        fs.writeFileSync(filePath, content);

        return { success: true, message: `Exported ${count} emails to ${filePath}` };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `IMAP Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  summarize_emails_by_date: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured.' };

    const dateStr = params.date || new Date().toISOString().split('T')[0];
    const since = new Date(dateStr);
    const before = new Date(since);
    before.setDate(before.getDate() + 1);

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch({ since, before }, { source: true, envelope: true });
        let combinedText = `Email Summary for ${dateStr}:\n\n`;
        let count = 0;

        for await (let msg of messages) {
          count++;
          const parsed = await simpleParser(msg.source);
          let body = parsed.text || '';
          if (!body && parsed.html) body = convert(parsed.html);
          
          combinedText += `--- Email ${count} ---\n`;
          combinedText += `From: ${msg.envelope.from[0].address}\n`;
          combinedText += `Subject: ${msg.envelope.subject}\n`;
          combinedText += `Body: ${truncate(body, 500)}\n\n`;
          
          if (count >= 10) break; // Limit to first 10 for context length safety
        }

        if (count === 0) return { success: true, message: `No emails found to summarize for ${dateStr}.` };

        const config = getHeebaConfig();
        const prompt = `Please summarize the following ${count} emails into categories like: Important, Promotional, Alerts, Personal. Provide a concise bulleted list for each category.\n\n${combinedText}`;
        
        // We use queryOllama directly, bypassing the usual session history
        const summary = await queryOllama(prompt, 'manual', config, null);
        
        return { success: true, message: `### Daily Summary: ${dateStr}\n\n${summary}` };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `Summarization Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  read_email: async (params, context) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured.' };

    let uid = params.uid;
    const index = parseInt(params.index);

    if (!uid && !isNaN(index) && index > 0 && index <= lastMailList.length) {
      uid = lastMailList[index - 1];
    }

    if (!uid) {
      return { success: false, message: 'Invalid email index or UID. Try fetching emails first.' };
    }

    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const message = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!message) return { success: false, message: 'Email not found.' };

        const parsed = await simpleParser(message.source);
        let body = parsed.text || '';
        
        if (!body && parsed.html) {
          body = convert(parsed.html, {
            wordwrap: 80,
            selectors: [
              { selector: 'a', options: { hideLinkHrefIfSameAsText: true } }
            ]
          });
        }

        const date = parsed.date ? parsed.date.toLocaleString() : 'Unknown Date';
        const from = parsed.from ? parsed.from.text : 'Unknown Sender';
        const subject = parsed.subject || '(No Subject)';
        
        const termWidth = context.screen?.width || 80;
        const availableWidth = Math.min(80, termWidth - 10);
        const wMeta = 12 + 1; // +1 for breathing room
        const wVal = availableWidth - wMeta - 3 + 1;

        let output = `\`\`\`table\n`;
        output += `┌${'─'.repeat(wMeta)}┬${'─'.repeat(wVal)}┐\n`;
        output += `│ ${pad('Date', wMeta - 1)}│ ${pad(truncate(date, wVal - 1), wVal - 1)}│\n`;
        output += `├${'─'.repeat(wMeta)}┼${'─'.repeat(wVal)}┤\n`;
        output += `│ ${pad('From', wMeta - 1)}│ ${pad(truncate(from, wVal - 1), wVal - 1)}│\n`;
        output += `├${'─'.repeat(wMeta)}┼${'─'.repeat(wVal)}┤\n`;
        output += `│ ${pad('Subject', wMeta - 1)}│ ${pad(truncate(subject, wVal - 1), wVal - 1)}│\n`;
        output += `└${'─'.repeat(wMeta)}┴${'─'.repeat(wVal)}┘\n\n`;
        
        // Framed body (indented)
        body.split('\n').forEach(line => {
          output += `  ${line}\n`;
        });
        output += `\`\`\``;

        return { success: true, message: output };
      } finally {
        lock.release();
      }
    } catch (err) {
      return { success: false, message: `IMAP Error: ${err.message}` };
    } finally {
      await client.logout();
    }
  },

  send_email: async (params) => {
    const creds = getEmailCredentials();
    if (!creds) return { success: false, message: 'Email credentials not configured in credentials.json' };

    let { to, subject, body, attachments } = params;
    if (!to || !subject || !body) {
      return { success: false, message: 'Missing recipient (to), subject, or body.' };
    }

    const config = getHeebaConfig();

    // Handle "reception" alias if not an email address
    if (to.toLowerCase() === 'reception') {
      if (config.user_profile && config.user_profile.reception_email) {
        to = config.user_profile.reception_email;
      }
    }

    const transporter = nodemailer.createTransport({
      host: creds.smtp || 'smtp.gmail.com',
      port: creds.smtp_port || 465,
      secure: (creds.smtp_port || 465) === 465,
      auth: { user: creds.user, pass: creds.pass }
    });

    const mailOptions = {
      from: `"${config.heeba_identity.name}" <${creds.user}>`,
      to,
      subject,
      text: body
    };

    // Handle attachments
    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      mailOptions.attachments = attachments.map(filePath => {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        if (fs.existsSync(absolutePath)) {
          return {
            filename: path.basename(absolutePath),
            path: absolutePath
          };
        } else {
          throw new Error(`Attachment file not found: ${filePath}`);
        }
      });
    } else if (attachments && typeof attachments === 'string') {
        // Handle single string attachment if LLM sends it that way
        const absolutePath = path.isAbsolute(attachments) ? attachments : path.join(process.cwd(), attachments);
        if (fs.existsSync(absolutePath)) {
          mailOptions.attachments = [{
            filename: path.basename(absolutePath),
            path: absolutePath
          }];
        } else {
          throw new Error(`Attachment file not found: ${attachments}`);
        }
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      let msg = `Email sent successfully to ${to}! (ID: ${info.messageId})`;
      if (mailOptions.attachments && mailOptions.attachments.length > 0) {
        msg += ` with ${mailOptions.attachments.length} attachment(s).`;
      }
      return { success: true, message: msg };
    } catch (err) {
      return { success: false, message: `SMTP Error: ${err.message}` };
    }
  }
};

// Parse JSON from LLM response
function parseCommandFromResponse(response) {
  // Look for JSON block in the response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                    response.match(/\{[\s\S]*"action"[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    } catch (e) {
      // Try to find raw JSON
      const rawMatch = response.match(/\{[\s\S]*\}/);
      if (rawMatch) {
        try {
          return JSON.parse(rawMatch[0]);
        } catch (e2) {
          return null;
        }
      }
    }
  }
  return null;
}

// Check if response contains a command
function hasCommand(response) {
  return response.includes('"action"') && response.includes('"parameters"');
}

// Execute a command
async function executeCommand(command, context) {
  const handler = commandHandlers[command.action];
  if (!handler) {
    return { success: false, message: `Unknown action: ${command.action}` };
  }

  return await handler(command.parameters || {}, context);
}

// Main entry: process LLM response and check for commands
async function processLLMResponse(response, context = {}) {
  const command = parseCommandFromResponse(response);

  if (command && command.action) {
    const result = await executeCommand(command, context);
    return {
      hasCommand: true,
      command,
      result
    };
  }

  return { hasCommand: false, command: null, result: null };
}

module.exports = {
  parseCommandFromResponse,
  hasCommand,
  executeCommand,
  processLLMResponse,
  commandHandlers
};
