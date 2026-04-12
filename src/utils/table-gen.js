// src/utils/table-gen.js
// Unified generic table formatter producing ```table blocks for cross-interface rendering

const truncate = (str, len) => {
  if (!str) return '';
  return str.length > len ? str.substring(0, len - 2) + '..' : str;
};

const pad = (str, len) => {
  const s = String(str);
  return s + ' '.repeat(Math.max(0, len - s.length));
};

/**
 * Produces a generic boxed table in ```table markdown format.
 * Supported by: TUI (markdown-renderer), CLI (raw), Telegram (convertGenericTableToTelegram), Web (client-side parse)
 *
 * @param {Object} opts
 * @param {string} opts.title - Table title
 * @param {Array<{key: string, name: string, width: number}>} opts.columns - Column definitions
 * @param {Array<Object>} opts.rows - Row data objects
 * @param {Object} opts.context - Render context (for screen width)
 * @param {number} [opts.titleWidth] - Force title width
 * @returns {string} Markdown-wrapped table string
 */
function formatGenericTable({ title, columns, rows, context, titleWidth }) {
  const termWidth = context?.screen?.width || 80;
  const availableWidth = titleWidth || Math.max(40, termWidth - 8);

  // wIdx is for the row index column "#"
  const wIdx = 5; 
  
  // Calculate width already taken by secondary columns (index 1 to N)
  const wSecondaryTotal = columns.slice(1).reduce((sum, col) => sum + col.width + 2, 0);
  
  // Remaining width for the main column (index 0)
  // 4 for the outer │ and middle │ separators
  const remWidth = availableWidth - wIdx - wSecondaryTotal - 6;
  
  // Dynamic calculation for the main column width, min 10
  const wMain = Math.max(10, remWidth);

  // Build header
  let headerTop = `┌${'─'.repeat(Math.max(0, wIdx))}┬${'─'.repeat(Math.max(0, wMain))}`;
  let headerMid = `│ ${pad('#', wIdx - 1)}│ ${pad(columns[0]?.name || 'Name', wMain - 1)}`;
  let headerBot = `├${'─'.repeat(Math.max(0, wIdx))}┼${'─'.repeat(Math.max(0, wMain))}`;

  // Additional columns
  for (let i = 1; i < columns.length; i++) {
    const col = columns[i];
    const cw = Math.max(2, col.width);
    headerTop += `┬${'─'.repeat(cw)}`;
    headerMid += `│ ${pad(col.name, cw - 1)}`;
    headerBot += `┼${'─'.repeat(cw)}`;
  }

  headerTop += '┐\n';
  headerMid += '│\n';
  headerBot += '┤\n';

  // Footer
  let footerBot = `└${'─'.repeat(Math.max(0, wIdx))}┴${'─'.repeat(Math.max(0, wMain))}`;
  for (let i = 1; i < columns.length; i++) {
    footerBot += `┴${'─'.repeat(Math.max(2, columns[i].width))}`;
  }
  footerBot += '┘\n';

  let table = `${title}\n\n\`\`\`table\n`;
  table += headerTop + headerMid + headerBot;

  rows.forEach((row, idx) => {
    const mainVal = row[columns[0]?.key] || '';
    let rowStr = `│ ${pad(idx + 1, wIdx - 1)}│ ${pad(truncate(String(mainVal), wMain - 1), wMain - 1)}`;

    for (let i = 1; i < columns.length; i++) {
      const col = columns[i];
      const val = row[col.key] || '';
      const cw = Math.max(2, col.width);
      rowStr += `│ ${pad(truncate(String(val), cw - 1), cw - 1)}`;
    }
    rowStr += '│\n';
    table += rowStr;

    if (idx < rows.length - 1) {
      // Row separator
      let sep = `├${'─'.repeat(Math.max(0, wIdx))}┼${'─'.repeat(Math.max(0, wMain))}`;
      for (let i = 1; i < columns.length; i++) {
        sep += `┼${'─'.repeat(Math.max(2, columns[i].width))}`;
      }
      sep += '┤\n';
      table += sep;
    }
  });

  if (rows.length === 0) {
    // Calculate total interior width for "No data found"
    let totalW = wIdx + wMain + 2;
    for (let i = 1; i < columns.length; i++) {
      totalW += Math.max(2, columns[i].width) + 1;
    }
    table += `│ ${pad('No data found', totalW - 1)}│\n`;
  }

  table += footerBot + `\`\`\``;
  return table;
}


module.exports = { formatGenericTable, truncate, pad };
