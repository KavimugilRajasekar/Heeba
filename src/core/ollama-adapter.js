// src/core/ollama-adapter.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { buildSystemPrompt } = require('../utils/helpers');

let isLLMRunning = false;
let conversationHistory = [];
let totalTokensUsed = 0;

function loadOllamaCredentials() {
    try {
        const credPath = path.join(process.cwd(), 'credentials.json');
        if (fs.existsSync(credPath)) {
            return JSON.parse(fs.readFileSync(credPath, 'utf8'));
        }
    } catch (e) {}
    return null;
}

function queryOllama(userInput, mode, CONFIG, onToken) {
    return new Promise((resolve, reject) => {
        if (isLLMRunning) {
            reject(new Error('LLM is already busy'));
            return;
        }
        isLLMRunning = true;

        const credentials = loadOllamaCredentials();
        if (!credentials || !credentials.ollama || !credentials.ollama.api_key) {
            isLLMRunning = false;
            reject(new Error('Ollama credentials not found'));
            return;
        }

        const { api_key, endpoint, models: credentialModels } = credentials.ollama;
        
        // Strip "(Online)" if present and find the actual model name
        const cleanVirtualName = CONFIG.model.replace(' (Online)', '').trim();
        const modelEntry = credentialModels.find(m => m.virtual_name === cleanVirtualName);
        const modelName = modelEntry ? modelEntry.actual_model : 'gpt-oss:120b'; 

        const systemPrompt = buildSystemPrompt(mode);
        let fullPrompt;
        
        if (mode === 'auto' && conversationHistory.length > 0) {
            let history = conversationHistory.map(e => `USER: ${e.user}\nASST: ${e.assistant}`).join('\n');
            fullPrompt = `${systemPrompt}\n\n${history}\n\nUSER: ${userInput}\nASST:`;
        } else {
            fullPrompt = `${systemPrompt}\n\nUSER: ${userInput}\nASST:`;
        }

        const postData = JSON.stringify({
            model: modelName,
            prompt: fullPrompt,
            stream: false,
            options: {
                temperature: 0.7,
                top_p: 0.9
            }
        });

        const url = new URL(endpoint);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${api_key}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let fullResponse = '';

            res.on('data', (chunk) => {
                fullResponse += chunk.toString();
            });

            res.on('end', () => {
                isLLMRunning = false;
                try {
                    const json = JSON.parse(fullResponse);
                    if (json.response) {
                        if (mode === 'auto') {
                            conversationHistory.push({ user: userInput, assistant: json.response });
                            if (conversationHistory.length > 10) conversationHistory.shift();
                        }
                        totalTokensUsed += json.eval_count || 0;
                        if (onToken) {
                            onToken(json.response);
                        }
                        resolve(json.response);
                    } else {
                        reject(new Error('Invalid response from Ollama API'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse Ollama response: ' + e.message));
                }
            });
        });

        req.on('error', (e) => {
            isLLMRunning = false;
            reject(new Error('Ollama API request failed: ' + e.message));
        });

        req.write(postData);
        req.end();
    });
}

function cancelLLM() {
    isLLMRunning = false;
}

function getLLMStatus() {
    return isLLMRunning;
}

function clearConversationHistory() {
    conversationHistory = [];
}

function getTotalTokensUsed() {
    return totalTokensUsed;
}

function getAvailableVirtualModels() {
    const credentials = loadOllamaCredentials();
    if (!credentials || !credentials.ollama || !credentials.ollama.models) {
        return [];
    }
    return credentials.ollama.models.map(m => m.virtual_name);
}

function isVirtualModel(modelName) {
    const credentials = loadOllamaCredentials();
    if (!credentials || !credentials.ollama || !credentials.ollama.models) {
        return false;
    }
    // Handle both "name" and "name (Online)" formats
    const cleanName = modelName.replace(' (Online)', '').trim();
    return credentials.ollama.models.some(m => m.virtual_name === cleanName);
}

async function testOllamaConnection(apiKey, endpoint, modelName) {
    // Perform a minimal completion request to verify credentials
    const postData = JSON.stringify({
        model: modelName,
        prompt: "hi",
        stream: false,
        options: { num_predict: 1 }
    });

    try {
        const url = new URL(endpoint);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 5000
        };

        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                if (res.statusCode === 200) resolve({ success: true });
                else resolve({ success: false, message: `HTTP ${res.statusCode}` });
            });
            req.on('error', (e) => resolve({ success: false, message: e.message }));
            req.write(postData);
            req.end();
        });
    } catch (e) {
        return { success: false, message: e.message };
    }
}

module.exports = {
    queryOllama,
    cancelOllama: cancelLLM,
    getOllamaStatus: getLLMStatus,
    clearOllamaHistory: clearConversationHistory,
    getOllamaTokens: getTotalTokensUsed,
    getAvailableVirtualModels,
    isVirtualModel,
    testOllamaConnection
};
