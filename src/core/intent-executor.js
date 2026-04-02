// src/core/intent-executor.js
const fs = require('fs');
const path = require('path');
const { getHeebaConfig, reloadConfig } = require('./config-loader');
const { testOllamaConnection } = require('./ollama-adapter');

// Command handlers map
const commandHandlers = {
  update_user_profile: async (params, { screen, UI }) => {
    const config = getHeebaConfig();
    const { field, value } = params;

    if (!field || !value) {
      return { success: false, message: 'Missing field or value' };
    }

    if (field === 'name') {
      config.user_profile.name = value;
      config.user_profile.how_to_address = value;
    } else if (field === 'how_to_address') {
      config.user_profile.how_to_address = value;
    } else if (field === 'communication_style') {
      config.user_profile.communication_style = value;
    } else {
      return { success: false, message: `Unknown field: ${field}` };
    }

    // Persist to heeba.json
    const configPath = path.join(process.cwd(), 'heeba.json');
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      // Reload config in config-loader
      reloadConfig();
      return { success: true, message: `Updated ${field} to "${value}"` };
    } catch (err) {
      return { success: false, message: `Failed to save: ${err.message}` };
    }
  },

  generate_code: async (params) => {
    // Placeholder for code generation logic
    return {
      success: true,
      message: `Code generation task queued: ${params.task_description || 'No description'}`
    };
  },

  debug_code: async (params) => {
    // Placeholder for debug logic
    return {
      success: true,
      message: `Debug task queued: ${params.error_description || 'No error description'}`
    };
  },

  analyze_file: async (params) => {
    // Placeholder for file analysis logic
    return {
      success: true,
      message: `File analysis queued: ${params.file_path || 'No path'}`
    };
  },

  update_config: async (params) => {
    const config = getHeebaConfig();
    const { section, field, value } = params;

    if (!section || !field || value === undefined) {
      return { success: false, message: 'Missing section, field, or value' };
    }

    try {
      if (config[section] && typeof config[section] === 'object') {
        config[section][field] = value;
      } else if (section === 'root') {
        config[field] = value;
      } else {
        // Create section if it doesn't exist
        config[section] = { [field]: value };
      }

      const configPath = path.join(process.cwd(), 'heeba.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      reloadConfig();
      return { success: true, message: `Updated config: [${section}].${field} = ${value}` };
    } catch (err) {
      return { success: false, message: `Failed to update config: ${err.message}` };
    }
  },

  rename_session: async (params, context) => {
    const { name } = params;
    if (!name || !name.trim()) {
      return { success: false, message: 'No session name provided.' };
    }
    const trimmedName = name.trim();

    // context.currentSession is the live session object from main.js
    if (!context.currentSession) {
      return { success: false, message: 'No active session to rename.' };
    }

    context.currentSession.name = trimmedName;

    // Fire callback so main.js can re-render the Index Page tree
    if (typeof context.onSessionRenamed === 'function') {
      context.onSessionRenamed(trimmedName);
    }

    return { success: true, message: `Session renamed to "${trimmedName}"` };
  },

  delete_session: async (params, context) => {
    if (!context.currentSession) {
      return { success: false, message: 'No active session to delete.' };
    }

    // Fire callback — main.js removes the session from the array and navigates back
    if (typeof context.onSessionDeleted === 'function') {
      context.onSessionDeleted();
    }

    return { success: true, message: 'Session deleted.' };
  },

  add_ollama_model: async (params) => {
    const { virtual_name, actual_model, api_key, endpoint } = params;

    if (!virtual_name || !actual_model || !api_key || !endpoint) {
      return { success: false, message: 'Missing model details (name, key, or endpoint)' };
    }

    // Step 1: Test connection
    const test = await testOllamaConnection(api_key, endpoint, actual_model);
    if (!test.success) {
      return { success: false, message: `Connection test failed: ${test.message}` };
    }

    // Step 2: Load and update credentials.json
    try {
      const credPath = path.join(process.cwd(), 'credentials.json');
      let credentials = { ollama: { api_key, endpoint, models: [] } };
      
      if (fs.existsSync(credPath)) {
        credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      }

      // Add or update model
      const existingIdx = credentials.ollama.models.findIndex(m => m.virtual_name === virtual_name);
      if (existingIdx >= 0) {
        credentials.ollama.models[existingIdx] = { virtual_name, actual_model };
      } else {
        credentials.ollama.models.push({ virtual_name, actual_model });
      }

      fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2), 'utf8');
      return { success: true, message: `Model "${virtual_name}" added and verified!` };
    } catch (err) {
      return { success: false, message: `Failed to save credentials: ${err.message}` };
    }
  }
};

// Parse JSON from LLM response
function parseCommandFromResponse(response) {
  // Look for JSON block in the response
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                    response.match(/\{[\s\S]*"action"[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    } catch (e) {
      // Try to find raw JSON
      const rawMatch = response.match(/\{[\s\S]*\}/);
      if (rawMatch) {
        try {
          return JSON.parse(rawMatch[0]);
        } catch (e2) {
          return null;
        }
      }
    }
  }
  return null;
}

// Check if response contains a command
function hasCommand(response) {
  return response.includes('"action"') && response.includes('"parameters"');
}

// Execute a command
async function executeCommand(command, context) {
  const handler = commandHandlers[command.action];
  if (!handler) {
    return { success: false, message: `Unknown action: ${command.action}` };
  }

  return await handler(command.parameters || {}, context);
}

// Main entry: process LLM response and check for commands
async function processLLMResponse(response, context = {}) {
  const command = parseCommandFromResponse(response);

  if (command && command.action) {
    const result = await executeCommand(command, context);
    return {
      hasCommand: true,
      command,
      result
    };
  }

  return { hasCommand: false, command: null, result: null };
}

module.exports = {
  parseCommandFromResponse,
  hasCommand,
  executeCommand,
  processLLMResponse,
  commandHandlers
};
