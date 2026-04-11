// src/utils/formatter.js
/**
 * Universal Formatter for Heeba
 * Handles conversion of ANSI/Blessed tags to platform-specific formats.
 */

const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const BLESSED_TAG_REGEX = /\{(\/|[a-z0-9#-]+(?:-fg|-bg|))\}|{bold}|{dim}/g;

const Formatter = {
  /**
   * Strip all ANSI and Blessed tags to return plain text
   */
  toPlain: (str) => {
    if (!str) return '';
    return str
      .replace(ANSI_REGEX, '')
      .replace(BLESSED_TAG_REGEX, '');
  },

  /**
   * Convert ANSI escape codes to Blessed tags (for TUI)
   */
  ansiToBlessed: (str) => {
    if (!str) return '';
    return str
      .replace(/\x1b\[33m/g, '{yellow-fg}')
      .replace(/\x1b\[36m/g, '{cyan-fg}')
      .replace(/\x1b\[32m/g, '{green-fg}')
      .replace(/\x1b\[31m/g, '{red-fg}')
      .replace(/\x1b\[35m/g, '{magenta-fg}')
      .replace(/\x1b\[34m/g, '{blue-fg}')
      .replace(/\x1b\[90m/g, '{#666666-fg}')
      .replace(/\x1b\[37m/g, '{white-fg}')
      .replace(/\x1b\[1m/g, '{bold}')
      .replace(/\x1b\[0m/g, '{/}');
  },

  /**
   * Convert ANSI to HTML for Web Interface
   */
  toHtml: (str) => {
    if (!str) return '';
    let html = str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\x1b\[33m/g, '<span style="color: #e5c07b">') // Yellow/Gold
      .replace(/\x1b\[36m/g, '<span style="color: #56b6c2">') // Cyan
      .replace(/\x1b\[32m/g, '<span style="color: #98c379">') // Green
      .replace(/\x1b\[31m/g, '<span style="color: #e06c75">') // Red
      .replace(/\x1b\[35m/g, '<span style="color: #c678dd">') // Magenta
      .replace(/\x1b\[34m/g, '<span style="color: #61afef">') // Blue
      .replace(/\x1b\[90m/g, '<span style="color: #666666">') // Gray
      .replace(/\x1b\[1m/g, '<strong>')
      .replace(/\x1b\[0m/g, '</span></strong></span></span></span></span></span></span></span>')
      .replace(/\n/g, '<br>');
    return html;
  },

  /**
   * Clean string for Telegram (MarkdownV2 or Plain)
   */
  toTelegram: (str) => {
    if (!str) return '';
    // Telegram is best served by stripping ANSI and using standard Markdown
    return Formatter.toPlain(str);
  }
};

module.exports = Formatter;
