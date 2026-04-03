// src/core/handlers/email-handler.js
const fs = require('fs');
const path = require('path');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { convert } = require('html-to-text');
const { getHeebaConfig } = require('../config-loader');
const { queryOllama } = require('../ollama-adapter');
const { getEmailAccount } = require('../email-accounts');
const { CACHE_DIR, EXPORT_DIR, CREDENTIALS_PATH } = require('../../utils/paths');

let lastMailList = []; // Array of UIDs from last fetch_emails

// Ensure directories exist
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });



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
    
    if (idx < emails.length - 1) {
      table += `├${'─'.repeat(wIdx)}┼${'─'.repeat(wDate)}┼${'─'.repeat(wFrom)}┼${'─'.repeat(wSub)}┤\n`;
    }
  });
  table += `└${'─'.repeat(wIdx)}┴${'─'.repeat(wDate)}┴${'─'.repeat(wFrom)}┴${'─'.repeat(wSub)}┘\n\`\`\``;
  return table;
};

// Commmand Implementations
const emailHandlers = {
  fetch_emails: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

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

        if (emails.length === 0) return { success: true, message: `No recent emails in last ${days} days.` };
        return { success: true, message: emailToTable(emails, `Recent Emails`, context) + `\nType "Read email #" to open.` };
      } finally { lock.release(); }
    } catch (err) { return { success: false, message: `IMAP Error: ${err.message}` }; }
    finally { await client.logout(); }
  },

  fetch_emails_by_date: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    const { from, to } = params;
    const dateStr = from ? from.split('T')[0] : new Date().toISOString().split('T')[0];
    
    const cached = getFromCache(dateStr);
    if (cached && !params.refresh) {
      lastMailList = cached.map(m => m.uid);
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
        lastMailList = [];
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
        lastMailList = [];
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

  fetch_emails_by_timerange: async (params, context) => {
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

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
        const emails = []; lastMailList = [];
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
        const emails = []; lastMailList = [];
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
        const emails = []; lastMailList = [];
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

  export_emails_by_date: async (params, context) => {
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
        const config = getHeebaConfig();
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
    const account = getEmailAccount(params.account_id);
    if (!account) return { success: false, message: 'Email credentials not configured.' };

    let { to, subject, body, attachments } = params;
    if (!to || !subject) return { success: false, message: 'Missing recipient (to) or subject.' };
    body = body || '';

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

    if (attachments && Array.isArray(attachments) && attachments.length > 0) {
      const path = require('path');
      const fsLocal = require('fs');
      mailOptions.attachments = attachments.map(filePath => {
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        if (fsLocal.existsSync(absolutePath)) {
          return { filename: path.basename(absolutePath), path: absolutePath };
        } else {
          throw new Error(`Attachment file not found: ${filePath}`);
        }
      });
    } else if (attachments && typeof attachments === 'string') {
        const path = require('path');
        const fsLocal = require('fs');
        const absolutePath = path.isAbsolute(attachments) ? attachments : path.join(process.cwd(), attachments);
        if (fsLocal.existsSync(absolutePath)) {
          mailOptions.attachments = [{ filename: path.basename(absolutePath), path: absolutePath }];
        } else {
          throw new Error(`Attachment file not found: ${attachments}`);
        }
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      let msg = `Email sent successfully to ${to}! (ID: ${info.messageId})`;
      if (mailOptions.attachments && mailOptions.attachments.length > 0) msg += ` with ${mailOptions.attachments.length} attachment(s).`;
      return { success: true, message: msg };
    } catch (err) { return { success: false, message: `SMTP Error: ${err.message}` }; }
  }
};
module.exports = emailHandlers;
