// src/email/automation/utils/cache.js
const fs = require('fs');
const path = require('path');
const { CACHE_DIR } = require('../../../utils/paths');

const getCachePath = (dateStr) => path.join(CACHE_DIR, `${dateStr}.json`);

/**
 * Saves emails to date-keyed cache file
 */
function saveToCache(dateStr, emails) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(getCachePath(dateStr), JSON.stringify(emails, null, 2));
  } catch (e) {
    // silent fail
  }
}

/**
 * Retrieves emails from date-keyed cache
 * @returns {Array|null} Cached emails or null if not found
 */
function getFromCache(dateStr) {
  const p = getCachePath(dateStr);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * Gets cache path for a date
 */
function getCachePathForDate(dateStr) {
  return getCachePath(dateStr);
}

/**
 * Lists all cached dates
 * @returns {string[]} Array of date strings (YYYY-MM-DD)
 */
function listCachedDates() {
  if (!fs.existsSync(CACHE_DIR)) return [];
  try {
    return fs.readdirSync(CACHE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''))
      .sort();
  } catch (e) {
    return [];
  }
}

/**
 * Clears cache for a specific date
 */
function clearCache(dateStr) {
  const p = getCachePath(dateStr);
  if (fs.existsSync(p)) {
    try {
      fs.unlinkSync(p);
      return true;
    } catch (e) {
      return false;
    }
  }
  return false;
}

/**
 * Saves arbitrary automation data to a namespaced cache file
 */
function saveAutomationCache(namespace, key, data) {
  try {
    const cacheDir = path.join(CACHE_DIR, namespace);
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const filePath = path.join(cacheDir, `${key}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    // silent fail
  }
}

/**
 * Loads arbitrary automation data from a namespaced cache file
 */
function getAutomationCache(namespace, key) {
  try {
    const filePath = path.join(CACHE_DIR, namespace, `${key}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    // silent fail
  }
  return null;
}

module.exports = {
  saveToCache,
  getFromCache,
  getCachePathForDate,
  listCachedDates,
  clearCache,
  saveAutomationCache,
  getAutomationCache
};
