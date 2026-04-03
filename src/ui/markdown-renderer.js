// src/ui/markdown-renderer.js
// Converts Markdown text into blessed-compatible tagged strings for terminal rendering

const { C } = require('./theme');

/**
 * Render markdown text into an array of { content, fg, bold } line objects.
 * Each object represents one visual line in the terminal.
 * 
 * Supports: Headings, bullet/numbered lists, code blocks, blockquotes, bold, inline code, horizontal rules.
 */
function renderMarkdown(text, termWidth) {
  if (!text || typeof text !== 'string') return [];

  const width = termWidth || 80;
  const contentWidth = Math.max(40, width - 6); // Leave padding on both sides
  const lines = text.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeBlockLang = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // ── Code Block Toggle ──
    if (raw.trimStart().startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = raw.trimStart().slice(3).trim();
        const isTable = codeBlockLang === 'table';
        
        // Code block header (only if not a table)
        if (!isTable) {
          result.push({
            content: `  ┌${'─'.repeat(Math.min(contentWidth - 2, 60))}${codeBlockLang ? ' ' + codeBlockLang + ' ' : ''}`,
            fg: C.border,
            bold: false,
            type: 'code-border'
          });
        }
      } else {
        const isTable = codeBlockLang === 'table';
        inCodeBlock = false;
        
        if (!isTable) {
          result.push({
            content: `  └${'─'.repeat(Math.min(contentWidth - 2, 60))}`,
            fg: C.border,
            bold: false,
            type: 'code-border'
          });
        }
        codeBlockLang = '';
      }
      continue;
    }

    // ── Inside Code Block ──
    if (inCodeBlock) {
      const isTable = codeBlockLang === 'table';
      result.push({
        content: isTable ? `  ${raw}` : `  │ ${raw}`,
        fg: C.cyan,
        bold: false,
        type: 'code'
      });
      continue;
    }

    const trimmed = raw.trim();

    // ── Empty Line ──
    if (trimmed === '') {
      result.push({ content: '', fg: C.fg, bold: false, type: 'blank' });
      continue;
    }

    // ── Horizontal Rule ──
    if (/^[-*_]{3,}$/.test(trimmed)) {
      result.push({
        content: `  ${'─'.repeat(Math.min(contentWidth, 50))}`,
        fg: C.border,
        bold: false,
        type: 'hr'
      });
      continue;
    }

    // ── Headings ──
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const prefix = level === 1 ? '◆ ' : level === 2 ? '◇ ' : '▸ ';
      const color = level === 1 ? C.green : level === 2 ? C.cyan : C.purple;
      result.push({ content: '', fg: C.fg, bold: false, type: 'blank' });
      result.push({
        content: `  ${prefix}${headingText}`,
        fg: color,
        bold: true,
        type: 'heading'
      });
      if (level <= 2) {
        result.push({
          content: `  ${'─'.repeat(Math.min(headingText.length + 4, contentWidth))}`,
          fg: C.border,
          bold: false,
          type: 'heading-underline'
        });
      }
      continue;
    }

    // ── Blockquote ──
    if (trimmed.startsWith('>')) {
      const quoteText = trimmed.replace(/^>\s*/, '');
      const wrapped = wrapText(quoteText, contentWidth - 6);
      wrapped.forEach(wl => {
        result.push({
          content: `  │ ${wl}`,
          fg: C.dim,
          bold: false,
          type: 'quote'
        });
      });
      continue;
    }

    // ── Unordered List ──
    const ulMatch = trimmed.match(/^[-*+]\s+(.+)/);
    if (ulMatch) {
      const itemText = processInlineFormatting(ulMatch[1]);
      const indent = raw.search(/\S/);
      const bulletIndent = Math.floor(indent / 2);
      const prefix = '  ' + '  '.repeat(bulletIndent) + '• ';
      const wrapped = wrapText(itemText, contentWidth - prefix.length);
      wrapped.forEach((wl, idx) => {
        result.push({
          content: idx === 0 ? `${prefix}${wl}` : `${'  '.repeat(bulletIndent + 2)}${wl}`,
          fg: C.fg,
          bold: false,
          type: 'list'
        });
      });
      continue;
    }

    // ── Ordered List ──
    const olMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (olMatch) {
      const num = olMatch[1];
      const itemText = processInlineFormatting(olMatch[2]);
      const prefix = `  ${num}. `;
      const wrapped = wrapText(itemText, contentWidth - prefix.length);
      wrapped.forEach((wl, idx) => {
        result.push({
          content: idx === 0 ? `${prefix}${wl}` : `      ${wl}`,
          fg: C.fg,
          bold: false,
          type: 'list'
        });
      });
      continue;
    }

    // ── Regular Paragraph ──
    const processed = processInlineFormatting(trimmed);
    const wrapped = wrapText(processed, contentWidth);
    wrapped.forEach(wl => {
      result.push({
        content: `  ${wl}`,
        fg: C.fg,
        bold: false,
        type: 'paragraph'
      });
    });
  }

  return result;
}

/**
 * Process inline formatting: bold, inline code
 * Returns plain text with visual markers (blessed tags not used here since
 * we render each line as a single blessed.text element with one fg color).
 * We use Unicode substitutions for emphasis.
 */
function processInlineFormatting(text) {
  // Replace inline code with visually distinct markers
  text = text.replace(/`([^`]+)`/g, '‹$1›');
  // Remove bold markers (we can't do per-character coloring in a single blessed.text)
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/__([^_]+)__/g, '$1');
  // Remove italic markers
  text = text.replace(/\*([^*]+)\*/g, '$1');
  text = text.replace(/_([^_]+)_/g, '$1');
  return text;
}

/**
 * Word-wrap text to fit within maxWidth columns.
 */
function wrapText(text, maxWidth) {
  if (!text) return [''];
  if (text.length <= maxWidth) return [text];

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [''];
}

module.exports = { renderMarkdown, wrapText };
