// src/core/browser/manager.js
// Browser singleton using Playwright — manages one browser instance per session

const { chromium, firefox, webkit } = require('playwright');

const BROWSER_TYPES = { chromium, firefox, webkit };

const DEFAULT_OPTIONS = {
  browserType: 'chromium',
  headless: true,
  visible: false,
  timeout: 30000,
};

/**
 * Generate a stable CSS selector for a DOM element
 */
function generateSelector(element) {
  if (element.id) return `#${element.id}`;

  const parts = [];
  let current = element;

  while (current && current !== document.body && parts.length < 5) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector = `#${current.id}`;
      parts.unshift(selector);
      break;
    }

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(c => c);
      if (classes.length > 0) {
        selector += '.' + classes.slice(0, 2).join('.');
      }
    }

    // Add nth-child index if needed to disambiguate
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(' > ') || 'body';
}

class BrowserManager {
  constructor(options = {}) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._browser = null;
    this._context = null;
    this._pages = [];
    this._activePageIndex = 0;
    this._launched = false;
  }

  /**
   * Launch the browser if not already running (idempotent)
   */
  async launch() {
    if (this._launched && this._browser) return;

    const browserType = BROWSER_TYPES[this._options.browserType];
    if (!browserType) {
      throw new Error(`Unknown browser type: ${this._options.browserType}. Use chromium, firefox, or webkit.`);
    }

    const launchOptions = {
      headless: this._options.headless,
      timeout: this._options.timeout,
    };

    // Platform-specific args
    if (this._options.browserType === 'chromium') {
      launchOptions.args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
      ];
      if (this._options.visible) {
        launchOptions.headless = false;
      }
    } else if (this._options.browserType === 'firefox') {
      launchOptions.args = ['--no-sandbox'];
      if (this._options.visible) {
        launchOptions.headless = false;
      }
    } else if (this._options.browserType === 'webkit') {
      launchOptions.args = ['--no-sandbox'];
      if (this._options.visible) {
        launchOptions.headless = false;
      }
    }

    this._browser = await browserType.launch(launchOptions);

    // Create a persistent context (cookies/localStorage survive across pages)
    this._context = await this._browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.37 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ignoreHTTPSErrors: true,
    });

    // Create initial page
    const page = await this._context.newPage();
    this._pages.push(page);
    this._activePageIndex = 0;

    this._launched = true;
  }

  /**
   * Close the browser and clean up
   */
  async close() {
    if (this._browser) {
      try {
        if (this._context) await this._context.close();
        await this._browser.close();
      } catch (e) {
        // Ignore close errors
      }
      this._browser = null;
      this._context = null;
      this._pages = [];
      this._activePageIndex = 0;
      this._launched = false;
    }
  }

  /**
   * Check if browser is currently running
   */
  isRunning() {
    return this._launched && this._browser !== null;
  }

  /**
   * Get the currently active page
   */
  getActivePage() {
    if (this._pages.length === 0) {
      throw new Error('No pages open. Call launch() first.');
    }
    return this._pages[this._activePageIndex];
  }

  /**
   * Create a new page/tab and set it as active
   */
  async newPage() {
    if (!this._context) throw new Error('Browser not launched');
    const page = await this._context.newPage();
    this._pages.push(page);
    this._activePageIndex = this._pages.length - 1;
    return page;
  }

  /**
   * Set a page as the active page by index
   */
  setActivePage(index) {
    if (index < 0 || index >= this._pages.length) {
      throw new Error(`Invalid page index: ${index}. Open pages: ${this._pages.length}`);
    }
    this._activePageIndex = index;
  }

  /**
   * Get count of open pages
   */
  getPageCount() {
    return this._pages.length;
  }

  /**
   * Close a page by index
   */
  async closePage(index = this._activePageIndex) {
    if (index < 0 || index >= this._pages.length) return;
    const page = this._pages[index];
    await page.close();
    this._pages.splice(index, 1);
    if (this._activePageIndex >= this._pages.length) {
      this._activePageIndex = Math.max(0, this._pages.length - 1);
    }
  }

  /**
   * Wait for page to finish loading
   */
  async waitForLoad(page, timeout = 15000) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout });
      await page.waitForTimeout(300); // Let JS settle
    } catch (e) {
      // Ignore timeout — proceed anyway
    }
  }

  /**
   * Capture full page state for LLM context
   */
  async getState(page = null) {
    const targetPage = page || this.getActivePage();

    const url = targetPage.url();
    let title = '';
    let visibleText = '';
    let elements = [];
    let forms = [];
    let errorMessage = null;
    let isLoginRequired = false;
    let loginHint = null;

    try {
      title = await targetPage.title();
    } catch (e) {}

    try {
      // Get visible text from body
      visibleText = await targetPage.evaluate(() => {
        const body = document.body;
        if (!body) return '';
        const clone = body.cloneNode(true);
        // Remove script, style, and hidden elements
        const toRemove = clone.querySelectorAll('script, style, noscript, iframe, svg, canvas');
        toRemove.forEach(el => el.remove());
        return clone.textContent.replace(/\s+/g, ' ').trim().substring(0, 4000);
      });
    } catch (e) {}

    try {
      // Get interactive elements
      elements = await targetPage.evaluate(() => {
        const interactive = ['a', 'button', 'input', 'select', 'textarea', 'label[for]', '[onclick]', '[role="button"]'];
        const selectors = interactive.join(',');
        const els = Array.from(document.querySelectorAll(selectors));
        return els
          .filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight;
          })
          .slice(0, 100) // Limit to 100 elements
          .map(el => {
            let selector = '';
            try { selector = generateSelector(el); } catch (e) { selector = el.tagName.toLowerCase(); }
            return {
              selector,
              tag: el.tagName.toLowerCase(),
              text: (el.textContent || '').trim().substring(0, 80),
              href: el.href || (el instanceof HTMLAnchorElement ? el.getAttribute('href') : null) || null,
              type: el.type || null,
              value: (el.value !== undefined && el.value !== null) ? String(el.value).substring(0, 100) : null,
              rect: (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()
            };
          });
      });
    } catch (e) {}

    try {
      // Get form fields
      forms = await targetPage.evaluate(() => {
        return Array.from(document.forms).map((form, fi) => ({
          selector: `form:nth-of-type(${fi + 1})`,
          fields: Array.from(form.elements)
            .filter(el => !el.disabled && el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'reset' && el.type !== 'button')
            .slice(0, 50)
            .map(el => {
              let sel = '';
              try { sel = generateSelector(el); } catch (e) { sel = el.name || el.id || el.tagName.toLowerCase(); }
              return {
                selector: sel,
                name: el.name || null,
                value: (el.value || '').substring(0, 200),
                type: el.type || el.tagName.toLowerCase(),
                placeholder: el.placeholder || null,
              };
            })
        }));
      });
    } catch (e) {}

    try {
      // Check for error/alert messages
      errorMessage = await targetPage.evaluate(() => {
        const alerts = document.querySelectorAll('[role="alert"], .alert, .error, .message-error, [aria-live="assertive"]');
        for (const alert of alerts) {
          const text = alert.textContent.trim();
          if (text.length > 0) return text.substring(0, 300);
        }
        // Check for toast notifications
        const toasts = document.querySelectorAll('.toast, .notification, .snackbar');
        for (const toast of toasts) {
          const text = toast.textContent.trim();
          if (text.length > 0) return text.substring(0, 300);
        }
        return null;
      });
    } catch (e) {}

    // Detect login state for common sites
    const hostname = new URL(url).hostname;
    isLoginRequired = false;
    loginHint = null;

    try {
      if (hostname.includes('whatsapp')) {
        const hasQR = await targetPage.$('[data-testid="qr-code"], canvas') !== null;
        const hasSearch = await targetPage.$('[data-testid="chat-list-search"], #main > div:nth-child(2)') !== null;
        if (hasQR || !hasSearch) {
          isLoginRequired = true;
          loginHint = 'WhatsApp Web requires QR code scan. Use the -browser True flag to show the browser window, then scan the QR code, then retry.';
        }
      } else if (hostname.includes('google') && hostname.includes('mail')) {
        const hasEmailInput = await targetPage.$('#identifierId, input[type="email"][name="identifier"]') !== null;
        if (hasEmailInput) {
          isLoginRequired = true;
          loginHint = 'Gmail requires login. Use the -browser True flag to show the browser window, go to mail.google.com, sign in manually, then retry.';
        }
      } else if (hostname.includes('twitter') || hostname.includes('x.com')) {
        const hasLoginForm = await targetPage.$('[data-testid="login"], [href="/login"]') !== null;
        if (hasLoginForm) {
          isLoginRequired = true;
          loginHint = 'Twitter/X requires login. Use the -browser True flag to show the browser window, sign in manually, then retry.';
        }
      } else if (hostname.includes('instagram')) {
        const hasLoginForm = await targetPage.$('form[action*="login"], input[name="username"]') !== null;
        if (hasLoginForm) {
          isLoginRequired = true;
          loginHint = 'Instagram requires login. Use the -browser True flag to show the browser window, sign in manually, then retry.';
        }
      } else {
        // Generic login detection: check for email + password inputs
        const hasEmailInput = await targetPage.$('input[type="email"], input[name="email"], input[name="username"]') !== null;
        const hasPasswordInput = await targetPage.$('input[type="password"]') !== null;
        if (hasEmailInput && hasPasswordInput) {
          isLoginRequired = true;
          loginHint = 'This site requires login. Use the -browser True flag to show the browser window, navigate manually, sign in, then retry.';
        }
      }
    } catch (e) {}

    return {
      url,
      title,
      visibleText,
      elements,
      forms,
      errorMessage,
      isLoginRequired,
      loginHint,
      pageCount: this._pages.length,
      activePageIndex: this._activePageIndex,
    };
  }

  /**
   * Navigate to a URL
   */
  async navigate(url, page = null) {
    const targetPage = page || this.getActivePage();
    await targetPage.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.waitForLoad(targetPage);
    return this.getState(targetPage);
  }

  /**
   * Click an element by selector
   */
  async click(selector, page = null) {
    const targetPage = page || this.getActivePage();
    await targetPage.click(selector, { timeout: 10000 });
    await targetPage.waitForTimeout(500);
    await this.waitForLoad(targetPage);
    return this.getState(targetPage);
  }

  /**
   * Type into an element by selector
   */
  async type(selector, value, page = null) {
    const targetPage = page || this.getActivePage();
    await targetPage.fill(selector, value);
    await targetPage.waitForTimeout(200);
    return this.getState(targetPage);
  }

  /**
   * Select option in dropdown
   */
  async selectOption(selector, value, page = null) {
    const targetPage = page || this.getActivePage();
    await targetPage.selectOption(selector, value);
    await targetPage.waitForTimeout(200);
    return this.getState(targetPage);
  }

  /**
   * Scroll page or element
   */
  async scroll(direction = 'down', amount = 500, selector = null, page = null) {
    const targetPage = page || this.getActivePage();
    if (selector) {
      await targetPage.evaluate((sel, dir, amt) => {
        const el = document.querySelector(sel);
        if (el) el.scrollBy(0, dir === 'up' ? -amt : amt);
        else window.scrollBy(0, dir === 'up' ? -amt : amt);
      }, selector, direction, amount);
    } else {
      await targetPage.evaluate((dir, amt) => {
        window.scrollBy(0, dir === 'up' ? -amt : amt);
      }, direction, amount);
    }
    await targetPage.waitForTimeout(300);
    return this.getState(targetPage);
  }

  /**
   * Take a screenshot
   */
  async screenshot(path = null, page = null) {
    const targetPage = page || this.getActivePage();
    if (path) {
      await targetPage.screenshot({ path, fullPage: false });
      return path;
    } else {
      const buffer = await targetPage.screenshot({ fullPage: false });
      return buffer.toString('base64');
    }
  }

  /**
   * Go back in browser history
   */
  async goBack(page = null) {
    const targetPage = page || this.getActivePage();
    await targetPage.goBack();
    await this.waitForLoad(targetPage);
    return this.getState(targetPage);
  }

  /**
   * Go forward in browser history
   */
  async goForward(page = null) {
    const targetPage = page || this.getActivePage();
    await targetPage.goForward();
    await this.waitForLoad(targetPage);
    return this.getState(targetPage);
  }

  /**
   * Reload the current page
   */
  async reload(page = null) {
    const targetPage = page || this.getActivePage();
    await targetPage.reload();
    await this.waitForLoad(targetPage);
    return this.getState(targetPage);
  }
}

module.exports = { BrowserManager };
