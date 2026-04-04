// src/email/automation/utils/formatters.js
/**
 * Truncates a string to max length, adding '..' if truncated
 */
const truncate = (str, len) => {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 2) + '..' : str;
};

/**
 * Pads a string to specified length on the right
 */
const pad = (str, len) => {
  const s = String(str);
  return s + ' '.repeat(Math.max(0, len - s.length));
};

/**
 * Builds an ASCII table for email listings
 */
function emailToTable(emails, title, screenWidth = 80) {
  const termWidth = screenWidth || 80;
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
    table += `│ ${pad(String(idx + 1), wIdx - 1)}│ ${pad(date, wDate - 1)}│ ${pad(truncate(from, wFrom - 1), wFrom - 1)}│ ${pad(truncate(subject, wSub - 1), wSub - 1)}│\n`;

    if (idx < emails.length - 1) {
      table += `├${'─'.repeat(wIdx)}┼${'─'.repeat(wDate)}┼${'─'.repeat(wFrom)}┼${'─'.repeat(wSub)}┤\n`;
    }
  });
  table += `└${'─'.repeat(wIdx)}┴${'─'.repeat(wDate)}┴${'─'.repeat(wFrom)}┴${'─'.repeat(wSub)}┘\n\`\`\``;
  return table;
}

/**
 * Formats emails as a timeline grouped by date
 */
function formatTimeline(emails) {
  if (!emails || emails.length === 0) return 'No emails to display.';

  // Group by date
  const byDate = {};
  for (const msg of emails) {
    const dateKey = msg.date ? new Date(msg.date).toISOString().split('T')[0] : 'Unknown';
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(msg);
  }

  let output = '╔══════════════════════════════════════╗\n';
  output += '║           EMAIL TIMELINE              ║\n';
  output += '╚══════════════════════════════════════╝\n\n';

  const sortedDates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));
  for (const date of sortedDates) {
    const msgs = byDate[date].sort((a, b) => new Date(a.date) - new Date(b.date));
    output += `┌─ ${date} ─────────────────────────────┐\n`;
    for (const msg of msgs) {
      const time = new Date(msg.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const fromDisplay = truncate(msg.from || 'Unknown', 15);
      const subjectDisplay = truncate(msg.subject || '(No Subject)', 35);
      output += `│ ${time} │ ${pad(fromDisplay, 15)} │ ${subjectDisplay}\n`;
    }
    output += '└────────────────────────────────────┘\n\n';
  }

  return output;
}

/**
 * Returns a category icon character
 */
function categoryIcon(category) {
  const icons = {
    important: '!',
    work: '#',
    shopping: '$',
    alerts: '*',
    promo: '%',
    personal: '~',
    spam: 'X'
  };
  return icons[category] || '?';
}

/**
 * Formats a box for a single item with category
 */
function formatCategoryBox(email, screenWidth = 80) {
  const w = Math.min(80, screenWidth - 10);
  const wLabel = 10;
  const wValue = w - wLabel - 4;

  const category = email.category || 'personal';
  const icon = categoryIcon(category);

  let output = `\`\`\`table\n`;
  output += `│ ${pad('Cat', wLabel - 1)}│ ${icon} ${category}\n`;
  output += `│ ${pad('From', wLabel - 1)}│ ${truncate(email.from || 'Unknown', wValue)}\n`;
  output += `│ ${pad('Subject', wLabel - 1)}│ ${truncate(email.subject || '(No Subject)', wValue)}\n`;
  output += `\`\`\``;
  return output;
}

module.exports = {
  truncate,
  pad,
  emailToTable,
  formatTimeline,
  categoryIcon,
  formatCategoryBox
};
