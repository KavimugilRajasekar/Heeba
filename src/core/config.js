// src/core/config.js
const path = require('path');
const fs = require('fs');

// Environment Setup
process.env.FORCE_COLOR = '1';
process.env.COLORTERM = 'truecolor';
process.env.TERM = 'xterm-256color';

// Load credentials for virtual models
function loadCredentials() {
    try {
        const credPath = path.join(process.cwd(), 'credentials.json');
        if (fs.existsSync(credPath)) {
            return JSON.parse(fs.readFileSync(credPath, 'utf8'));
        }
    } catch (e) {}
    return null;
}

// Get available virtual models from credentials
function getVirtualModels() {
    const credentials = loadCredentials();
    if (!credentials || !credentials.ollama || !credentials.ollama.models) {
        return [];
    }
    return credentials.ollama.models.map(m => m.virtual_name);
}

// CONFIG logic
function getAvailableModels() {
    const modelsDir = path.join(process.cwd(), 'engine', 'models');
    const localModels = fs.existsSync(modelsDir)
        ? fs.readdirSync(modelsDir).filter(f => f.endsWith('.gguf') || f.endsWith('.bin')).map(f => f)
        : [];

    // Combine local models and virtual models (label virtual ones)
    const virtualModels = getVirtualModels().map(m => `${m} (Online)`);
    return [...localModels, ...virtualModels];
}

const availableModels = getAvailableModels();
const DEFAULT_CONFIG = {
    model: availableModels.find(m => m === 'granite4latest.gguf') || availableModels[0] || 'ollama-gpt-oss',
    engine: path.join(process.cwd(), 'engine', 'inference-engine', 'llama-cli.exe'),
    contextLength: 2048,
    threads: 4,
};

module.exports = { DEFAULT_CONFIG, getAvailableModels, getVirtualModels };
