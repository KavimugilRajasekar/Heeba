const truncate = (str, len) => {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 2) + '..' : str;
};

const pad = (str, len) => {
  const s = String(str);
  return s + ' '.repeat(Math.max(0, len - s.length));
};

const formatEmailTable = (emails, title, context, extraCols = []) => {
  const termWidth = context?.screen?.width || 80;
  const availableWidth = Math.max(50, termWidth - 10);
  
  // Calculate extra col widths
  let wExtraTotal = 0;
  extraCols.forEach(col => {
    col.w = col.width + 1; // padding
    wExtraTotal += col.w + 1; // plus border
  });

  const wIdx = 4 + 1;
  const wDate = 10 + 1;
  const remWidth = availableWidth - wIdx - wDate - 3 - wExtraTotal;
  
  const wFrom = Math.floor(remWidth * 0.3) + 1;
  const wSub = (remWidth - wFrom) + 1;

  let headerTop = `┌${'─'.repeat(wIdx)}┬${'─'.repeat(wDate)}┬${'─'.repeat(wFrom)}┬${'─'.repeat(wSub)}`;
  let headerMid = `│ ${pad('#', wIdx - 1)}│ ${pad('Date', wDate - 1)}│ ${pad('From', wFrom - 1)}│ ${pad('Subject', wSub - 1)}`;
  let headerBot = `├${'─'.repeat(wIdx)}┼${'─'.repeat(wDate)}┼${'─'.repeat(wFrom)}┼${'─'.repeat(wSub)}`;
  let footerBot = `└${'─'.repeat(wIdx)}┴${'─'.repeat(wDate)}┴${'─'.repeat(wFrom)}┴${'─'.repeat(wSub)}`;

  extraCols.forEach(col => {
    headerTop += `┬${'─'.repeat(col.w)}`;
    headerMid += `│ ${pad(col.name, col.w - 1)}`;
    headerBot += `┼${'─'.repeat(col.w)}`;
    footerBot += `┴${'─'.repeat(col.w)}`;
  });

  headerTop += '┐\n';
  headerMid += '│\n';
  headerBot += '┤\n';
  footerBot += '┘\n';

  let table = `${title}\n\n\`\`\`table\n`;
  table += headerTop + headerMid + headerBot;

  emails.forEach((msg, idx) => {
    const rawDate = msg.date || msg.envelope?.date;
    const date = rawDate ? new Date(rawDate).toISOString().split('T')[0] : '????-??-??';
    
    let fromRaw = msg.from;
    if (!fromRaw && msg.envelope?.from) {
        fromRaw = msg.envelope.from[0]?.name || msg.envelope.from[0]?.address;
    }
    const from = fromRaw || '(Unknown)';
    
    const subject = msg.subject || msg.envelope?.subject || '(No Subject)';
    
    let row = `│ ${pad(idx + 1, wIdx - 1)}│ ${pad(date, wDate - 1)}│ ${pad(truncate(from, wFrom - 1), wFrom - 1)}│ ${pad(truncate(subject, wSub - 1), wSub - 1)}`;
    
    extraCols.forEach(col => {
      const val = msg[col.key] || '';
      row += `│ ${pad(truncate(val, col.w - 1), col.w - 1)}`;
    });
    row += '│\n';
    
    table += row;
    
    if (idx < emails.length - 1) {
      table += headerBot;
    }
  });

  if (emails.length === 0) {
    table += `│ ${pad('No emails found', wIdx + wDate + wFrom + wSub + wExtraTotal - 1)}│\n`;
  }
  
  table += footerBot + `\`\`\``;
  return table;
};

module.exports = { formatEmailTable, truncate, pad };
