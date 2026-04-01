// src/core/intent-executor.js
const fs = require('fs');
const path = require('path');
const { getHeebaConfig, reloadConfig } = require('./config-loader');

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
