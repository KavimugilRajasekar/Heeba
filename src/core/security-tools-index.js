// src/core/security-tools-index.js
// Scans Security-KB folders and builds tools_index.json at runtime
const fs = require('fs');
const path = require('path');

const BASE_PATH = process.pkg
    ? path.dirname(process.execPath)
    : path.join(__dirname, '..', '..');

const SECURITY_KB_PATH = path.join(BASE_PATH, 'Security-KB');
const TOOLS_INDEX_PATH = path.join(SECURITY_KB_PATH, 'tools_index.json');

function buildToolsIndex() {
    const index = { Windows: {}, Linux: {}, Mac: {} };

    const folders = ['Windows-Security-KB', 'Linux-Security-KB', 'Mac-Security-KB'];

    for (const folder of folders) {
        const folderPath = path.join(SECURITY_KB_PATH, folder);
        if (!fs.existsSync(folderPath)) continue;

        const os = folder.replace('-Security-KB', '');
        const files = fs.readdirSync(folderPath).filter(f => f.endsWith('.json'));

        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(folderPath, file), 'utf8');
                const tool = JSON.parse(content);

                const category = tool.category || 'General';
                if (!index[os][category]) index[os][category] = [];

                index[os][category].push({
                    tool: tool.tool_name,
                    description: tool.description || '',
                    use_when: extractUseWhen(tool)
                });
            } catch (e) {
                // Skip malformed files
            }
        }
    }

    // Write to tools_index.json
    fs.writeFileSync(TOOLS_INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
    return index;
}

function extractUseWhen(tool) {
    const useCases = [];

    // Collect use_when from flags
    if (tool.flags) {
        for (const flag of tool.flags) {
            if (flag.security_use_case && flag.automation_safe) {
                useCases.push(flag.security_use_case);
            }
        }
    }

    // Collect from powerful_combinations
    if (tool.powerful_combinations) {
        for (const combo of tool.powerful_combinations) {
            if (combo.security_context) {
                useCases.push(combo.security_context);
            }
        }
    }

    return useCases.slice(0, 5); // Limit to 5 entries
}

function loadToolsIndex() {
    if (!fs.existsSync(TOOLS_INDEX_PATH)) {
        return buildToolsIndex();
    }
    try {
        const content = fs.readFileSync(TOOLS_INDEX_PATH, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        return buildToolsIndex();
    }
}

function getToolsForOS(os) {
    const index = loadToolsIndex();
    return index[os] || {};
}

function getToolKBPath(os, toolName) {
    const folderMap = { Windows: 'Windows-Security-KB', Linux: 'Linux-Security-KB', Mac: 'Mac-Security-KB' };
    const folder = folderMap[os];
    if (!folder) return null;

    const toolPath = path.join(SECURITY_KB_PATH, folder, `${toolName}.json`);
    if (fs.existsSync(toolPath)) return toolPath;

    // Try exact match with filename
    const files = fs.readdirSync(path.join(SECURITY_KB_PATH, folder));
    const match = files.find(f => f.toLowerCase().replace('.json', '') === toolName.toLowerCase());
    return match ? path.join(SECURITY_KB_PATH, folder, match) : null;
}

function loadToolKB(os, toolName) {
    const kbPath = getToolKBPath(os, toolName);
    if (!kbPath) return null;
    try {
        return JSON.parse(fs.readFileSync(kbPath, 'utf8'));
    } catch (e) {
        return null;
    }
}

module.exports = { buildToolsIndex, loadToolsIndex, getToolsForOS, loadToolKB };