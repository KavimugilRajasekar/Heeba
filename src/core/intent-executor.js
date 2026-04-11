// src/core/intent-executor.js
const emailHandlers = require('./handlers/email-handler');
const systemHandlers = require('./handlers/system-handler');
const sessionHandlers = require('./handlers/session-handler');
const modelHandlers = require('./handlers/model-handler');
const fileHandlers = require('./handlers/file-handler');
const profileHandlers = require('./handlers/profile-handler');
const softwareHandlers = require('./handlers/software-handler');
const { getOS } = require('./kb-loader');

// Auditors (New Modular Structure)
const securityAuditor = require('./auditors/security-auditor');
const appAuditor = require('./auditors/app-auditor');

// Merge all handlers into a single command map
const commandHandlers = {
  ...emailHandlers,
  ...systemHandlers,
  ...sessionHandlers,
  ...modelHandlers,
  ...fileHandlers,
  ...profileHandlers,
  ...softwareHandlers
};

// Parse JSON from LLM response
function parseCommandFromResponse(response) {
  const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) ||
                    response.match(/\{[\s\S]*"action"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      return JSON.parse(jsonStr);
    } catch (e) {
      const rawMatch = response.match(/\{[\s\S]*\}/);
      if (rawMatch) {
        try { return JSON.parse(rawMatch[0]); } catch (e2) { return null; }
      }
    }
  }
  return null;
}

// Execute a command
async function executeCommand(command, context) {
  const handler = commandHandlers[command.action];
  if (!handler) {
    return { success: false, message: `Unknown action: ${command.action}` };
  }
  return await handler(command.payload || command.parameters || {}, context);
}

// Main entry: process LLM response and check for commands
async function processLLMResponse(response, context = {}) {
  const command = parseCommandFromResponse(response);
  if (command && command.action) {
    const result = await executeCommand(command, context);
    return { hasCommand: true, command, result };
  }
  return { hasCommand: false, command: null, result: null };
}

// Check if intent matches security testing
function isSecurityIntentTriggered(userInput, intentRules) {
  if (!intentRules || !intentRules.system_security_testing) return false;
  const input = userInput.toLowerCase();
  const patterns = intentRules.system_security_testing.patterns || [];
  for (const pattern of patterns) {
    if (input.includes(pattern.toLowerCase())) return true;
  }
  const securityKeywords = ['malware', 'backdoor', 'firewall', 'vulnerability', 'threat', 'security audit'];
  return securityKeywords.some(kw => input.includes(kw));
}

// Check if intent matches app endpoint/backend auditing
function isAppAuditIntentTriggered(userInput, intentRules) {
  const input = userInput.toLowerCase();
  const appKeywords = ['backend', 'endpoint', 'api', 'port', 'route', 'server audit'];
  return appKeywords.some(kw => input.includes(kw));
}

// Proxies to new modules for backward compatibility
async function runSecurityAuditLoop(userInput, queryFn, maxIterations = 15, options = {}) {
  return await securityAuditor.runSecurityAuditLoop(userInput, queryFn, commandHandlers, maxIterations, options);
}

async function runAppAuditLoop(userInput, queryFn, maxIterations = 15, options = {}) {
  return await appAuditor.runAppAuditLoop(userInput, queryFn, commandHandlers, maxIterations, options);
}

function printAuditStep(step, isTUI, silent = false) {
  return securityAuditor.printAuditStep(step, isTUI, silent);
}

function printAppAuditStep(step, isTUI, silent = false) {
  return appAuditor.printAppAuditStep(step, isTUI, silent);
}

module.exports = {
  parseCommandFromResponse,
  executeCommand,
  processLLMResponse,
  commandHandlers,
  runSecurityAuditLoop,
  isSecurityIntentTriggered,
  printAuditStep,
  runAppAuditLoop,
  isAppAuditIntentTriggered,
  printAppAuditStep
};
