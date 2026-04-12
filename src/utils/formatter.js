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
      .replace(/>/g, '&gt;');

    // Map ANSI colors to CSS
    const colors = {
      '33': '#e5c07b', // Yellow
      '36': '#56b6c2', // Cyan
      '32': '#98c379', // Green
      '31': '#e06c75', // Red
      '35': '#c678dd', // Magenta
      '34': '#61afef', // Blue
      '90': '#666666', // Gray
      '37': '#ffffff'  // White
    };

    // Replace colors
    for (const [code, hex] of Object.entries(colors)) {
      const regex = new RegExp(`\\x1b\\[${code}m`, 'g');
      html = html.replace(regex, `<span style="color: ${hex}">`);
    }

    // Bold
    html = html.replace(/\x1b\[1m/g, '<strong>');

    // Reset (close all tags)
    // We count how many <span> and <strong> we opened
    html = html.replace(/\x1b\[0m/g, (match, offset, full) => {
        return '</strong></span></span></span></span></span></span></span>'; // Safe closure
    });

    return html.replace(/\n/g, '<br>');
  },

  /**
   * Clean string for Telegram (MarkdownV2 or Plain)
   */
  toTelegram: (str) => {
    if (!str) return '';
    // Telegram handles tree characters fine in plain text, just strip ANSI
    return Formatter.toPlain(str);
  }
};

module.exports = Formatter;
