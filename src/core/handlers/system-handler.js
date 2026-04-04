// src/core/handlers/system-handler.js
const fs = require('fs');
const { getHeebaConfig, reloadConfig } = require('../config-loader');
const { HEEBA_JSON_PATH } = require('../../utils/paths');

const systemHandlers = {
  get_system_info: async () => {
    const os = require('os');
    const { version } = require('../../../package.json');
    const uptime = Math.floor(os.uptime() / 3600);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);

    let msg = `[System Status: Heeba v${version}]\n`;
    msg += `  ◈ Platform: ${os.platform()} (${os.arch()})\n`;
    msg += `  ◈ CPU: ${os.cpus()[0].model} (${os.cpus().length} cores)\n`;
    msg += `  ◈ Memory: ${freeMem} GB free / ${totalMem} GB total\n`;
    msg += `  ◈ Uptime: ${uptime} hours\n`;
    msg += `  ◈ Host: ${os.hostname()}`;

    return { success: true, message: msg };
  },

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
