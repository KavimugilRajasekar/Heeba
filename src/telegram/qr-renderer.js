// src/telegram/qr-renderer.js
const qrcode = require('qrcode-terminal');

/**
 * Renders a QR code in the terminal for a given URL.
 * @param {string} url - The URL to encode.
 */
function renderQRCode(url) {
  console.log(`\n\x1b[36m◈ Scan this QR code to open the Heeba Telegram Bot:\x1b[0m`);
  console.log(`\x1b[90mLink: ${url}\x1b[0m\n`);
  
  qrcode.generate(url, { small: true });
}

module.exports = { renderQRCode };
