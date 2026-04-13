// src/ui/markdown-renderer.js
// Converts Markdown text into blessed-compatible tagged strings for terminal rendering

const { C } = require('./theme');

/**
 * ANSI to Blessed tag mapping for standard colors
 */
const ANSI_TAGS = {
  '\x1b[35m': '{magenta-fg}',
  '\x1b[36m': '{cyan-fg}',
  '\x1b[32m': '{green-fg}',
  '\x1b[33m': '{yellow-fg}',
  '\x1b[90m': '{#5c5c66-fg}',
  '\x1b[0m': '{/}'
};

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

/**
 * Detect the continuation prefix for a tree line to maintain visual alignment during wrapping.
 * E.g., " ├─ " becomes " │  ", " └─ " becomes "    "
 */
function getContinuationPrefix(line) {
  const match = line.match(/^(\s*[│├└]─*\s*)/);
  if (!match) return '  '; // Default paragraph indent
  
  return match[1]
    .replace(/[├└]/g, (m) => m === '├' ? '│' : ' ')
    .replace(/─/g, ' ');
}

/**
 * Render markdown text into an array of { content, fg, bold } line objects.
 * Each object represents one visual line in the terminal.
 * 
 * Supports: Headings, bullet/numbered lists, code blocks, blockquotes, bold, inline code, horizontal rules.
 */
function renderMarkdown(text, termWidth, tags = true) {
  if (!text || typeof text !== 'string') return [];

  const width = termWidth || 80;
  const contentWidth = Math.max(40, width - 6); // Leave padding on both sides
  const lines = text.split('\n');
  const result = [];
  let inCodeBlock = false;
  let codeBlockLang = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // ── ANSI Escape Detection (Scientific/Tree Reports) ──
    if (ANSI_REGEX.test(raw)) {
      let content = raw;
      // Convert ANSI escapes to Blessed tags (for blessed rendering)
      // When tags=false (CLI mode), leave ANSI escapes as-is
      if (tags) {
        content = content.replace(ANSI_REGEX, (match) => ANSI_TAGS[match] || '');
      }

      const contPrefix = getContinuationPrefix(raw.replace(ANSI_REGEX, ''));
      const wrapped = wrapText(content, width - 2, contPrefix);

      wrapped.forEach(wl => {
        result.push({
          content: wl,
          fg: C.fg,
          bold: false,
          tags: true,
          type: 'raw'
        });
      });
      continue;
    }

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
      let content = isTable ? `  ${raw}` : `  │ ${raw}`;
      
      if (isTable) {
        // Tag structural characters with ultraDark color for faint borders
        // Characters: ┌ ┐ └ ┘ ─ ┬ ┴ ┼ ├ ┤ │
        const boxChars = /[┌┐└┘─┬┴┼├┤│]/g;
        content = content.replace(boxChars, (match) => `{#1a1a1a-fg}${match}{/}`);
      }

      result.push({
        content: content,
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
    const contPrefix = getContinuationPrefix(raw);
    const wrapped = wrapText(processed, contentWidth, contPrefix === '  ' ? '  ' : contPrefix);
    
    wrapped.forEach((wl, idx) => {
      result.push({
        content: idx === 0 ? `  ${wl}` : wl,
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
  // If text already has blessed tags, return as-is
  if (text.includes('{') && text.includes('}')) return text;

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
 * Supports a continuationPrefix for hierarchical indentation (e.g. tree lines).
 */
function wrapText(text, maxWidth, continuationPrefix = '') {
  if (!text) return [''];
  if (text.length <= maxWidth) return [text];

  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length === 0) {
      currentLine = word;
    } else {
      const lineLen = currentLine.length + 1 + word.length;
      if (lineLen <= maxWidth) {
        currentLine += ' ' + word;
      } else {
        lines.push(currentLine);
        currentLine = continuationPrefix + word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines.length > 0 ? lines : [''];
}

module.exports = { renderMarkdown, wrapText };
