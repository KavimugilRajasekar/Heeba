// src/core/config-loader.js
const fs = require('fs');
const path = require('path');

let heebaConfig = null;

function loadHeebaConfig() {
  if (heebaConfig) return heebaConfig;

  const configPath = path.join(process.cwd(), 'heeba.json');

  try {
    if (fs.existsSync(configPath)) {
      const rawData = fs.readFileSync(configPath, 'utf8');
      heebaConfig = JSON.parse(rawData);
      return heebaConfig;
    } else {
      heebaConfig = getDefaultConfig();
      return heebaConfig;
    }
  } catch (err) {
    heebaConfig = getDefaultConfig();
    return heebaConfig;
  }
}

function getDefaultConfig() {
  return {
    heeba_identity: {
      name: 'Heeba',
      full_name: 'HEEBA — Humanized Efficient Engine Bridging Automation',
      version: '1.0',
      description: 'A config-driven AI terminal assistant'
    },
    user_profile: {
      name: 'User',
      how_to_address: 'User',
      communication_style: 'friendly and helpful'
    },
    assistant_behavior: {
      tone: 'friendly',
      strictness: 'moderate',
      allowed_actions: ['answer_questions', 'explain_concepts', 'assist_with_tasks'],
      forbidden_actions: ['execute_commands', 'modify_files']
    },
    intent_routing_rules: {},
    system_rules: [
      'Follow heeba.json configuration',
      'Never invent behavior outside configured settings'
    ],
    output_format: {
      conversational: { type: 'free_text' },
      structured_command: { type: 'json', structure: { action: '', parameters: {} } }
    }
  };
}

function getHeebaConfig() {
  return heebaConfig || loadHeebaConfig();
}

function reloadConfig() {
  heebaConfig = null;
  return loadHeebaConfig();
}

module.exports = { loadHeebaConfig, getHeebaConfig, reloadConfig };
