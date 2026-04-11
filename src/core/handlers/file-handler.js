// src/core/handlers/file-handler.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const isWindows = os.platform() === 'win32';

// Helper: Execute system command (PowerShell on Windows, /bin/sh on Unix)
function execCommand(command) {
  return new Promise((resolve) => {
    let proc;
    if (isWindows) {
      proc = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
        shell: false,
        windowsHide: true
      });
    } else {
      proc = spawn('/bin/sh', ['-c', command], {
        shell: false,
        windowsHide: true
      });
    }

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        message: stdout.trim() || stderr.trim(),
        exitCode: code
      });
    });

    proc.on('error', (err) => {
      resolve({ success: false, message: err.message });
    });

    setTimeout(() => {
      proc.kill();
      resolve({ success: false, message: 'Command timed out after 30 seconds' });
    }, 30000);
  });
}

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
  },

  /**
   * Move a file or folder to a new location
   * @param {Object} params - { source: string, destination: string }
   */
  move_file: async (params) => {
    const { source, destination } = params;
    if (!source) return { success: false, message: 'Usage: move_file { source: "/full/path/file", destination: "/full/path/dest" }' };
    if (!destination) return { success: false, message: 'Usage: move_file { source: "/full/path/file", destination: "/full/path/dest" }' };

    if (!fs.existsSync(source)) {
      return { success: false, message: `Source not found: ${source}` };
    }

    let cmd;
    if (isWindows) {
      cmd = `Move-Item -Path "${source}" -Destination "${destination}" -Force`;
    } else {
      cmd = `mv -f "${source}" "${destination}"`;
    }

    const TreeReporter = require('../../utils/tree-reporter');
    const tree = new TreeReporter('File Operation', 'Restructuring assets');
    const result = await execCommand(cmd);

    if (result.success) {
      tree.branch('Action', 'Move Item')
          .leaf('From', source)
          .leaf('To', destination)
          .complete('Moved Successfully');
      return { success: true, message: tree.toString() };
    } else {
      return { success: false, message: `✗ Move failed: ${result.message}` };
    }
  },

  /**
   * Copy a file or folder to a new location
   * @param {Object} params - { source: string, destination: string }
   */
  copy_file: async (params) => {
    const { source, destination } = params;
    if (!source) return { success: false, message: 'Usage: copy_file { source: "/full/path/file", destination: "/full/path/dest" }' };
    if (!destination) return { success: false, message: 'Usage: copy_file { source: "/full/path/file", destination: "/full/path/dest" }' };

    if (!fs.existsSync(source)) {
      return { success: false, message: `Source not found: ${source}` };
    }

    let cmd;
    if (isWindows) {
      cmd = `Copy-Item -Path "${source}" -Destination "${destination}" -Recurse -Force`;
    } else {
      cmd = `cp -r "${source}" "${destination}"`;
    }

    const result = await execCommand(cmd);
    const TreeReporter = require('../../utils/tree-reporter');
    const tree = new TreeReporter('File Operation', 'Duplicating assets');

    if (result.success) {
      tree.branch('Action', 'Copy Item')
          .leaf('Source', source)
          .leaf('Dest', destination)
          .complete('Copied Successfully');
      return { success: true, message: tree.toString() };
    } else {
      return { success: false, message: `✗ Copy failed: ${result.message}` };
    }
  },

  /**
   * Delete a file or folder
   * @param {Object} params - { path: string, recursive?: boolean }
   */
  delete_file: async (params) => {
    const { path: filePath, recursive } = params;
    if (!filePath) return { success: false, message: 'Usage: delete_file { path: "/full/path" }' };

    if (!fs.existsSync(filePath)) {
      return { success: false, message: `Path not found: ${filePath}` };
    }

    // Safety check: don't allow deletion of system directories
    const normalizedPath = path.normalize(filePath).toLowerCase();
    const dangerousPaths = [
      process.env.SystemRoot || 'c:\\windows',
      '/bin', '/sbin', '/usr/bin', '/usr/sbin', '/etc',
      process.env.HOME || '', process.cwd()
    ];
    for (const danger of dangerousPaths) {
      if (danger && normalizedPath.startsWith(path.normalize(danger).toLowerCase())) {
        return { success: false, message: `✗ Cannot delete system path: ${filePath}` };
      }
    }

    let cmd;
    if (isWindows) {
      cmd = recursive
        ? `Remove-Item -Path "${filePath}" -Recurse -Force`
        : `Remove-Item -Path "${filePath}" -Force`;
    } else {
      cmd = recursive ? `rm -rf "${filePath}"` : `rm -f "${filePath}"`;
    }

    const result = await execCommand(cmd);
    const TreeReporter = require('../../utils/tree-reporter');
    const tree = new TreeReporter('File Operation', 'Cleanup');

    if (result.success) {
      tree.branch('Action', 'Delete Item')
          .leaf('Target', filePath)
          .complete('Deleted Successfully');
      return { success: true, message: tree.toString() };
    } else {
      return { success: false, message: `✗ Delete failed: ${result.message}` };
    }
  },

  /**
   * Rename a file or folder
   * @param {Object} params - { path: string, newName: string }
   */
  rename_file: async (params) => {
    const { path: filePath, newName } = params;
    if (!filePath) return { success: false, message: 'Usage: rename_file { path: "/full/path/file", newName: "newname" }' };
    if (!newName) return { success: false, message: 'Usage: rename_file { path: "/full/path/file", newName: "newname" }' };

    if (!fs.existsSync(filePath)) {
      return { success: false, message: `Path not found: ${filePath}` };
    }

    const parentDir = path.dirname(filePath);
    const newPath = path.join(parentDir, newName);

    if (fs.existsSync(newPath)) {
      return { success: false, message: `✗ A file already exists at destination: ${newPath}` };
    }

    let cmd;
    if (isWindows) {
      cmd = `Rename-Item -Path "${filePath}" -NewName "${newName}"`;
    } else {
      cmd = `mv "${filePath}" "${newPath}"`;
    }

    const result = await execCommand(cmd);

    if (result.success) {
      return {
        success: true,
        message: `✓ Renamed "${path.basename(filePath)}" → "${newName}"\n  New path: ${newPath}`
      };
    } else {
      return { success: false, message: `✗ Rename failed: ${result.message}` };
    }
  },

  /**
   * List contents of a directory
   * @param {Object} params - { path: string }
   */
  list_dir: async (params) => {
    const { path: dirPath } = params;
    const target = dirPath || '.';
    const absolutePath = path.isAbsolute(target) ? target : path.join(process.cwd(), target);

    if (!fs.existsSync(absolutePath)) {
      return { success: false, message: `Directory not found: ${target}` };
    }

    try {
      const items = fs.readdirSync(absolutePath);
      let msg = `[Directory Listing: ${path.basename(absolutePath) || target}]\n`;
      items.forEach(item => {
        const stats = fs.statSync(path.join(absolutePath, item));
        const type = stats.isDirectory() ? '[DIR]' : '     ';
        msg += `  ${type} ${item}\n`;
      });
      return { success: true, message: msg };
    } catch (err) {
      return { success: false, message: `Error listing directory: ${err.message}` };
    }
  },

  /**
   * Read file content
   * @param {Object} params - { path: string }
   */
  read_file: async (params) => {
    const { path: filePath } = params;
    if (!filePath) return { success: false, message: 'No path provided' };
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
      return { success: false, message: `File not found: ${filePath}` };
    }

    try {
      const content = fs.readFileSync(absolutePath, 'utf8');
      return { success: true, message: content };
    } catch (err) {
      return { success: false, message: `Error reading file: ${err.message}` };
    }
  }
};

module.exports = fileHandlers;
