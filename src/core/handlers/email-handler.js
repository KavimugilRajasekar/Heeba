// src/core/handlers/email-handler.js
const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { convert } = require('html-to-text');
const nodemailer = require('nodemailer');
const { getHeebaConfig } = require('../config-loader');
const { queryOllama } = require('../ollama-adapter');
const { getEmailAccount } = require('../email-accounts');
const { CACHE_DIR, EXPORT_DIR, CREDENTIALS_PATH, DOWNLOADS_DIR, AUTOMATION_DIR } = require('../../utils/paths');

// Store lastMailList per account to avoid cross-account confusion
const lastMailListByAccount = new Map();

// Ensure directories exist
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
if (!fs.existsSync(AUTOMATION_DIR)) fs.mkdirSync(AUTOMATION_DIR, { recursive: true });

// Import automation modules
const automationModules = [
  require('../../email/automation/rule-engine'),
  require('../../email/automation/search-builder'),
  require('../../email/automation/categorizer'),
  require('../../email/automation/attachment-downloader'),
  require('../../email/automation/thread-grouper'),
  require('../../email/automation/timeline-view'),
  require('../../email/automation/digest-generator'),
  require('../../email/automation/followup-tracker'),
  require('../../email/automation/quick-reply'),
  require('../../email/automation/otp-detector'),
  require('../../email/automation/priority-unread'),
  require('../../email/automation/exporter'),
  require('../../email/automation/date-filter'),
  require('../../email/automation/stats'),
  require('../../email/automation/spam-detector'),
  require('../../email/automation/bulk-actions'),
  require('../../email/automation/email-to-task'),
  require('../../email/automation/narrator')
];


const { formatEmailTable, truncate, pad } = require('../../utils/table-formatter');

const getCachePath = (dateStr) => path.join(CACHE_DIR, `${dateStr}.json`);

