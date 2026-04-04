// src/utils/stats-refresher.js
const { getTotalTokensUsed } = require('../core/engine');
const { requestRender } = require('../ui/render-manager');

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

function refreshStats(UI, screen) {
  try {
    // RAM
    const mem = process.memoryUsage();
    const ramMB = Math.round(mem.rss / 1024 / 1024);
    UI.ramTag.setContent(`RAM: ${ramMB}MB`);

    // Uptime
    const uptime = Math.floor(process.uptime());
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const s = uptime % 60;
    UI.uptimeTag.setContent(`UpTime: ${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);

    // Tokens
    UI.tokenTag.setContent(`Tokens: ${getTotalTokensUsed() || 0}`);

    // CPU
    const currentCpuUsage = process.cpuUsage(lastCpuUsage);
    const currentTime = Date.now();
    const timeDelta = (currentTime - lastCpuTime) * 1000;
    const cpuPercent = Math.min(100, Math.round((currentCpuUsage.user + currentCpuUsage.system) / timeDelta * 100));
    UI.cpuTag.setContent(`CPU: ${cpuPercent}%`);
    
    lastCpuUsage = process.cpuUsage();
    lastCpuTime = currentTime;

    requestRender();
  } catch (err) { }
}

module.exports = { refreshStats };
