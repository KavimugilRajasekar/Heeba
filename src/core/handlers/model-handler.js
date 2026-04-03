// src/core/handlers/model-handler.js
const fs = require('fs');
const path = require('path');
const { testOllamaConnection } = require('../ollama-adapter');
const { CREDENTIALS_PATH } = require('../../utils/paths');

const modelHandlers = {
  add_ollama_model: async (params) => {
    const { virtual_name, actual_model, api_key, endpoint } = params;

    if (!virtual_name || !actual_model || !api_key || !endpoint) {
      return { success: false, message: 'Missing model details (name, key, or endpoint)' };
    }

    const test = await testOllamaConnection(api_key, endpoint, actual_model);
    if (!test.success) return { success: false, message: `Connection test failed: ${test.message}` };

    try {
      const credPath = CREDENTIALS_PATH;
      let credentials = { ollama: { api_key, endpoint, models: [] } };
      
      if (fs.existsSync(credPath)) {
        credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      }

      const existingIdx = credentials.ollama.models.findIndex(m => m.virtual_name === virtual_name);
      if (existingIdx >= 0) credentials.ollama.models[existingIdx] = { virtual_name, actual_model };
      else credentials.ollama.models.push({ virtual_name, actual_model });

      fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), 'utf8');
      return { success: true, message: `Model "${virtual_name}" added and verified!` };
    } catch (err) { return { success: false, message: `Failed to save credentials: ${err.message}` }; }
  },

  generate_code: async (params) => {
    return { success: true, message: `Code generation task queued: ${params.task_description || 'No description'}` };
  },

  debug_code: async (params) => {
    return { success: true, message: `Debug task queued: ${params.error_description || 'No error description'}` };
  },

  analyze_file: async (params) => {
    return { success: true, message: `File analysis queued: ${params.file_path || 'No path'}` };
  }
};

module.exports = modelHandlers;
