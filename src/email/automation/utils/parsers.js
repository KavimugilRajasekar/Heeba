// src/email/automation/utils/parsers.js
const { simpleParser } = require('mailparser');
const { convert } = require('html-to-text');

/**
 * Parses email source into body text and metadata
 * @param {Buffer} source - Raw email source
 * @returns {Promise<{body: string, parsed: Object}>}
 */
async function parseEmailBody(source) {
  const parsed = await simpleParser(source);
  let body = parsed.text || '';
  if (!body && parsed.html) {
    body = convert(parsed.html, { wordwrap: 80 });
  }
  return { body, parsed };
}

/**
 * Detects OTP code from email body text
 * @param {string} text - Email body text
 * @returns {string|null} Detected OTP or null
 */
function extractOtp(text) {
  const patterns = [
    /(?<![a-zA-Z0-9])(\d{4,8})(?![a-zA-Z0-9])/,  // Standalone 4-8 digit
    /your\s+code\s+(?:is\s+)?[:\s]*(\d{4,6})/i,
    /verification\s+code\s*[:\s]*(\d{4,6})/i,
    /OTP\s*[:\s]*(\d{4,6})/i,
    /one[- ]?time\s*password\s*[:\s]*(\d{4,6})/i,
    /security\s+code\s*[:\s]*(\d{4,6})/i,
    /一次性密码[：:\s]*(\d{4,6})/i,
    /验证码[：:\s]*(\d{4,6})/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0];
    }
  }
  return null;
}

/**
 * Extracts tasks from email body using common patterns
 * @param {string} text - Email body text
 * @returns {Array<{title: string, deadline: string|null, done: boolean}>}
 */
function extractTasks(text) {
  const tasks = [];
  const lines = text.split('\n');

  // Pattern: [ ] task description
  const uncheckedPattern = /^\s*\[\s*\]\s*(.+)/i;
  // Pattern: [x] completed task
  const checkedPattern = /^\s*\[x\]\s*(.+)/i;
  // Pattern: due: DATE, deadline: DATE, by: DATE
  const deadlinePattern = /(?:due|deadline|by|截止)[:\s]*(.+?)(?:\n|$)/i;
  // Pattern: tomorrow, next week, specific dates
  const datePattern = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|next\s+\w+|tomorrow|today|\w+day)/i;

  let currentTask = null;

  for (const line of lines) {
    const uncheckedMatch = line.match(uncheckedPattern);
    const checkedMatch = line.match(checkedPattern);

    if (uncheckedMatch) {
      if (currentTask) tasks.push(currentTask);
      const deadlineMatch = line.match(deadlinePattern);
      currentTask = {
        title: uncheckedMatch[1].trim(),
        deadline: deadlineMatch ? parseFlexibleDate(deadlineMatch[1]) : null,
        done: false
      };
    } else if (checkedMatch) {
      if (currentTask) tasks.push(currentTask);
      currentTask = {
        title: checkedMatch[1].trim(),
        deadline: null,
        done: true
      };
    } else if (currentTask) {
      const deadlineMatch = line.match(deadlinePattern);
      if (deadlineMatch) {
        currentTask.deadline = parseFlexibleDate(deadlineMatch[1]);
      }
    }
  }

  if (currentTask) tasks.push(currentTask);
  return tasks;
}

/**
 * Parses flexible date string into ISO format
 */
function parseFlexibleDate(dateStr) {
  if (!dateStr) return null;
  const cleaned = dateStr.trim().toLowerCase();

  const today = new Date();

  if (cleaned === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  if (cleaned === 'today') {
    return today.toISOString().split('T')[0];
  }

  if (cleaned.includes('next week')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }

  // Try to parse MM/DD or MM/DD/YYYY
  const dateNumMatch = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (dateNumMatch) {
    let month = parseInt(dateNumMatch[1]);
    let day = parseInt(dateNumMatch[2]);
    let year = dateNumMatch[3] ? parseInt(dateNumMatch[3]) : today.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  return dateStr.trim();
}

/**
 * Extracts sender name and email from parsed from field
 */
function extractSenderInfo(fromText) {
  if (!fromText) return { name: null, email: null };

  // Handle "Name <email@domain.com>" format
  const match = fromText.match(/^(.+?)\s*<(.+)>$/);
  if (match) {
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  }

  // Just email
  if (fromText.includes('@')) {
    return { name: null, email: fromText.trim().toLowerCase() };
  }

  // Just name
  return { name: fromText.trim(), email: null };
}

/**
 * Strips Re:, Fwd: etc from subject for threading
 */
function normalizeSubject(subject) {
  if (!subject) return '';
  return subject
    .replace(/^(?:Re:|Fwd?:|RE:|FW:|AW:|SV:|R:)\s*/gi, '')
    .trim();
}

module.exports = {
  parseEmailBody,
  extractOtp,
  extractTasks,
  parseFlexibleDate,
  extractSenderInfo,
  normalizeSubject
};
