// src/core/handlers/profile-handler.js
const fs = require('fs');
const { getHeebaConfig, reloadConfig } = require('../config-loader');
const { HEEBA_JSON_PATH } = require('../../utils/paths');

const profileHandlers = {
  update_user_profile: async (params, { screen, UI }) => {
    const config = getHeebaConfig();
    const { field, value } = params;

    if (!field || !value) return { success: false, message: 'Missing field or value' };

    if (field === 'name') {
      config.user_profile.name = value;
      config.user_profile.how_to_address = value;
    } else if (field === 'how_to_address') {
      config.user_profile.how_to_address = value;
    } else if (field === 'communication_style') {
      config.user_profile.communication_style = value;
    } else return { success: false, message: `Unknown field: ${field}` };

    try {
      fs.writeFileSync(HEEBA_JSON_PATH, JSON.stringify(config, null, 2), 'utf8');
      reloadConfig();
      return { success: true, message: `Updated ${field} to "${value}"` };
    } catch (err) { return { success: false, message: `Failed to save: ${err.message}` }; }
  },

  update_config: async (params) => {
    const config = getHeebaConfig();
    const { section, field, value } = params;

    if (!section || !field || value === undefined) return { success: false, message: 'Missing section, field, or value' };

    try {
      if (config[section] && typeof config[section] === 'object') config[section][field] = value;
      else if (section === 'root') config[field] = value;
      else config[section] = { [field]: value };

      fs.writeFileSync(HEEBA_JSON_PATH, JSON.stringify(config, null, 2), 'utf8');
      reloadConfig();
      return { success: true, message: `Updated config: [${section}].${field} = ${value}` };
    } catch (err) { return { success: false, message: `Failed to update config: ${err.message}` }; }
  }
};

module.exports = profileHandlers;
