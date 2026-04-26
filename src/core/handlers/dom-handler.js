// src/core/handlers/dom-handler.js
// DOM action handlers wrapping BrowserManager for the intent-executor command map

const { getBrowserManager } = require('../browser/cleaner');
const { state } = require('../state-manager');

function getBM() {
  return getBrowserManager({ visible: state.browserVisible || false });
}

const domHandlers = {
  // Launch browser (idempotent)
  browser_launch: async (params, context) => {
    try {
      const bm = getBrowserManager({
        browserType: params.browserType || 'chromium',
        headless: params.headless !== false,
        visible: params.visible !== undefined ? params.visible : (state.browserVisible || false)
      });
      await bm.launch();
      return { success: true, message: 'Browser launched successfully.' };
    } catch (err) {
      return { success: false, message: `Failed to launch browser: ${err.message}` };
    }
  },

  // Navigate to URL
  browser_navigate: async (params, context) => {
    const { url } = params;
    if (!url) return { success: false, message: 'No URL provided.' };
    try {
      const bm = getBM();
      const pageState = await bm.navigate(url);
      return { success: true, message: `Navigated to ${url}`, state: pageState };
    } catch (err) {
      return { success: false, message: `Navigation failed: ${err.message}` };
    }
  },

  // Click element by selector
  browser_click: async (params, context) => {
    const { selector } = params;
    if (!selector) return { success: false, message: 'No selector provided.' };
    try {
      const bm = getBM();
      const pageState = await bm.click(selector);
      return { success: true, message: `Clicked element: ${selector}`, state: pageState };
    } catch (err) {
      return { success: false, message: `Click failed: ${err.message}` };
    }
  },

  // Type text into element
  browser_type: async (params, context) => {
    const { selector, value } = params;
    if (!selector) return { success: false, message: 'No selector provided.' };
    if (value === undefined) return { success: false, message: 'No value provided.' };
    try {
      const bm = getBM();
      const pageState = await bm.type(selector, value);
      return { success: true, message: `Typed into: ${selector}`, state: pageState };
    } catch (err) {
      return { success: false, message: `Type failed: ${err.message}` };
    }
  },

  // Select dropdown option
  browser_select: async (params, context) => {
    const { selector, value } = params;
    if (!selector) return { success: false, message: 'No selector provided.' };
    if (!value) return { success: false, message: 'No option value provided.' };
    try {
      const bm = getBM();
      const pageState = await bm.selectOption(selector, value);
      return { success: true, message: `Selected option in: ${selector}`, state: pageState };
    } catch (err) {
      return { success: false, message: `Select failed: ${err.message}` };
    }
  },

  // Scroll page or element
  browser_scroll: async (params, context) => {
    const { direction = 'down', amount = 500, selector } = params;
    try {
      const bm = getBM();
      const pageState = await bm.scroll(direction, amount, selector);
      return { success: true, message: `Scrolled ${direction}`, state: pageState };
    } catch (err) {
      return { success: false, message: `Scroll failed: ${err.message}` };
    }
  },

  // Take screenshot
  browser_screenshot: async (params, context) => {
    const { path: screenshotPath } = params;
    try {
      const bm = getBM();
      const result = await bm.screenshot(screenshotPath);
      if (screenshotPath) {
        return { success: true, message: `Screenshot saved to ${result}` };
      }
      return { success: true, message: 'Screenshot captured', screenshot: result };
    } catch (err) {
      return { success: false, message: `Screenshot failed: ${err.message}` };
    }
  },

  // Get current page state (DOM snapshot)
  browser_get_state: async (params, context) => {
    try {
      const bm = getBM();
      const pageState = await bm.getState();
      return { success: true, message: 'Page state retrieved', state: pageState };
    } catch (err) {
      return { success: false, message: `Get state failed: ${err.message}` };
    }
  },

  // Go back in history
  browser_back: async (params, context) => {
    try {
      const bm = getBM();
      const pageState = await bm.goBack();
      return { success: true, message: 'Navigated back', state: pageState };
    } catch (err) {
      return { success: false, message: `Go back failed: ${err.message}` };
    }
  },

  // Go forward in history
  browser_forward: async (params, context) => {
    try {
      const bm = getBM();
      const pageState = await bm.goForward();
      return { success: true, message: `Navigated forward`, state: pageState };
    } catch (err) {
      return { success: false, message: `Go forward failed: ${err.message}` };
    }
  },

  // Reload current page
  browser_reload: async (params, context) => {
    try {
      const bm = getBM();
      const pageState = await bm.reload();
      return { success: true, message: 'Page reloaded', state: pageState };
    } catch (err) {
      return { success: false, message: `Reload failed: ${err.message}` };
    }
  },

  // Open new tab
  browser_new_tab: async (params, context) => {
    try {
      const bm = getBM();
      await bm.newPage();
      return { success: true, message: `New tab opened (${bm.getPageCount()} total tabs)`, pageIndex: bm.getPageCount() - 1 };
    } catch (err) {
      return { success: false, message: `New tab failed: ${err.message}` };
    }
  },

  // Switch active tab by index
  browser_switch_tab: async (params, context) => {
    const { index } = params;
    if (index === undefined) return { success: false, message: 'No tab index provided.' };
    try {
      const bm = getBM();
      bm.setActivePage(index);
      const pageState = await bm.getState();
      return { success: true, message: `Switched to tab ${index}`, state: pageState };
    } catch (err) {
      return { success: false, message: `Switch tab failed: ${err.message}` };
    }
  },

  // Close current or specified tab
  browser_close_tab: async (params, context) => {
    const { index } = params;
    try {
      const bm = getBM();
      await bm.closePage(index !== undefined ? index : bm._activePageIndex);
      return { success: true, message: `Tab closed (${bm.getPageCount()} tabs remaining)` };
    } catch (err) {
      return { success: false, message: `Close tab failed: ${err.message}` };
    }
  },

  // Close browser
  browser_close: async (params, context) => {
    try {
      const { closeBrowser } = require('../browser/cleaner');
      await closeBrowser();
      return { success: true, message: 'Browser closed.' };
    } catch (err) {
      return { success: false, message: `Close browser failed: ${err.message}` };
    }
  }
};

module.exports = domHandlers;
