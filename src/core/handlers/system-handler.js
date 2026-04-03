// src/core/handlers/system-handler.js
const fs = require('fs');
const { getHeebaConfig, reloadConfig } = require('../config-loader');
const { HEEBA_JSON_PATH } = require('../../utils/paths');

const systemHandlers = {
  update_config: async (params) => {
    const config = getHeebaConfig();
    const { key, value } = params;

    if (!key || value === undefined) {
      return { success: false, message: 'Missing key or value' };
    }

    const setNestedValue = (obj, path, val) => {
      const keys = path.split('.');
      const lastKey = keys.pop();
      let current = obj;
      for (const k of keys) {
        if (current[k] === undefined) current[k] = {};
        current = current[k];
      }
      current[lastKey] = val;
    };

    setNestedValue(config, key, value);

    try {
      fs.writeFileSync(HEEBA_JSON_PATH, JSON.stringify(config, null, 2), 'utf8');
      reloadConfig();
      return { success: true, message: `Updated config ${key} to ${value}` };
    } catch (err) {
      return { success: false, message: `Failed to save: ${err.message}` };
    }
  }
};

module.exports = systemHandlers;
