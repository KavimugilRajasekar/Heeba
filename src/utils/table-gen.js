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
  const availableWidth = titleWidth || Math.max(50, termWidth - 10);

  // Calculate column widths: # column + dynamic columns
  const wIdx = 4 + 1; // " # " column
  const wExtraTotal = columns.reduce((sum, col) => sum + col.width + 2, 0);
  const remWidth = availableWidth - wIdx - wExtraTotal - 4; // 4 for │ spacers

  // Distribute remaining width: 60% to first column, rest to implicit column
  const wMain = Math.floor(remWidth * 0.6);
  const wSecondary = remWidth - wMain;

  // Build header
  let headerTop = `┌${'─'.repeat(wIdx)}┬${'─'.repeat(wMain)}`;
  let headerMid = `│ ${pad('#', wIdx - 1)}│ ${pad(columns[0]?.name || 'Name', wMain - 1)}`;
  let headerBot = `├${'─'.repeat(wIdx)}┼${'─'.repeat(wMain)}`;

  // Additional columns
  for (let i = 1; i < columns.length; i++) {
    const col = columns[i];
    headerTop += `┬${'─'.repeat(col.width)}`;
    headerMid += `│ ${pad(col.name, col.width - 1)}`;
    headerBot += `┼${'─'.repeat(col.width)}`;
  }

  headerTop += '┐\n';
  headerMid += '│\n';
  headerBot += '┤\n';

  // Footer
  let footerBot = `└${'─'.repeat(wIdx)}┴${'─'.repeat(wMain)}`;
  for (let i = 1; i < columns.length; i++) {
    footerBot += `┴${'─'.repeat(columns[i].width)}`;
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
      rowStr += `│ ${pad(truncate(String(val), col.width - 1), col.width - 1)}`;
    }
    rowStr += '│\n';
    table += rowStr;

    if (idx < rows.length - 1) {
      // Row separator
      let sep = `├${'─'.repeat(wIdx)}┼${'─'.repeat(wMain)}`;
      for (let i = 1; i < columns.length; i++) {
        sep += `┼${'─'.repeat(columns[i].width)}`;
      }
      sep += '┤\n';
      table += sep;
    }
  });

  if (rows.length === 0) {
    const totalCols = 2 + columns.length - 1;
    const totalW = columns.reduce((s, c) => s + c.width, 0) + wIdx + wMain + 4;
    table += `│ ${pad('No data found', totalW - 1)}│\n`;
  }

  table += footerBot + `\`\`\``;
  return table;
}

module.exports = { formatGenericTable, truncate, pad };
