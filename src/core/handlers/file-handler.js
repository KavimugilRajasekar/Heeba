// src/core/handlers/file-handler.js
const fs = require('fs');
const path = require('path');

const fileHandlers = {
  analyze_file: async (params) => {
    const { file_path } = params;
    if (!file_path) return { success: false, message: 'No file path provided.' };

    const absolutePath = path.isAbsolute(file_path) ? file_path : path.join(process.cwd(), file_path);

    if (!fs.existsSync(absolutePath)) {
      return { success: false, message: `File not found: ${file_path}` };
    }

    try {
      const stats = fs.statSync(absolutePath);
      const isDir = stats.isDirectory();
      const size = isDir ? 'N/A' : `${(stats.size / 1024).toFixed(2)} KB`;
      const created = stats.birthtime.toLocaleString();
      const modified = stats.mtime.toLocaleString();
      const type = isDir ? 'Directory' : path.extname(absolutePath) || 'File';

      let msg = `[File Analysis: ${path.basename(absolutePath)}]\n`;
      msg += `  ◈ Type: ${type}\n`;
      msg += `  ◈ Size: ${size}\n`;
      msg += `  ◈ Created: ${created}\n`;
      msg += `  ◈ Modified: ${modified}\n`;
      msg += `  ◈ Path: ${absolutePath}`;

      return { success: true, message: msg };
    } catch (err) {
      return { success: false, message: `Error analyzing file: ${err.message}` };
    }
  }
};

module.exports = fileHandlers;
