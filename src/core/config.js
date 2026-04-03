// src/core/config.js
const path = require('path');
const fs = require('fs');
const { CREDENTIALS_PATH, MODELS_DIR, ENGINE_EXE } = require('../utils/paths');

// Environment Setup
process.env.FORCE_COLOR = '1';
process.env.COLORTERM = 'truecolor';
process.env.TERM = 'xterm-256color';

// Load credentials for virtual models
function loadCredentials() {
    try {
        if (fs.existsSync(CREDENTIALS_PATH)) {
            return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
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
    const localModels = fs.existsSync(MODELS_DIR)
        ? fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.gguf') || f.endsWith('.bin')).map(f => f)
        : [];

    // Combine local models and virtual models (label virtual ones)
    const virtualModels = getVirtualModels().map(m => `${m} (Online)`);
    return [...localModels, ...virtualModels];
}

const availableModels = getAvailableModels();
const DEFAULT_CONFIG = {
    model: availableModels.find(m => m === 'granite4latest.gguf') || availableModels[0] || 'ollama-gpt-oss',
    engine: ENGINE_EXE,
    contextLength: 2048,
    threads: 4,
};

module.exports = { DEFAULT_CONFIG, getAvailableModels, getVirtualModels };
