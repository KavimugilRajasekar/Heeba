// src/core/browser/cleaner.js
// Browser singleton management and cleanup for application exit

const { BrowserManager } = require('./manager');

let browserManager = null;

function getBrowserManager(options = {}) {
  if (!browserManager) {
    // Pull browserVisible from global state if not explicitly passed
    const { state } = require('../state-manager');
    const finalOptions = {
      headless: true,
      visible: false,
      ...options,
      visible: options.visible !== undefined ? options.visible : (state.browserVisible || false)
    };
    browserManager = new BrowserManager(finalOptions);
  }
  return browserManager;
}

async function closeBrowser() {
  if (browserManager && browserManager.isRunning()) {
    await browserManager.close();
  }
}

module.exports = { getBrowserManager, closeBrowser };
