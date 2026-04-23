// src/core/intent-firewall.js
/**
 * Intent Confinement Layer
 * Validates LLM intent against user prompt to prevent over-interpretation,
 * chaining, and autonomous expansion.
 */

const logger = require('../utils/logger');

// Agent mode trigger keywords (require explicit user request)
const AGENT_MODE_KEYWORDS = ['plan', 'analyze', 'audit', 'automate', 'run security', 'run app audit'];

// Actions that require explicit trigger in user prompt
const AGENT_MODE_ACTIONS = [
  'run_security_audit', 'runAppAuditLoop', 'runAgenticLoop',
  'security-auditor', 'app-auditor', 'agent-executor'
];

// Common verbs to extract from user prompts
const VERB_EXTRACTOR = /(\w+)\s+(?:me\s+|my\s+|the\s+)?(?:email|emails|mail|inbox|browser|website|page|tab|file|folder|system|weather|news|software|attachment|attachments|screenshot)/gi;
const VERB_PATTERNS = [
  /^(open|go|navigate|visit|launch|show|display|list|fetch|read|send|compose|categorize|summarize|detect|extract|download|export|archive|delete|rename|move|copy|check|run|perform|execute|apply|generate|create|add|remove|take|screenshot|capture|click|type|scroll|switch|close)\b/i
];

/**
 * Extract action verbs from user prompt
 * @param {string} userPrompt
 * @returns {string[]} Array of verbs found in prompt
 */
function extractVerbs(userPrompt) {
  const verbs = new Set();
  const normalized = userPrompt.toLowerCase();

  // Pattern 1: action verbs at start or after common subjects
  VERB_PATTERNS.forEach(pattern => {
    const match = normalized.match(pattern);
    if (match) verbs.add(match[1].toLowerCase());
  });

  // Pattern 2: common action phrases
  const actionPhrases = [
    'open', 'go to', 'navigate to', 'visit', 'launch browser',
    'show me', 'show my', 'list my', 'fetch', 'read my', 'read email',
    'send email', 'send message', 'compose', 'categorize', 'summarize',
    'detect', 'extract', 'download attachments', 'export emails', 'archive',
    'delete', 'rename', 'move file', 'copy file', 'check', 'run',
    'perform', 'execute', 'apply rules', 'generate digest', 'create',
    'add', 'remove', 'take screenshot', 'click', 'type in', 'scroll',
    'switch to', 'close tab'
  ];

  actionPhrases.forEach(phrase => {
    if (normalized.includes(phrase)) {
      const verb = phrase.split(' ')[0];
      verbs.add(verb.toLowerCase());
    }
  });

  return Array.from(verbs);
}

/**
 * Maps action verb to allowed intent actions
 */
function getAllowedActionsForVerb(verb) {
  const verbMap = {
    'open': ['browser_navigate', 'browser_launch', 'open_file', 'read_file', 'list_dir'],
    'go': ['browser_navigate'],
    'navigate': ['browser_navigate'],
    'visit': ['browser_navigate'],
    'launch': ['browser_launch'],
    'show': ['fetch_emails', 'list_dir', 'browser_get_state', 'render_timeline', 'email_stats'],
    'display': ['fetch_emails', 'list_dir', 'render_timeline'],
    'list': ['list_dir', 'list_software', 'list_rules', 'list_quick_replies'],
    'fetch': ['fetch_emails', 'fetch_unread_by_date'],
    'read': ['read_email', 'read_file', 'narrate_email'],
    'send': ['send_email', 'send_quick_reply'],
    'compose': ['send_email'],
    'categorize': ['categorize_emails'],
    'summarize': ['summarize_emails_by_date', 'generate_digest', 'weekly_digest'],
    'detect': ['detect_otp', 'detect_spam'],
    'extract': ['detect_otp', 'email_to_task', 'download_attachments'],
    'download': ['download_attachments'],
    'export': ['export_emails', 'export_emails_by_date'],
    'archive': ['bulk_archive'],
    'delete': ['delete_file', 'delete_session', 'bulk_mark_read'],
    'rename': ['rename_file', 'rename_session', 'rename_conversation'],
    'move': ['move_file'],
    'copy': ['copy_file'],
    'check': ['test_endpoint', 'browser_get_state', 'fetch_emails'],
    'run': ['run_security_audit', 'run_doctor', 'apply_rules', 'runAppAuditLoop'],
    'perform': ['run_security_audit', 'runAppAuditLoop'],
    'execute': ['run_security_audit'],
    'apply': ['apply_rules'],
    'generate': ['generate_digest'],
    'create': ['add_rule', 'add_email_account', 'add_online_model'],
    'add': ['add_rule', 'add_email_account', 'add_online_model'],
    'remove': ['uninstall_software', 'bulk_archive'],
    'take': ['browser_screenshot'],
    'click': ['browser_click'],
    'type': ['browser_type'],
    'scroll': ['browser_scroll'],
    'switch': ['browser_switch_tab'],
    'close': ['browser_close_tab', 'browser_close', 'delete_page']
  };

  return verbMap[verb.toLowerCase()] || [];
}

/**
 * Check if action requires agent mode (autonomous planning)
 * @param {string} action
 * @returns {boolean}
 */
function isAgentModeAction(action) {
  return AGENT_MODE_ACTIONS.some(agentAction =>
    action.toLowerCase().includes(agentAction.toLowerCase())
  );
}

/**
 * Check if user prompt explicitly requested agent mode
 * @param {string} userPrompt
 * @returns {boolean}
 */
