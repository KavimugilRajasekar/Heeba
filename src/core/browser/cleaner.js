// src/core/browser/cleaner.js
// Browser singleton management and cleanup for application exit

const { BrowserManager } = require('./manager');

let browserManager = null;

function getBrowserManager(options = {}) {
  if (!browserManager) {
    browserManager = new BrowserManager(options);
  }
  return browserManager;
}

async function closeBrowser() {
  if (browserManager && browserManager.isRunning()) {
    await browserManager.close();
  }
}

module.exports = { getBrowserManager, closeBrowser };
