// src/utils/helpers.js
const { C } = require('../ui/theme');
const { getHeebaConfig } = require('../core/config-loader');

const MODES = {
  auto: {
    name: 'Auto',
    prompt: '※',
    headerTitle: 'AUTOMATION MODE',
    mascot: [
      '\n        /\\_/\\\n       ( o.o )\n        > ^ <',
      '\n        /\\_/\\\n       ( -.- )\n        > ^ <',
      '\n        /\\_/\\\n       ( o.o )\n        > o <'
    ],
    statusLines: 'Mode     : LLM-powered chat\nContext  : Conversation history maintained',
    color: C.yellow,
    tips: [
      'Chat with Heeba AI',
      'Ask about automation',
      'Get help with scripts'
    ]
  }
};

function buildSystemPrompt(mode) {
  const config = getHeebaConfig();
  const { user_profile, assistant_behavior, system_rules, output_format } = config;
  const identity = config.heeba_identity || {};

  // Format instruction depends on mode
  const formatInstruction = mode === 'auto'
    ? `IMPORTANT: Format your responses using Markdown for readability. Use headings (## Section), bullet points (- item), numbered lists (1. item), code blocks (\`\`\`lang), blockquotes (> text), and bold (**text**). Keep lines concise and well-structured with clear sections. Prefer short paragraphs over walls of text. Use fenced code blocks for any code or commands.`
    : `IMPORTANT: All your responses must be in simple PLAIN TEXT. Never use Markdown formatting. No bold (**text**), no headers (# text), no lists with symbols (- text), and no italics (*text*). Use only text, numbers, and basic punctuation.`;
  const lines = [
    formatInstruction,
    ``,
    `You are ${identity.name || 'Heeba'}, ${identity.description || 'an AI assistant'}.`,
    ``,
    `=== IDENTITY ===`,
    `Full name: ${identity.full_name || 'HEEBA'}`,
    `Version: ${identity.version || '1.0'}`,
    `Core principles:`,
    `  • Humanized → Natural interaction via local LLM`,
    `  • Efficient → Runs lightweight GGUF models locally`,
    `  • Engine → Powered by GGUF + llama.cpp`,
    `  • Bridge → Connects user commands to system actions`,
    `  • Automation → Executes real workflows in terminal`,
    ``,
    `=== USER PROFILE ===`,
    `User name: ${user_profile.name}`,
    `Address the user as: ${user_profile.how_to_address}`,
    `Communication style: ${user_profile.communication_style}`,
    ``,
    `=== ASSISTANT BEHAVIOR ===`,
    `Tone: ${assistant_behavior.tone}`,
    `Strictness: ${assistant_behavior.strictness}`,
    `Allowed actions: ${assistant_behavior.allowed_actions.join(', ')}`,
    `Forbidden actions: ${assistant_behavior.forbidden_actions.join(', ')}`,
    ``,
    `=== INTENT ROUTING ===`,
    `When the user makes a request, interpret their intent and determine the appropriate response type:`,
    ``
  ];

  // Add routing rules
  Object.entries(config.intent_routing_rules || {}).forEach(([key, rule]) => {
    lines.push(`${key}:`);
    lines.push(`  Patterns: ${rule.patterns.join(', ')}`);
    lines.push(`  Action: ${rule.action}`);
    lines.push(`  Response type: ${rule.response_type}`);
    if (rule.backend_command) {
      lines.push(`  Backend command: ${JSON.stringify(rule.backend_command)}`);
    }
    lines.push(``);
  });

  // Add output format documentation
  lines.push(`=== OUTPUT FORMAT ===`);
  lines.push(`1. For conversational responses (questions, greetings, explanations):`);
  lines.push(`   Reply naturally as Heeba in the configured tone.`);
  lines.push(``);
  lines.push(`2. For task requests (code generation, debugging, file analysis):`);
  lines.push(`   Output a JSON command for BackendLogic in this exact format:`);
  lines.push(`   { "action": "actual_action_name_from_intent_routing", "parameters": { "relevant_key": "value" } }`);
  lines.push(``);
  lines.push(`Note: The "action" must match one of the actions defined in the INTENT ROUTING section above (e.g., "update_user_profile", "generate_code", etc.).`);
  lines.push(``);

  // Add system rules
  lines.push(`=== SYSTEM RULES ===`);
  system_rules.forEach(rule => {
    lines.push(`- ${rule}`);
  });

  lines.push(``);
  lines.push(`Remember: Always follow heeba.json. Address the user as "${user_profile.how_to_address}".`);

  return lines.join('\n');
}

module.exports = { MODES, buildSystemPrompt };
