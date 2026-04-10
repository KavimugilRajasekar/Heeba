// src/core/model-registry.js
// Dynamic model registry: local GGUF + online from credentials.json
const fs = require('fs');
const path = require('path');
const { CREDENTIALS_PATH, MODELS_DIR } = require('../utils/paths');

function getCredentials() {
    try {
        if (fs.existsSync(CREDENTIALS_PATH)) {
            return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        }
    } catch (e) { /* silent */ }
    return {};
}

function saveCredentials(creds) {
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf8');
}

// Load legacy virtual models from credentials.json (ollama.models)
function getLegacyVirtualModels() {
    const creds = getCredentials();
    if (creds.ollama && Array.isArray(creds.ollama.models)) {
        return creds.ollama.models.map(m => ({
            id: m.virtual_name,
            type: 'ollama',
            base_url: creds.ollama.endpoint || 'https://ollama.com/api/generate',
            api_key: creds.ollama.api_key || '',
            model: m.actual_model
        }));
    }
    return [];
}

// Get all models: local GGUF + online from credentials.json + legacy virtual
function getAllModels() {
    // Local GGUF/BIN models
    const localModels = fs.existsSync(MODELS_DIR)
        ? fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.gguf') || f.endsWith('.bin'))
        : [];

    const creds = getCredentials();

    // Online models from credentials.json
    const onlineModels = (creds.online_models || []).map(m => `${m.id} (Online)`);

    // Legacy virtual models (backward compat) - mark with (Legacy) to distinguish
    const legacyModels = getLegacyVirtualModels()
        .filter(lm => !(creds.online_models || []).some(om => om.id === lm.id)) // Don't duplicate if already in online_models
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
    if (!modelName) return null;
    const cleanId = modelName.replace(' (Online)', '').replace(' (Legacy)', '').trim();
    const creds = getCredentials();

    // Check credentials.json online_models first
    if (creds.online_models) {
        const found = creds.online_models.find(m => m.id === cleanId);
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
    if (!modelName) return false;
    const cleanId = modelName.replace(' (Online)', '').replace(' (Legacy)', '').trim();
    const creds = getCredentials();

    // Check credentials.json
    if (creds.online_models?.some(m => m.id === cleanId)) return true;

    // Check legacy
    const legacy = getLegacyVirtualModels();
    if (legacy.some(lm => lm.id === cleanId)) return true;

    return false;
}

// Add online model to credentials.json
function addOnlineModel(entry) {
    const creds = getCredentials();
    if (!creds.online_models) creds.online_models = [];

    const existingIdx = creds.online_models.findIndex(m => m.id === entry.id);
    if (existingIdx >= 0) {
        creds.online_models[existingIdx] = entry;
    } else {
        creds.online_models.push(entry);
    }

    saveCredentials(creds);
    return true;
}

// Delete online model from credentials.json
function deleteOnlineModel(modelId) {
    const creds = getCredentials();
    if (!creds.online_models) return false;

    const idx = creds.online_models.findIndex(m => m.id === modelId);
    if (idx >= 0) {
        creds.online_models.splice(idx, 1);
        saveCredentials(creds);
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
