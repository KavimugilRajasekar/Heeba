// src/utils/helpers.js
const { C } = require('../ui/theme');

const MODES = {
  task: {
    name: 'Dino', prompt: 'heeba-task', headerTitle: 'Task Mode',
    mascot: '\n           __\n          / _)\n   .-^^^-/ /\n__/       /\n<__.|_|-|_|',
    statusLines: 'Workspace : ~/current-project\nActivity  : Editing | Creating | Debugging',
    color: C.green,
    tips: ['ask heeba to create a component', 'ask heeba to debug an error', 'ask heeba to design a feature']
  },
  auto: {
    name: 'Cat', prompt: 'heeba-auto', headerTitle: 'Automation Mode',
    mascot: '\n  /\\/\\_\\\n ( o.o )\n  > ^ <',
    statusLines: 'Mode     : LLM-powered chat\nContext  : Conversation history maintained',
    color: C.yellow,
    tips: ['Chat with Heeba AI', 'Ask about automation', 'Get help with scripts']
  }
};

function buildSystemPrompt(mode) {
  if (mode === 'auto') {
    return `You are Heeba, an AI assistant running in a terminal.
Be helpful, concise, and practical. Keep responses short.`;
  }
  return null;
}

module.exports = { MODES, buildSystemPrompt };
