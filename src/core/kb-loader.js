// src/core/kb-loader.js
// Loads Knowledge Base JSON files for security tools
const fs = require('fs');
const path = require('path');
const { loadToolKB, getToolKBPath } = require('./security-tools-index');

const BASE_PATH = process.pkg
    ? path.dirname(process.execPath)
    : path.join(__dirname, '..', '..');

const SECURITY_KB_PATH = path.join(BASE_PATH, 'Security-KB');

function getOS() {
    const platform = require('os').platform();
    if (platform === 'win32') return 'Windows';
    if (platform === 'linux') return 'Linux';
    if (platform === 'darwin') return 'Mac';
    return 'Windows';
}

function loadKB(toolName, os) {
    const targetOS = os || getOS();
    const kb = loadToolKB(targetOS, toolName);
    return kb;
}

function loadKBWithContext(toolName, os) {
    const kb = loadKB(toolName, os);
    if (!kb) return null;

    // Extract safe flags for automation
    const safeFlags = (kb.flags || [])
        .filter(f => f.automation_safe === true)
        .map(f => ({
            flag: f.flag,
            example_command: f.example_command,
            security_use_case: f.security_use_case,
            safe_followup: f.safe_followup
        }));

    // Extract powerful combinations
    const combinations = (kb.powerful_combinations || []).map(c => ({
        command: c.command,
        security_context: c.security_context
    }));

    return {
        tool_name: kb.tool_name,
        os: kb.os,
        category: kb.category,
        description: kb.description,
        safe_flags: safeFlags,
        powerful_combinations: combinations
    };
}

function formatKBContext(kb) {
    if (!kb) return '';

    let ctx = `[Security Tool: ${kb.tool_name}] OS: ${kb.os} Category: ${kb.category}\n`;
    ctx += `Description: ${kb.description}\n\n`;

    if (kb.safe_flags && kb.safe_flags.length > 0) {
        ctx += `SAFE FLAGS (automation_safe: true):\n`;
        for (const f of kb.safe_flags) {
            ctx += `  ${f.flag}\n`;
            ctx += `    Example: ${f.example_command}\n`;
            ctx += `    Use for: ${f.security_use_case}\n`;
            if (f.safe_followup) ctx += `    Follow up: ${f.safe_followup}\n`;
        }
        ctx += `\n`;
    }

    if (kb.powerful_combinations && kb.powerful_combinations.length > 0) {
        ctx += `POWERFUL COMBINATIONS:\n`;
        for (const c of kb.powerful_combinations) {
            ctx += `  Command: ${c.command}\n`;
            ctx += `  Context: ${c.security_context}\n`;
        }
    }

    return ctx;
}

module.exports = { loadKB, loadKBWithContext, formatKBContext, getOS };