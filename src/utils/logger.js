// src/utils/logger.js
const fs = require('fs');
const path = require('path');

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLevel = LOG_LEVELS.DEBUG;

const logDir = path.join(process.cwd(), 'logs');
const logFile = path.join(logDir, `heeba-${new Date().toISOString().split('T')[0]}.log`);

function ensureLogDir() {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

function formatTimestamp() {
  const now = new Date();
  return now.toISOString().split('T')[0] + ' ' +
         now.toTimeString().split(' ')[0] + '.' +
         String(now.getMilliseconds()).padStart(3, '0');
}

function formatMessage(level, category, ...args) {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${level}] [${category}]`;
  const message = args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack}`;
    }
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  return `${prefix} ${message}`;
}

function writeToFile(formatted) {
  try {
    ensureLogDir();
    fs.appendFileSync(logFile, formatted + '\n', 'utf8');
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
}

const logger = {
  debug(category, ...args) {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      const msg = formatMessage('DEBUG', category, ...args);
      writeToFile(msg);
    }
  },

  info(category, ...args) {
    if (currentLevel <= LOG_LEVELS.INFO) {
      const msg = formatMessage('INFO', category, ...args);
      writeToFile(msg);
    }
  },

  warn(category, ...args) {
    if (currentLevel <= LOG_LEVELS.WARN) {
      const msg = formatMessage('WARN', category, ...args);
      writeToFile(msg);
    }
  },

  error(category, ...args) {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      const msg = formatMessage('ERROR', category, ...args);
      writeToFile(msg);
    }
  },

  // Specific helpers for common categories
  ui(...args) { this.debug('UI', ...args); },
  engine(...args) { this.debug('ENGINE', ...args); },
  keyboard(...args) { this.debug('KEYBOARD', ...args); },
  mode(...args) { this.debug('MODE', ...args); },
  command(...args) { this.debug('COMMAND', ...args); }
};

module.exports = logger;
