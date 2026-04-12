// src/telegram/telegram-router.js
const fs = require('fs');
const path = require('path');
const { queryLLM, getTotalTokensUsed } = require('../core/engine');
const { 
  parseCommandFromResponse, 
  executeCommand,
  isSecurityIntentTriggered,
  runSecurityAuditLoop,
  isAppAuditIntentTriggered,
  runAppAuditLoop,
  extractEmailFromPrompt,
  printAuditStep,
  printAppAuditStep,
  runAgenticLoop
} = require('../core/intent-executor');
const { state } = require('../core/state-manager');
const { MODES } = require('../utils/helpers');

// pkg-compatible path for sessions file (must be on real disk, not snapshot)
const SESSIONS_BASE = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..', '..');
const SESSIONS_PATH = path.join(SESSIONS_BASE, 'telegram-sessions.json');

/**
 * Loads Telegram sessions from disk
 */
function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_PATH)) {
      return JSON.parse(fs.readFileSync(SESSIONS_PATH, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading Telegram sessions:', e);
  }
  return {};
}

/**
 * Saves Telegram sessions to disk
 */
function saveSessions(sessions) {
  try {
    fs.writeFileSync(SESSIONS_PATH, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving Telegram sessions:', e);
  }
}

/**
 * Converts a raw email table block (```table...```) into a clean Telegram-friendly list.
 * Parses rows from the ASCII table and renders them as numbered emoji entries.
 */
function convertEmailTableToTelegram(text) {
  if (!text) return '';

  // Detect ```table blocks produced by formatEmailTable
  const tableBlockMatch = text.match(/```table\n([\s\S]*?)```/);
  if (!tableBlockMatch) return null; // Not a table block

  const tableContent = tableBlockMatch[1];
  const lines = tableContent.split('\n');

  // Extract title (line before the ```table block)
  const titleMatch = text.match(/^(.*?)\n\n```table/);
  const title = titleMatch ? titleMatch[1].trim() : 'Emails';

  // Parse data rows: lines that start with │ and contain a number in the first cell
  const dataRows = [];
  for (const line of lines) {
    if (!line.startsWith('│')) continue;
    // Split on │ and clean cells
    const cells = line.split('│').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length < 4) continue;
    const idx = parseInt(cells[0]);
    if (isNaN(idx)) continue; // Skip header row
    dataRows.push({
      idx,
      date: cells[1] || '',
      from: cells[2] || '',
      subject: cells[3] || ''
    });
  }

  if (dataRows.length === 0) return null;

  // Build Telegram-friendly output
  let output = `📬 *${title}*\n`;
  output += `─────────────────────\n`;
  dataRows.forEach(row => {
    output += `\n*${row.idx}.* ${row.subject}\n`;
    output += `   👤 ${row.from}\n`;
    output += `   📅 ${row.date}\n`;
  });
  output += `\n─────────────────────`;

  // Preserve the hint text after the code block (e.g. "Type 'Read email #' to open.")
  const afterBlock = text.replace(/[\s\S]*```/, '').trim();
  if (afterBlock) output += `\n_${afterBlock}_`;

  return output;
}

/**
 * Converts a generic ```table block to a clean Telegram-friendly list.
 * Parses any ASCII table (software, files, generic data) and renders as numbered emoji entries.
 */
function convertGenericTableToTelegram(text) {
  if (!text) return '';

  const tableBlockMatch = text.match(/```table\n([\s\S]*?)```/);
  if (!tableBlockMatch) return null;

  const tableContent = tableBlockMatch[1];
  const lines = tableContent.split('\n').filter(l => l.trim());

  // Extract title (line before the ```table block)
  const titleMatch = text.match(/^(.*?)\n\n```table/);
  const title = titleMatch ? titleMatch[1].trim() : 'Data';

  // Detect if this is a software table (check for Version/Publisher columns)
  const hasVersion = tableContent.includes('Version') || tableContent.includes('version');
  const hasPublisher = tableContent.includes('Publisher') || tableContent.includes('publisher');
  const hasInstallDate = tableContent.includes('Installed') || tableContent.includes('Install');

  // Parse data rows: lines that start with │ and have a number in the first cell
  const dataRows = [];
  for (const line of lines) {
    if (!line.startsWith('│')) continue;
    const cells = line.split('│').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length < 2) continue;
    const idx = parseInt(cells[0]);
    if (isNaN(idx)) continue; // Skip header row
    dataRows.push(cells.slice(1)); // Remove index column
  }

  if (dataRows.length === 0) return null;

  let output = `📋 *${title}*\n`;
  output += '─────────────────────\n';

  dataRows.forEach((row, i) => {
    const emoji = ['🔹', '🔸', '🔺', '🔻'][i % 4];

    if (hasVersion && hasPublisher) {
      // Software table format
      const name = row[0] || '';
      const version = row[1] || '';
      const publisher = row[2] || '';
      output += `\n${emoji} *${idx = i + 1}.* ${name}\n`;
      if (version) output += `   🏷 Version: ${version}\n`;
      if (publisher) output += `   🏭 ${publisher}\n`;
    } else if (hasInstallDate) {
      // Software or file with install date
      const name = row[0] || '';
      const date = row[1] || '';
      output += `\n${emoji} *${i + 1}.* ${name}\n`;
      if (date) output += `   📅 ${date}\n`;
    } else {
      // Generic format
      output += `\n${emoji} *${i + 1}.* ${row[0] || ''}\n`;
      row.slice(1).forEach(cell => {
        if (cell) output += `   └ ${cell}\n`;
      });
    }
  });

  output += '\n─────────────────────';

  // Preserve hint text after the code block
  const afterBlock = text.replace(/[\s\S]*```/, '').trim();
  if (afterBlock) output += `\n_${afterBlock}_`;

  return output;
}

/**
 * Converts a software ```table block to a Telegram-friendly list.
 */
function convertSoftwareTableToTelegram(text) {
  if (!text) return '';
  if (!text.includes('Installed Software') && !text.includes('Installed Packages')) {
    return null;
  }
  return convertGenericTableToTelegram(text);
}

/**
 * Converts a ```table email card (from read_email) to a clean Telegram message.
 */
function convertEmailCardToTelegram(text) {
  if (!text) return '';

  const cardMatch = text.match(/```table\n([\s\S]*?)```([\s\S]*)/);
  if (!cardMatch) return null;

  const tableContent = cardMatch[1];
  const bodyContent = cardMatch[2] ? cardMatch[2].trim() : '';

  const lines = tableContent.split('\n');
  const meta = {};
  for (const line of lines) {
    if (!line.startsWith('│')) continue;
    const cells = line.split('│').map(c => c.trim()).filter(c => c.length > 0);
    if (cells.length >= 2) {
      const key = cells[0].toLowerCase();
      const val = cells[1];
      if (key === 'date') meta.date = val;
      if (key === 'from') meta.from = val;
      if (key === 'subject') meta.subject = val;
    }
  }

  let output = `📧 *Email*\n`;
  output += `─────────────────────\n`;
  if (meta.subject) output += `*Subject:* ${meta.subject}\n`;
  if (meta.from)    output += `*From:* ${meta.from}\n`;
  if (meta.date)    output += `*Date:* ${meta.date}\n`;
  output += `─────────────────────\n`;
  if (bodyContent) {
    // No truncation here — sendSafe() in the launcher handles chunking at 4096 chars
    output += `\n${bodyContent}`;
  }

  return output;
}

const Formatter = require('../utils/formatter');

/**
 * Master post-processor: detects and converts any table-format output to Telegram-friendly text.
 */
function formatForTelegram(text) {
  if (!text) return '';

  // Try software table first
  const softwareResult = convertSoftwareTableToTelegram(text);
  if (softwareResult) return softwareResult;

  // Try generic table (handles software, files, any ```table block)
  const genericResult = convertGenericTableToTelegram(text);
  if (genericResult) return genericResult;

  // Try email list table
  const listResult = convertEmailTableToTelegram(text);
  if (listResult) return listResult;

  // Try email card (read_email view)
  const cardResult = convertEmailCardToTelegram(text);
  if (cardResult) return cardResult;

  // No table detected — strip any ANSI escape codes using Formatter and return as-is
  return Formatter.toPlain(text);
}

/**
 * Processes an incoming Telegram message
 */
async function processMessage(uid, text, configOverride = {}) {
  const sessions = loadSessions();
  const session = sessions[uid] || { history: [], last_accessed: Date.now() };
  
  // Merge config
  const config = { ...state.CONFIG, ...configOverride };
  const onUpdate = configOverride.onUpdate || null;

  // Check for security audit intent FIRST
  const intentRules = config.intent_routing_rules || {};
  if (isSecurityIntentTriggered(text, intentRules)) {
    try {
      if (onUpdate) await onUpdate(`⁜ Security Audit Mode Activated`);
      
      const emailTo = extractEmailFromPrompt(text);
      const auditResult = await runSecurityAuditLoop(
        text,
        (p, mode) => queryLLM(p, mode, config, null),
        15,
        { 
          isTUI: false, 
          emailTo,
          onStep: async (step) => {
            if (!onUpdate) return;
            // Get formatted lines (silent=true means capture only)
            const lines = printAuditStep(step, false, true); 
            // Join lines and strip ANSI for Telegram
            const cleanText = lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
            if (cleanText.trim()) {
              await onUpdate(cleanText);
            }
          }
        }
      );

      let summary = `✔️ *Security Audit Completed*\n`;
      if (auditResult.conclusion) {
        summary += `\nScore: *${auditResult.conclusion.security_score}*\n`;
        if (auditResult.conclusion.findings) {
           summary += `\n*Findings:*\n` + auditResult.conclusion.findings.map(f => `• ${f}`).join('\n');
        }
      }
      
      return {
        text: summary,
        log: {
          time: new Date().toLocaleTimeString(),
          uid,
          prompt: text.substring(0, 20),
          intent: 'system_security_testing',
          handler: 'security_audit_loop',
          status: 'Success'
        }
      };
    } catch (e) {
      console.error('Telegram Audit Error:', e);
      return { text: `⚠️ Audit Error: ${e.message}`, log: { status: 'Failed' } };
    }
  }

  // Check for app audit intent
  if (isAppAuditIntentTriggered(text, intentRules)) {
    try {
      if (onUpdate) await onUpdate(`⁜ App Endpoint Audit Mode Activated`);
      
      const auditResult = await runAppAuditLoop(
        text,
        (p, mode) => queryLLM(p, mode, config, null),
        15,
        { 
          isTUI: false, 
          onStep: async (step) => {
            if (!onUpdate) return;
            const lines = printAppAuditStep(step, false, true); // silent=true
            const cleanText = lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '');
            if (cleanText.trim()) {
              await onUpdate(cleanText);
            }
          }
        }
      );

      let summary = `✔️ *App Audit Completed*\n`;
      if (auditResult.conclusion) {
        const c = auditResult.conclusion;
        summary += `\nPort: *${c.port}*\n`;
        if (c.endpoints && c.endpoints.length > 0) {
          summary += `\n*Endpoints Detected:*\n`;
          c.endpoints.forEach(e => {
            summary += `• [${e.method}] ${e.path} -> ${e.status}\n`;
          });
        }
        if (c.summary) summary += `\n*Summary:* ${c.summary}`;
      }
      
      return {
        text: summary,
        log: {
          time: new Date().toLocaleTimeString(),
          uid,
          prompt: text.substring(0, 20),
          intent: 'app_endpoint_audit',
          handler: 'app_audit_loop',
          status: 'Success'
        }
      };
    } catch (e) {
      console.error('Telegram App Audit Error:', e);
      return { text: `⚠️ Audit Error: ${e.message}`, log: { status: 'Failed' } };
    }
  }
  try {
    const agentResult = await runAgenticLoop(
      text,
      (p, mode) => queryLLM(p, mode, config, null, session.history),
      5,
      {
        context: { screen: null, UI: null, config },
        onStep: async (step) => {
          if (!onUpdate) return;
          if (step.phase === 'planning') {
            await onUpdate(`◈ Designing strategic plan...`);
          } else if (step.phase === 'plan_ready') {
            let planMsg = `📋 *Strategic Roadmap*\n─────────────────────\n`;
            step.plan.forEach((s, i) => {
              planMsg += `*${i + 1}.* ${s}\n`;
            });
            planMsg += `─────────────────────`;
            await onUpdate(planMsg);
          } else if (step.phase === 'executing') {
            await onUpdate(`◈ [Step ${step.iteration}] ${step.stepTitle}\nAction: \`${step.action}\``);
          } else if (step.phase === 'result') {
            const icon = step.success ? '✅' : '❌';
            const cleanResult = formatForTelegram(step.result.split('\n')[0]);
            await onUpdate(`${icon} ${cleanResult}`);
          }
        }
      }
    );

    // Update history for statefulness
    session.history.push({ user: text, assistant: agentResult.finalResponse });
    if (session.history.length > 10) session.history.shift();
    
    session.last_accessed = Date.now();
    sessions[uid] = session;
    saveSessions(sessions);

    // Final formatting pass
    const finalText = formatForTelegram(agentResult.finalResponse);

    return {
      text: finalText,
      log: {
        time: new Date().toLocaleTimeString(),
        uid,
        prompt: text.substring(0, 20),
        intent: 'agentic_loop',
        handler: 'multiple',
        status: 'Success'
      }
    };

  } catch (error) {
     console.error('Telegram Router Error:', error);
     return {
       text: `⚠️ Error processing request: ${error.message}`,
       log: {
         time: new Date().toLocaleTimeString(),
         uid,
         prompt: text.substring(0, 20),
         intent: 'Error',
         handler: 'None',
         status: 'Failed'
       }
     };
  }
}

module.exports = { processMessage };
