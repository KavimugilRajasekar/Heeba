// src/core/handlers/model-handler.js
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { testOllamaConnection } = require('../ollama-adapter');
const { CREDENTIALS_PATH } = require('../../utils/paths');

async function testOnlineModelConnection(apiKey, baseUrl, model) {
    const postData = JSON.stringify({
        model: model,
        prompt: "hi",
        stream: false,
        options: { num_predict: 5 }
    });

    try {
        const url = new URL(baseUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 10000
        };

        const agent = url.protocol === 'https:' ? https : http;
        return new Promise((resolve) => {
            const req = agent.request(options, (res) => {
                if (res.statusCode === 200) resolve({ success: true });
                else resolve({ success: false, message: `HTTP ${res.statusCode}` });
            });
            req.on('error', (e) => resolve({ success: false, message: e.message }));
            req.on('timeout', () => { req.destroy(); resolve({ success: false, message: 'Connection timeout' }); });
            req.write(postData);
            req.end();
        });
    } catch (e) {
        return { success: false, message: `Invalid URL: ${baseUrl}` };
    }
}

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

  add_online_model: async (params, context) => {
    const { id, type, base_url, api_key, model } = params;

    if (!id || !type || !base_url || !api_key || !model) {
      return { success: false, message: 'Missing model details (id, type, base_url, api_key, model are required)' };
    }

    if (!['ollama', 'openrouter', 'openai'].includes(type)) {
      return { success: false, message: `Invalid type "${type}". Must be ollama, openrouter, or openai.` };
    }

    try {
      // Test connection before saving
      const test = await testOnlineModelConnection(api_key, base_url, model);
      if (!test.success) return { success: false, message: `Connection test failed: ${test.message}` };

      const { addOnlineModel } = require('../model-registry');
      addOnlineModel({ id, type, base_url, api_key, model });
      return { success: true, message: `Online model "${id}" added and verified!` };
    } catch (err) {
      return { success: false, message: `Failed to add online model: ${err.message}` };
    }
  },

  delete_online_model: async (params, context) => {
    const { id } = params;

    if (!id) {
      return { success: false, message: 'Missing model id to delete.' };
    }

    try {
      const { deleteOnlineModel } = require('../model-registry');
      const deleted = deleteOnlineModel(id);
      if (deleted) {
        return { success: true, message: `Online model "${id}" deleted.` };
      }
      return { success: false, message: `Model "${id}" not found.` };
    } catch (err) {
      return { success: false, message: `Failed to delete model: ${err.message}` };
    }
  }
};

module.exports = modelHandlers;