function hasExplicitAgentModeRequest(userPrompt) {
  const normalized = userPrompt.toLowerCase();
  return AGENT_MODE_KEYWORDS.some(keyword => normalized.includes(keyword));
}

/**
 * Validate LLM intent against user prompt
 * @param {string} userPrompt - Original user input
 * @param {Object} llmIntentJson - Parsed intent from LLM { action, parameters, ... }
 * @param {Object} options - { strictIntentMode: boolean }
 * @returns {Object} { valid: boolean, sanitizedIntent: Object|null, reason: string }
 */
function validateIntent(userPrompt, llmIntentJson, options = {}) {
  const { strictIntentMode = false } = options;

  // If strict mode is disabled, pass through
  if (!strictIntentMode) {
    return { valid: true, sanitizedIntent: llmIntentJson, reason: 'strictIntentMode disabled' };
  }

  const action = llmIntentJson?.action || llmIntentJson?.command;

  // === CHECK 1: No action provided ===
  if (!action) {
    return {
      valid: true,
      sanitizedIntent: llmIntentJson,
      reason: 'No action to validate'
    };
  }

  // === CHECK 2: Agent mode actions require explicit trigger ===
  if (isAgentModeAction(action)) {
    if (!hasExplicitAgentModeRequest(userPrompt)) {
      logger.warn('FIREWALL', `Agent mode action '${action}' blocked - no explicit trigger in: "${userPrompt}"`);
      return {
        valid: false,
        sanitizedIntent: null,
        reason: `Action '${action}' requires explicit keywords like 'plan', 'analyze', 'audit', or 'automate'`
      };
    }
  }

  // === CHECK 3: Extract verbs from user prompt ===
  const promptVerbs = extractVerbs(userPrompt);
  const allowedActions = promptVerbs.flatMap(verb => getAllowedActionsForVerb(verb));

  // === CHECK 4: Single action enforcement ===
  // If LLM returned multiple actions (e.g., array of actions), block it
  if (Array.isArray(llmIntentJson.actions) && llmIntentJson.actions.length > 1) {
    logger.warn('FIREWALL', `Multiple actions detected in intent: ${JSON.stringify(llmIntentJson.actions)}`);
    return {
      valid: false,
      sanitizedIntent: null,
      reason: 'Multiple actions inferred from a single prompt. Please specify only one action.'
    };
  }

  // === CHECK 5: Intent verb must match prompt verb ===
  const actionLower = action.toLowerCase();

  // Special cases for agent/auditor actions that ARE allowed with proper trigger
  if (isAgentModeAction(action) && hasExplicitAgentModeRequest(userPrompt)) {
    // Allow but strip extraneous parameters not in prompt
  } else if (allowedActions.length > 0 && !allowedActions.some(allowed => actionLower.includes(allowed))) {
    // If no direct match, check if action contains any of the prompt verbs
    const hasVerbMatch = promptVerbs.some(verb => {
      const verbActions = getAllowedActionsForVerb(verb);
      return verbActions.some(va => actionLower.includes(va));
    });

    if (!hasVerbMatch) {
      logger.warn('FIREWALL', `Action '${action}' has no verb match in prompt verbs: [${promptVerbs.join(', ')}]`);
      return {
        valid: false,
        sanitizedIntent: null,
        reason: `Action '${action}' does not match any verb in your prompt. Expected one of: [${allowedActions.join(', ')}]`
      };
    }
  }

  // === CHECK 6: Strip parameters not present in user prompt ===
  let sanitizedIntent = { ...llmIntentJson };
  const paramKeys = Object.keys(sanitizedIntent.parameters || sanitizedIntent.payload || {});

  paramKeys.forEach(key => {
    const paramValue = sanitizedIntent.parameters?.[key] || sanitizedIntent.payload?.[key];
    const normalizedValue = String(paramValue).toLowerCase();
    const normalizedPrompt = userPrompt.toLowerCase();

    // If parameter value doesn't appear in prompt, it might be inferred
    // Exception: placeholders like {extracted_*} or numbers that make sense contextually
    if (paramValue &&
        !normalizedPrompt.includes(normalizedValue) &&
        !String(paramValue).includes('{') &&
        !/^\d+$/.test(String(paramValue))) {
      logger.debug('FIREWALL', `Removing inferred parameter '${key}': ${paramValue}`);
      delete sanitizedIntent.parameters?.[key];
      delete sanitizedIntent.payload?.[key];
    }
  });

  logger.debug('FIREWALL', `Intent validated: action='${action}', promptVerbs=[${promptVerbs.join(', ')}]`);

  return {
    valid: true,
    sanitizedIntent,
    reason: 'Intent validated successfully'
  };
}

/**
 * Block intent and generate clarification message
 * @param {string} userPrompt
 * @param {string} reason
 * @returns {string} User-facing clarification request
 */
function generateClarificationMessage(userPrompt, reason) {
  return `I need clarification before proceeding.\n\n` +
         `Your request: "${userPrompt}"\n` +
         `Issue: ${reason}\n\n` +
         `Please rephrase with a single, explicit action. ` +
         `For example:\n` +
         `  • "Open google.com" (not "Open google and check my emails")\n` +
         `  • "Summarize my emails" (not "Check and summarize my emails")\n` +
         `  • "Run a security audit" (only if you want an autonomous audit)\n`;
}

module.exports = {
  validateIntent,
  extractVerbs,
  isAgentModeAction,
  hasExplicitAgentModeRequest,
  generateClarificationMessage,
  AGENT_MODE_KEYWORDS,
  AGENT_MODE_ACTIONS
};