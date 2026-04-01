// src/core/engine.js
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { buildSystemPrompt } = require('../utils/helpers');

let isLLMRunning = false;
let serverProcess = null;
let conversationHistory = [];
const SERVER_PORT = 5786;

let totalTokensUsed = 0;


function ensureServerRunning(CONFIG) {
    return new Promise((resolve, reject) => {
        if (serverProcess) return resolve();

        const serverPath = CONFIG.engine.replace('llama-cli.exe', 'llama-server.exe');
        const modelPath = path.join(process.cwd(), 'engine', 'models', CONFIG.model);

        serverProcess = spawn(serverPath, [
            '-m', modelPath,
            '--port', String(SERVER_PORT),
            '-t', String(CONFIG.threads),
            '-c', String(CONFIG.contextLength),
            '--log-disable'
        ], { shell: false, windowsHide: true });

        // Wait for server to be ready
        let ready = false;
        serverProcess.stdout.on('data', (data) => {
            if (data.toString().includes('HTTP server listening')) {
                ready = true;
                resolve();
            }
        });

        // Fallback resolve after 10s if we don't see the log
        setTimeout(() => { if (!ready) resolve(); }, 10000);

        serverProcess.on('error', (err) => {
            serverProcess = null;
            reject(err);
        });
    });
}

async function queryLLM(userInput, mode, CONFIG, onToken) {
    if (isLLMRunning) throw new Error('LLM is already busy');
    isLLMRunning = true;

    try {
        await ensureServerRunning(CONFIG);
        
        const systemPrompt = buildSystemPrompt(mode);
        let prompt;
        if (mode === 'auto' && conversationHistory.length > 0) {
            let history = conversationHistory.map(e => `USER: ${e.user}\nASST: ${e.assistant}`).join('\n');
            prompt = `${systemPrompt}\n\n${history}\n\nUSER: ${userInput}\nASST:`;
        } else {
            prompt = `${systemPrompt}\n\nUSER: ${userInput}\nASST:`;
        }

        const postData = JSON.stringify({
            prompt: prompt,
            n_predict: 100,
            stop: ["USER:", "\nUSER"],
            stream: !!onToken
        });

        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port: SERVER_PORT,
                path: '/completion',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, (res) => {
                let fullResponse = '';
                let buffer = '';

                res.on('data', (chunk) => {
                    if (onToken) {
                        buffer += chunk.toString();
                        const lines = buffer.split('\n');
                        buffer = lines.pop(); // Keep partial line

                        for (const line of lines) {
                            if (line.trim().startsWith('data:')) {
                                try {
                                    const json = JSON.parse(line.replace('data:', '').trim());
                                    if (json.content) {
                                        fullResponse += json.content;
                                        totalTokensUsed++; // Approximate token count
                                        onToken(json.content);
                                    }
                                } catch (e) {}
                            }
                        }
                    } else {
                        fullResponse += chunk.toString();
                    }
                });

                res.on('end', () => {
                    isLLMRunning = false;
                    try {
                        let finalContent;
                        if (onToken) {
                            finalContent = fullResponse.trim();
                        } else {
                            const json = JSON.parse(fullResponse);
                            finalContent = json.content.trim();
                        }

                        if (mode === 'auto') {
                            conversationHistory.push({ user: userInput, assistant: finalContent });
                            if (conversationHistory.length > 10) conversationHistory.shift();
                        }
                        resolve(finalContent);
                    } catch (e) {
                        reject(new Error('Invalid response from LLM server'));
                    }
                });
            });

            req.on('error', (e) => {
                isLLMRunning = false;
                reject(new Error('Could not connect to LLM server. Is it running?'));
            });

            req.write(postData);
            req.end();
        });

    } catch (err) {
        isLLMRunning = false;
        throw err;
    }
}

function cancelLLM() {
    // With server mode, we don't necessarily kill the server, 
    // but we can flag the UI to ignore the pending request.
    isLLMRunning = false;
}

function stopServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
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

module.exports = { queryLLM, cancelLLM, getLLMStatus, clearConversationHistory, stopServer, getTotalTokensUsed };

