// src/core/intent-executor.js
const fs = require('fs');
const path = require('path');
const { getHeebaConfig, reloadConfig } = require('./config-loader');
const { testOllamaConnection } = require('./ollama-adapter');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const { convert } = require('html-to-text');

let lastMailList = []; // Array of UIDs from last fetch_emails

const getEmailCredentials = () => {
  try {
    const credPath = path.join(process.cwd(), 'credentials.json');
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      return creds.email;
    }
  } catch (err) {
    // Silent fail for TUI
  }
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
    const client = new ImapFlow({
      host: creds.host || 'imap.gmail.com',
      port: creds.port || 993,
      secure: true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false
    });

    try {
      await client.connect();
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - days);

      let lock = await client.getMailboxLock('INBOX');
      try {
        let messages = await client.fetch({ since: sinceDate }, { envelope: true });
        lastMailList = []; 

        const termWidth = context.screen?.width || 80;
        const availableWidth = Math.max(50, termWidth - 10);
        
        // Col Widths (+1 added for breathing room)
        const wIdx = 4 + 1;
        const wDate = 10 + 1;
        const wFrom = Math.floor((availableWidth - wIdx - wDate) * 0.3) + 1;
        const wSub = (availableWidth - wIdx - wDate - wFrom - 6) + 1;

        let table = `Recent Emails (last ${days} days):\n\n\`\`\`table\n`;
        table += `┌${'─'.repeat(wIdx)}┬${'─'.repeat(wDate)}┬${'─'.repeat(wFrom)}┬${'─'.repeat(wSub)}┐\n`;
        table += `│ ${pad('#', wIdx - 1)}│ ${pad('Date', wDate - 1)}│ ${pad('From', wFrom - 1)}│ ${pad('Subject', wSub - 1)}│\n`;
        table += `├${'─'.repeat(wIdx)}┼${'─'.repeat(wDate)}┼${'─'.repeat(wFrom)}┼${'─'.repeat(wSub)}┤\n`;

        let count = 0;
        for await (let msg of messages) {
          count++;
          lastMailList.push(msg.uid);
          const date = msg.envelope.date.toISOString().split('T')[0];
          const from = msg.envelope.from[0].name || msg.envelope.from[0].address;
          const subject = msg.envelope.subject || '(No Subject)';
          
          table += `│ ${pad(count, wIdx - 1)}│ ${pad(date, wDate - 1)}│ ${pad(truncate(from, wFrom - 1), wFrom - 1)}│ ${pad(truncate(subject, wSub - 1), wSub - 1)}│\n`;
        }

        if (count === 0) {
          return { success: true, message: 'No recent emails found in the last 3 days.' };
        }

        table += `└${'─'.repeat(wIdx)}┴${'─'.repeat(wDate)}┴${'─'.repeat(wFrom)}┴${'─'.repeat(wSub)}┘\n\`\`\``;
        table += `\nType "Read email #" to open.`;
        
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

    const { to, subject, body } = params;
    if (!to || !subject || !body) {
      return { success: false, message: 'Missing recipient (to), subject, or body.' };
    }

    const transporter = nodemailer.createTransport({
      host: creds.smtp || 'smtp.gmail.com',
      port: creds.smtp_port || 465,
      secure: (creds.smtp_port || 465) === 465,
      auth: { user: creds.user, pass: creds.pass }
    });

    try {
      const config = getHeebaConfig();
      const info = await transporter.sendMail({
        from: `"${config.heeba_identity.name}" <${creds.user}>`,
        to,
        subject,
        text: body
      });
      return { success: true, message: `Email sent successfully! (ID: ${info.messageId})` };
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
