// src/core/config.js
const path = require('path');
const fs = require('fs');

// Environment Setup
process.env.FORCE_COLOR = '1';
process.env.COLORTERM = 'truecolor';
process.env.TERM = 'xterm-256color';

// CONFIG logic
function getAvailableModels() {
  const modelsDir = path.join(process.cwd(), 'engine', 'models');
  if (!fs.existsSync(modelsDir)) return [];
  return fs.readdirSync(modelsDir)
    .filter(f => f.endsWith('.gguf') || f.endsWith('.bin'))
    .map(f => f);
}

const availableModels = getAvailableModels();
const DEFAULT_CONFIG = {
  model: availableModels.find(m => m === 'granite4latest.gguf') || availableModels[0] || 'granite4latest.gguf',
  engine: path.join(process.cwd(), 'engine', 'inference-engine', 'llama-cli.exe'),
  contextLength: 2048,
  threads: 4,
};

module.exports = { DEFAULT_CONFIG, getAvailableModels };
