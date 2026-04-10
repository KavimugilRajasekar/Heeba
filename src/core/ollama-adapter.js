// src/core/ollama-adapter.js
const https = require('https');
const fs = require('fs');
const { CREDENTIALS_PATH } = require('../utils/paths');
const { buildSystemPrompt } = require('../utils/helpers');
const { isOnlineModel, getOnlineModel } = require('./model-registry');

let isLLMRunning = false;
let conversationHistory = [];
let totalTokensUsed = 0;

function loadOllamaCredentials() {
    try {
        if (fs.existsSync(CREDENTIALS_PATH)) {
            return JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
        }
    } catch (e) {}
    return null;
}

function queryOllama(userInput, mode, CONFIG, onToken, history = []) {
    return new Promise((resolve, reject) => {
        if (isLLMRunning) {
            reject(new Error('LLM is already busy'));
            return;
        }
        isLLMRunning = true;


        // Get model config from model-registry
        const modelConfig = getOnlineModel(CONFIG.model);
        if (!modelConfig) {
            isLLMRunning = false;
            reject(new Error('Online model not found in registry'));
            return;
        }

        const { api_key, base_url, endpoint } = modelConfig;
        const targetUrl = base_url || endpoint;
        const modelName = modelConfig.model;

        const systemPrompt = buildSystemPrompt(mode);
        let fullPrompt;

        const effectiveHistory = (history && history.length > 0) ? history : conversationHistory;

        if (mode === 'auto' && effectiveHistory.length > 0) {
            let historyText = effectiveHistory.map(e => `USER: ${e.user || e.prompt}\nASST: ${e.assistant || e.response}`).join('\n');
            fullPrompt = `${systemPrompt}\n\n${historyText}\n\nUSER: ${userInput}\nASST:`;
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

        let url;
        try {
            url = new URL(targetUrl);
        } catch (err) {
            isLLMRunning = false;
            reject(new Error(`Invalid Online Model URL: "${targetUrl}". Please ensure the URL starts with http:// or https://`));
            return;
        }

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${api_key}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const agent = url.protocol === 'https:' ? require('https') : require('http');
        const req = agent.request(options, (res) => {
            let fullResponse = '';

            res.on('data', (chunk) => {
                fullResponse += chunk.toString();
            });

            res.on('end', () => {
                isLLMRunning = false;
                try {
                    const json = JSON.parse(fullResponse);
                    let responseText = null;

                    // Ollama format: json.response
                    if (json.response) {
                        responseText = json.response;
                    }
                    // OpenRouter text format: choices[0].text
                    else if (json.choices && json.choices[0] && json.choices[0].text) {
                        responseText = json.choices[0].text;
                    }
                    // OpenAI/standard format: choices[0].message.content
                    else if (json.choices && json.choices[0] && json.choices[0].message) {
                        responseText = json.choices[0].message.content;
                    }
                    // Generic fallback
                    else if (typeof json === 'string') {
                        responseText = json;
                    }

                    if (responseText) {
                        if (mode === 'auto') {
                            conversationHistory.push({ user: userInput, assistant: responseText });
                            if (conversationHistory.length > 10) conversationHistory.shift();
                        }
                        totalTokensUsed += json.eval_count || json.usage?.total_tokens || 0;
                        if (onToken) {
                            onToken(responseText);
                        }
                        resolve(responseText);
                    } else {
                        reject(new Error('Invalid response format from API'));
                    }
                } catch (e) {
                    reject(new Error('Failed to parse API response: ' + e.message));
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
    // Delegate to model-registry for comprehensive check
    return isOnlineModel(modelName);
}

async function testOllamaConnection(apiKey, targetUrl, modelName) {
    // Perform a minimal completion request to verify credentials
    const postData = JSON.stringify({
        model: modelName,
        prompt: "hi",
        stream: false,
        options: { num_predict: 1 }
    });

    try {
        const url = new URL(targetUrl);
        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 5000
        };

        const agent = url.protocol === 'https:' ? require('https') : require('http');
        return new Promise((resolve) => {
            const req = agent.request(options, (res) => {
                if (res.statusCode === 200) resolve({ success: true });
                else resolve({ success: false, message: `HTTP ${res.statusCode}` });
            });
            req.on('error', (e) => resolve({ success: false, message: e.message }));
            req.write(postData);
            req.end();
        });
    } catch (e) {
        return { success: false, message: `Invalid URL: ${targetUrl}. Ensure it includes http:// or https://` };
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