const saveToCache = (dateStr, emails) => {
  try {
    fs.writeFileSync(getCachePath(dateStr), JSON.stringify(emails, null, 2));
  } catch (e) { /* silent fail */ }
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

// Keep emailToTable as an alias for backward compatibility within this file if needed
// or just export formatEmailTable
const emailToTable = (emails, title, context) => formatEmailTable(emails, title, context);

// Command Implementations
// Merge automation modules with existing handlers
const allAutomationHandlers = {};
for (const mod of automationModules) {
  Object.assign(allAutomationHandlers, mod);
}

const emailHandlers = {
  // Helper to get account-scoped lastMailList
  _getLastMailList: (accountId) => {
    const key = accountId || 'default';
    if (!lastMailListByAccount.has(key)) {
      lastMailListByAccount.set(key, []);
    }
    return lastMailListByAccount.get(key);
  },

  // Helper to update lastMailList for an account
  _updateLastMailList: (accountId, uids) => {
    const key = accountId || 'default';
    lastMailListByAccount.set(key, uids);
  },

  fetch_emails: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const accountKey = params.account_id || 'default';
    const lastMailList = emailHandlers._getLastMailList(accountKey);
    lastMailList.length = 0; // Clear existing

    const days = params.days || 3;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com',
      port: account.port || 993,
      secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass },
      logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch({ since: sinceDate }, { envelope: true });
        const emails = [];

        for await (let msg of messages) {
          emails.push({
            uid: msg.uid,
            date: msg.envelope.date,
            from: msg.envelope.from[0].name || msg.envelope.from[0].address,
            subject: msg.envelope.subject || '(No Subject)'
          });
          lastMailList.push(msg.uid);
        }

        if (emails.length === 0) return { success: true, message: `No recent emails in last ${days} days.` };
        return { success: true, message: emailToTable(emails, `Recent Emails`, context) + `\nType "Read email #" to open.` };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  fetch_emails_by_date: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const accountKey = params.account_id || 'default';
    const lastMailList = emailHandlers._getLastMailList(accountKey);
    lastMailList.length = 0;

    const { from, to } = params;
    const dateStr = from ? from.split('T')[0] : new Date().toISOString().split('T')[0];

    const cached = getFromCache(dateStr);
    if (cached && !params.refresh) {
      lastMailList.push(...cached.map(m => m.uid));
      return { success: true, message: emailToTable(cached, `Emails on ${dateStr} (Cached)`, context) };
    }

    const searchCriteria = {};
    if (from) searchCriteria.since = new Date(from);
    if (to) searchCriteria.before = new Date(to);

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch(searchCriteria, { envelope: true });
        const emails = [];
        for await (let msg of messages) {
          emails.push({ uid: msg.uid, date: msg.envelope.date, from: (msg.envelope.from[0].name || msg.envelope.from[0].address), subject: (msg.envelope.subject || '(No Subject)') });
          lastMailList.push(msg.uid);
        }
        saveToCache(dateStr, emails);
        return { success: true, message: emailToTable(emails, `Emails on ${dateStr}`, context) + `\nType "Read email #" to open.` };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  fetch_unread_by_date: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const accountKey = params.account_id || 'default';
    const lastMailList = emailHandlers._getLastMailList(accountKey);
    lastMailList.length = 0;

    const dateStr = params.date || new Date().toISOString().split('T')[0];
    const since = new Date(dateStr);
    const before = new Date(since);
    before.setDate(before.getDate() + 1);

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch({ since, before, unseen: true }, { envelope: true });
        const emails = [];
        for await (let msg of messages) {
          emails.push({ uid: msg.uid, date: msg.envelope.date, from: (msg.envelope.from[0].name || msg.envelope.from[0].address), subject: (msg.envelope.subject || '(No Subject)') });
          lastMailList.push(msg.uid);
        }
        if (emails.length === 0) return { success: true, message: `No unread emails on ${dateStr}.` };
        return { success: true, message: emailToTable(emails, `Unread Emails on ${dateStr}`, context) };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  filter_by_time: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const accountKey = params.account_id || 'default';
    const lastMailList = emailHandlers._getLastMailList(accountKey);
    lastMailList.length = 0;

    const { date, time_range } = params;
    const dateStr = date || new Date().toISOString().split('T')[0];
    const TIME_MAPPING = {
        morning: { start: 5, end: 12 },
        afternoon: { start: 12, end: 17 },
        evening: { start: 17, end: 21 },
        night: { start: 21, end: 5 }
    };
    const range = TIME_MAPPING[time_range] || TIME_MAPPING.morning;

    const since = new Date(dateStr); since.setHours(range.start, 0, 0, 0);
    const before = new Date(dateStr); before.setHours(range.end, 0, 0, 0);

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch({ since, before }, { envelope: true });
        const emails = [];
        for await (let msg of messages) {
          emails.push({ uid: msg.uid, date: msg.envelope.date, from: (msg.envelope.from[0].name || msg.envelope.from[0].address), subject: (msg.envelope.subject || '(No Subject)') });
          lastMailList.push(msg.uid);
        }
        if (emails.length === 0) return { success: true, message: `No emails found for ${dateStr} ${time_range}.` };
        return { success: true, message: emailToTable(emails, `${time_range.toUpperCase()} Emails on ${dateStr}`, context) };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  fetch_emails_by_filter: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const accountKey = params.account_id || 'default';
    const lastMailList = emailHandlers._getLastMailList(accountKey);
    lastMailList.length = 0;

    const { date, from_contains, subject_contains } = params;
    const searchCriteria = {};
    if (date) {
      searchCriteria.since = new Date(date);
      const b = new Date(date); b.setDate(b.getDate() + 1);
      searchCriteria.before = b;
    }
    if (from_contains) searchCriteria.from = from_contains;
    if (subject_contains) searchCriteria.subject = subject_contains;

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch(searchCriteria, { envelope: true });
        const emails = [];
        for await (let msg of messages) {
          emails.push({ uid: msg.uid, date: msg.envelope.date, from: (msg.envelope.from[0].name || msg.envelope.from[0].address), subject: (msg.envelope.subject || '(No Subject)') });
          lastMailList.push(msg.uid);
        }
        if (emails.length === 0) return { success: true, message: `No emails found matching filters.` };
        return { success: true, message: emailToTable(emails, `Search Results`, context) };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  fetch_threads_by_sender: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const accountKey = params.account_id || 'default';
    const lastMailList = emailHandlers._getLastMailList(accountKey);
    lastMailList.length = 0;

    const { sender, date } = params;
    const searchCriteria = { from: sender };
    if (date) {
      searchCriteria.since = new Date(date);
      const b = new Date(date); b.setDate(b.getDate() + 1);
      searchCriteria.before = b;
    }

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const messages = await client.fetch(searchCriteria, { envelope: true, headers: ['Message-ID', 'In-Reply-To', 'References'] });
        const emails = [];
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
            output += `   └─ ${new Date(m.date).toLocaleString()} : ${m.from}\n`;
          });
          output += `\n`;
        });
        return { success: true, message: output };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  export_emails: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const dateStr = params.date || new Date().toISOString().split('T')[0];
    const since = new Date(dateStr);
    const before = new Date(since); before.setDate(before.getDate() + 1);

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
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
          const d = msg.envelope.date.toLocaleString();
          const f = msg.envelope.from[0].name || msg.envelope.from[0].address;
          const s = msg.envelope.subject || '(No Subject)';
          content += `## ${count}. ${s}\n- **From**: ${f}\n- **Date**: ${d}\n\n---\n\n`;
        }
        if (count === 0) return { success: true, message: `No emails to export for ${dateStr}.` };
        const ext = params.format === 'txt' ? 'txt' : 'md';
        const fp = path.join(EXPORT_DIR, `${dateStr}-emails.${ext}`);
        fs.writeFileSync(fp, content);
        return { success: true, message: `Exported ${count} emails to ${fp}` };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  summarize_emails_by_date: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const dateStr = params.date || new Date().toISOString().split('T')[0];
    const since = new Date(dateStr);
    const before = new Date(since); before.setDate(before.getDate() + 1);

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
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
          combinedText += `--- Email ${count} ---\nFrom: ${msg.envelope.from[0].address}\nSubject: ${msg.envelope.subject}\nBody: ${truncate(body, 500)}\n\n`;
          if (count >= 10) break;
        }
        if (count === 0) return { success: true, message: `No emails found for ${dateStr}.` };
        const config = context.config || getHeebaConfig();
        const prompt = `Summarize these ${count} emails into categories: Important, Promotional, Alerts, Personal. Bullet points.\n\n${combinedText}`;
        const summary = await queryOllama(prompt, 'manual', config, null);
        return { success: true, message: `### Daily Summary: ${dateStr}\n\n${summary}` };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `Summarization Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  read_email: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const accountKey = params.account_id || 'default';
    const lastMailList = emailHandlers._getLastMailList(accountKey);

    let uid = params.uid;
    const index = parseInt(params.index);
    if (!uid && !isNaN(index) && index > 0 && index <= lastMailList.length) {
      uid = lastMailList[index - 1];
    }
    if (!uid) return { success: false, message: 'Invalid email index or UID.' };

    const client = new ImapFlow({
      host: account.imap_host || account.host || 'imap.gmail.com', port: account.port || 993, secure: true,
      auth: { user: account.email, pass: account.app_password || account.pass }, logger: false
    });

    try {
      await client.connect();
      let lock = await client.getMailboxLock('INBOX');
      try {
        const message = await client.fetchOne(uid, { source: true }, { uid: true });
        if (!message) return { success: false, message: 'Email not found.' };

        const parsed = await simpleParser(message.source);
        let body = parsed.text || '';
        if (!body && parsed.html) body = convert(parsed.html, { wordwrap: 80, selectors: [{ selector: 'a', options: { hideLinkHrefIfSameAsText: true } }] });

        const date = parsed.date ? parsed.date.toLocaleString() : 'Unknown Date';
        const from = parsed.from ? parsed.from.text : 'Unknown Sender';
        const subject = parsed.subject || '(No Subject)';
        const termWidth = context.screen?.width || 80;
        const width = Math.min(80, termWidth - 10);
        const wMeta = 12 + 1;
        const wVal = width - wMeta - 3 + 1;

        let output = `\`\`\`table\n┌${'─'.repeat(wMeta)}┬${'─'.repeat(wVal)}┐\n`;
        output += `│ ${pad('Date', wMeta - 1)}│ ${pad(truncate(date, wVal - 1), wVal - 1)}│\n├${'─'.repeat(wMeta)}┼${'─'.repeat(wVal)}┤\n`;
        output += `│ ${pad('From', wMeta - 1)}│ ${pad(truncate(from, wVal - 1), wVal - 1)}│\n├${'─'.repeat(wMeta)}┼${'─'.repeat(wVal)}┤\n`;
        output += `│ ${pad('Subject', wMeta - 1)}│ ${pad(truncate(subject, wVal - 1), wVal - 1)}│\n└${'─'.repeat(wMeta)}┴${'─'.repeat(wVal)}┘\n\n`;
        body.split('\n').forEach(line => { output += `  ${line}\n`; });
        output += `\`\`\``;

        return { success: true, message: output };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },
  add_email_account: async (params) => {
    const { id, email, app_password, imap_host, smtp_host } = params;
    if (!email || !app_password) return { success: false, message: 'Missing required fields: email, app_password' };
    const { addEmailAccount, testEmailAccount } = require('../email-accounts');
    const account = {
      id: id || `account_${Date.now()}`,
      email,
      app_password,
      imap_host: imap_host || 'imap.gmail.com',
      smtp_host: smtp_host || 'smtp.gmail.com'
    };
    const test = await testEmailAccount(account);
    if (!test.success) return { success: false, message: `Connection test failed: ${test.message}` };
    addEmailAccount(account);
    return { success: true, message: `Email account "${email}" added successfully!` };
  },

  send_email: async (params) => {
    const { getEmailAccount } = require('../email-accounts');
    const TreeReporter = require('../../utils/tree-reporter');
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    let { to, subject, body, attachments } = params;
    if (!to || !subject) return { success: false, message: 'Missing recipient (to) or subject.' };
    body = body || '';

    const tree = new TreeReporter('Email Automation', 'Preparing communication');
    tree.branch('Action', 'Send Email');
    tree.leaf('To', to);
    tree.leaf('Subject', subject);

    const { getHeebaConfig } = require('../config-loader');
    const config = getHeebaConfig();
    if (to.toLowerCase() === 'reception') {
      if (config.user_profile && config.user_profile.reception_email) {
        to = config.user_profile.reception_email;
      }
    }

    const transporter = nodemailer.createTransport({
      host: account.smtp_host || account.smtp || 'smtp.gmail.com',
      port: account.smtp_port || 465,
      secure: (account.smtp_port || 465) === 465,
      auth: { user: account.email, pass: account.app_password || account.pass }
    });

    const mailOptions = {
      from: `"${config.heeba_identity?.name || 'Heeba'}" <${account.email}>`,
      to,
      subject,
      text: body
    };

    if (attachments && (Array.isArray(attachments) || typeof attachments === 'string')) {
      const attArray = Array.isArray(attachments) ? attachments : [attachments];
      tree.branch('Attachments', `${attArray.length} file(s) scanning`);
      
      const path = require('path');
      const fsLocal = require('fs');
      mailOptions.attachments = attArray.map(filePath => {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        if (fsLocal.existsSync(absolutePath)) {
          tree.leaf('Attaching', path.basename(absolutePath));
          return { filename: path.basename(absolutePath), path: absolutePath };
        } else {
          throw new Error(`Attachment file not found: ${filePath}`);
        }
      });
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      tree.complete(`Sent Successfully (ID: ${info.messageId.substring(0, 15)}...)`);
      return { success: true, message: tree.toString() };
    } catch (err) { 
        return { success: false, message: `SMTP Error: ${err.message}` }; 
    }
  }
};
// Export merged handlers - wrap automation modules to provide lastMailList
const finalHandlers = { ...emailHandlers };
for (const [name, handler] of Object.entries(allAutomationHandlers)) {
  finalHandlers[name] = async (params, context) => {
    // Use default account's lastMailList for automation modules
    const lastMailList = emailHandlers._getLastMailList('default');
    return await handler(params, { ...context, lastMailList });
  };
}

// Also export lastMailList map for use by automation modules (read-only reference)
finalHandlers._lastMailListByAccount = lastMailListByAccount;

module.exports = finalHandlers;
module.exports.emailHandlers = finalHandlers;
