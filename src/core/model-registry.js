// src/core/model-registry.js
// Dynamic model registry: local GGUF + online from heeba.json + legacy credentials.json
const fs = require('fs');
const path = require('path');
const { HEEBA_JSON_PATH, CREDENTIALS_PATH, MODELS_DIR } = require('../utils/paths');
const { getHeebaConfig, reloadConfig } = require('./config-loader');

// Load legacy virtual models from credentials.json
function getLegacyVirtualModels() {
    try {
        if (fs.existsSync(CREDENTIALS_PATH)) {
            const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            if (creds.ollama && Array.isArray(creds.ollama.models)) {
                return creds.ollama.models.map(m => ({
                    id: m.virtual_name,
                    type: 'ollama',
                    base_url: creds.ollama.endpoint || 'https://ollama.com/api/generate',
                    api_key: creds.ollama.api_key || '',
                    model: m.actual_model
                }));
            }
        }
    } catch (e) { /* silent */ }
    return [];
}

// Get all models: local GGUF + online from heeba.json + legacy virtual
function getAllModels() {
    // Local GGUF/BIN models
    const localModels = fs.existsSync(MODELS_DIR)
        ? fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.gguf') || f.endsWith('.bin'))
        : [];

    const config = getHeebaConfig();

    // Online models from heeba.json
    const onlineModels = (config.online_models || []).map(m => `${m.id} (Online)`);

    // Legacy virtual models (backward compat) - mark with (Legacy) to distinguish
    const legacyModels = getLegacyVirtualModels()
        .filter(lm => !config.online_models?.some(om => om.id === lm.id)) // Don't duplicate if already in online_models
        .map(lm => `${lm.id} (Legacy)`);

    // Merge all, local first
    const seen = new Set(localModels);
    const all = [...localModels];

    [...onlineModels, ...legacyModels].forEach(m => {
        if (!seen.has(m)) {
            all.push(m);
            seen.add(m);
        }
    });

    return all;
}

// Get full online model config by ID (display name)
function getOnlineModel(modelName) {
    const cleanId = modelName.replace(' (Online)', '').replace(' (Legacy)', '').trim();
    const config = getHeebaConfig();

    // Check heeba.json online_models first
    if (config.online_models) {
        const found = config.online_models.find(m => m.id === cleanId);
        if (found) return found;
    }

    // Fall back to legacy credentials.json
    const legacy = getLegacyVirtualModels();
    const found = legacy.find(lm => lm.id === cleanId);
    if (found) return found;

    return null;
}

// Check if model is online/virtual (not local GGUF)
function isOnlineModel(modelName) {
    const cleanId = modelName.replace(' (Online)', '').replace(' (Legacy)', '').trim();
    const config = getHeebaConfig();

    // Check heeba.json
    if (config.online_models?.some(m => m.id === cleanId)) return true;

    // Check legacy
    const legacy = getLegacyVirtualModels();
    if (legacy.some(lm => lm.id === cleanId)) return true;

    return false;
}

// Add online model to heeba.json
function addOnlineModel(entry) {
    const config = getHeebaConfig();
    if (!config.online_models) config.online_models = [];

    const existingIdx = config.online_models.findIndex(m => m.id === entry.id);
    if (existingIdx >= 0) {
        config.online_models[existingIdx] = entry;
    } else {
        config.online_models.push(entry);
    }

    fs.writeFileSync(HEEBA_JSON_PATH, JSON.stringify(config, null, 2), 'utf8');
    reloadConfig();
    return true;
}

// Delete online model from heeba.json
function deleteOnlineModel(modelId) {
    const config = getHeebaConfig();
    if (!config.online_models) return false;

    const idx = config.online_models.findIndex(m => m.id === modelId);
    if (idx >= 0) {
        config.online_models.splice(idx, 1);
        fs.writeFileSync(HEEBA_JSON_PATH, JSON.stringify(config, null, 2), 'utf8');
        reloadConfig();
        return true;
    }
    return false;
}

module.exports = {
    getAllModels,
    getOnlineModel,
    addOnlineModel,
    deleteOnlineModel,
    isOnlineModel
};
