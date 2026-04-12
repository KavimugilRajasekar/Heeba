// src/core/intent-executor.js
const { parseCommandFromResponse } = require('../utils/json-parser');
const emailHandlers = require('./handlers/email-handler');
const systemHandlers = require('./handlers/system-handler');
const sessionHandlers = require('./handlers/session-handler');
const modelHandlers = require('./handlers/model-handler');
const fileHandlers = require('./handlers/file-handler');
const profileHandlers = require('./handlers/profile-handler');
const softwareHandlers = require('./handlers/software-handler');
const weatherHandlers = require('./handlers/weather-handler');
const { getOS } = require('./kb-loader');

// Auditors (New Modular Structure)
const securityAuditor = require('./auditors/security-auditor');
const appAuditor = require('./auditors/app-auditor');
const agentExecutor = require('./agent-executor');

// Merge all handlers into a single command map
const commandHandlers = {
  ...emailHandlers,
  ...systemHandlers,
  ...sessionHandlers,
  ...modelHandlers,
  ...fileHandlers,
  ...profileHandlers,
  ...softwareHandlers,
  ...weatherHandlers
};

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
  const input = userInput.toLowerCase();

  // Check configurable patterns from heeba.json (if present)
  if (intentRules && intentRules.system_security_testing) {
    const patterns = intentRules.system_security_testing.patterns || [];
    for (const pattern of patterns) {
      if (input.includes(pattern.toLowerCase())) return true;
    }
  }

  // Hardcoded security keywords — always checked
  const securityKeywords = [
    'malware', 'backdoor', 'firewall', 'vulnerability', 'threat',
    'security audit', 'security scan', 'security check',
    'open port', 'open service', 'listening port',
    'scan my system', 'scan this system', 'scan system',
    'check my system', 'system scan', 'system audit',
    'is my system safe', 'is this system safe', 'this system safe',
    'is my system secure', 'is this system secure', 'system is safe',
    'disable service', 'validate service', 'unnecessary service',
    'network scan', 'intrusion', 'antivirus', 'defender',
    'audit my', 'hardening', 'exploit', 'patch', 'cve'
  ];
  return securityKeywords.some(kw => input.includes(kw));
}

// Check if intent matches app endpoint/backend auditing
function isAppAuditIntentTriggered(userInput, intentRules) {
  const input = userInput.toLowerCase();
  const appKeywords = ['backend', 'endpoint', 'api', 'port', 'route', 'server audit'];
  return appKeywords.some(kw => input.includes(kw));
}

// Extract email address from user input (for audit report delivery)
function extractEmailFromPrompt(userInput) {
  if (!userInput) return null;
  const match = userInput.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match ? match[0] : null;
}

// Proxies to new modules for backward compatibility
async function runSecurityAuditLoop(userInput, queryFn, maxIterations = 15, options = {}) {
  return await securityAuditor.runSecurityAuditLoop(userInput, queryFn, commandHandlers, maxIterations, options);
}

async function runAppAuditLoop(userInput, queryFn, maxIterations = 15, options = {}) {
  return await appAuditor.runAppAuditLoop(userInput, queryFn, commandHandlers, maxIterations, options);
}

async function runAgenticLoop(userInput, queryFn, maxIterations = 15, options = {}) {
  return await agentExecutor.runAgenticLoop(userInput, queryFn, commandHandlers, { ...options, maxIterations });
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
  printAppAuditStep,
  runAgenticLoop,
  extractEmailFromPrompt
};
