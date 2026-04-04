// src/core/intent-executor.js
const emailHandlers = require('./handlers/email-handler');
const systemHandlers = require('./handlers/system-handler');
const sessionHandlers = require('./handlers/session-handler');
const modelHandlers = require('./handlers/model-handler');
const fileHandlers = require('./handlers/file-handler');
const profileHandlers = require('./handlers/profile-handler');

// Merge all handlers into a single command map
const commandHandlers = {
  ...emailHandlers,
  ...systemHandlers,
  ...sessionHandlers,
  ...modelHandlers,
  ...fileHandlers,
  ...profileHandlers
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

  // Backwards compat for payload or parameters
  return await handler(command.payload || command.parameters || {}, context);
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
