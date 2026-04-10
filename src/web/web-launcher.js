// src/web/web-launcher.js
// Launches the Heeba Web Interface: HTTP + WebSocket server on localhost.

const http = require('http');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { handleWebSocketConnection, handleApiRequest, setWebSocketServer } = require('./web-router');
const { STATIC_PATH } = require('../utils/paths');
const { loadHeebaConfig } = require('../core/config-loader');
const { state, loadSessions, saveSessions } = require('../core/state-manager');

function launchWebMode(port = 7856) {
  // Load config into state and restore persisted sessions
  loadSessions();
  const heebaConfig = loadHeebaConfig();
  Object.assign(state.CONFIG, heebaConfig);

  // Create HTTP server
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      handleApiRequest(req, res);
      return;
    }

    const fs = require('fs');
    const urlPath = req.url.split('?')[0];
    let filePath = path.join(STATIC_PATH, urlPath === '/' ? 'index.html' : urlPath);

    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.ico': 'image/x-icon'
    };

    fs.readFile(filePath, (err, data) => {
      if (err) {
        fs.readFile(path.join(STATIC_PATH, 'index.html'), (err2, indexData) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(indexData);
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
      res.end(data);
    });
  });

  // Create WebSocket server
  const wss = new WebSocketServer({ server });
  setWebSocketServer(wss);

  wss.on('connection', (ws) => {
    handleWebSocketConnection(ws);
  });

  // Start server
  server.listen(port, () => {
    const localIP = getLocalIP();

    console.log();
    console.log('  \x1b[32m\x1b[1mHeeba Web Interface Running\x1b[0m');
    console.log();
    console.log(`  \x1b[36mLocal:   \x1b[0m http://localhost:${port}`);
    console.log(`  \x1b[36mNetwork: \x1b[0m http://${localIP}:${port}`);
    console.log();
    console.log('  \x1b[90mOpen the URL in your browser to access Heeba\x1b[0m');
    console.log();
  });

  process.on('SIGINT', () => {
    saveSessions();
    server.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    saveSessions();
    server.close();
    process.exit(0);
  });
}

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

module.exports = { launchWebMode };
