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
      return { success: false, message: `✘ Move failed: ${result.message}` };
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
      return { success: false, message: `✘ Copy failed: ${result.message}` };
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
        return { success: false, message: `✘ Cannot delete system path: ${filePath}` };
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
      return { success: false, message: `✘ Delete failed: ${result.message}` };
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
      return { success: false, message: `✘ A file already exists at destination: ${newPath}` };
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
        message: `✔ Renamed "${path.basename(filePath)}" → "${newName}"\n  New path: ${newPath}`
      };
    } else {
      return { success: false, message: `✘ Rename failed: ${result.message}` };
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
  },

  /**
   * Test an HTTP endpoint using OS-native tools (curl / Invoke-WebRequest)
   * @param {Object} params - { url: string, method?: string, body?: string, headers?: object }
   */
  /**
   * Run an arbitrary shell command
   * @param {Object} params - { command: string }
   */
  run_command: async (params) => {
    const { command } = params;
    if (!command) return { success: false, message: 'No command provided. Usage: run_command { command: "git branch -r" }' };

    const result = await execCommand(command);
    const output = result.message || '';

    // Format git branch output as a tree (but preserve git log graph structure)
    if (command.trim().startsWith('git branch')) {
      const TreeReporter = require('../../utils/tree-reporter');
      const isRemote = command.includes('-r');
      const tree = new TreeReporter(
        'Git Branches',
        isRemote ? 'Remote branches' : 'Local branches'
      );

      const lines = output.split('\n').filter(l => l.trim());
      if (lines.length === 0) {
        return { success: true, message: tree.toString() + '\n  (empty)' };
      }

      lines.forEach(line => {
        const cleaned = line.replace(/^\* /, '  ').trim();
        if (cleaned) tree.branch(cleaned);
      });

      return { success: result.success, message: tree.toString() };
    }

    // For git log (especially --graph), return raw output to preserve tree structure
    if (command.trim().startsWith('git log')) {
      // If --graph is used, return raw output so the git graph chars (* | / \) are preserved
      if (command.includes('--graph')) {
        return { success: result.success, message: output };
      }
      // Otherwise format as tree
      const TreeReporter = require('../../utils/tree-reporter');
      const tree = new TreeReporter('Git Commit History', 'Recent commits');
      const lines = output.split('\n').filter(l => l.trim());
      lines.slice(0, 20).forEach(line => tree.branch(line.trim()));
      if (lines.length > 20) tree.branch(`... and ${lines.length - 20} more commits`);
      return { success: result.success, message: tree.toString() };
    }

    return {
      success: result.success,
      message: output
    };
  },

  /**
   * Test an HTTP endpoint using OS-native tools (curl / Invoke-WebRequest)
   * @param {Object} params - { url: string, method?: string, body?: string, headers?: object }
   */
  test_endpoint: async (params) => {
    const { url, method = 'GET', body, headers } = params;
    if (!url) return { success: false, message: 'No URL provided. Usage: test_endpoint { url: "http://localhost:3000/api" }' };

    const startTime = Date.now();
    let cmd;

    if (isWindows) {
      // PowerShell Invoke-WebRequest with timing
      let psCmd = `try { $sw = [System.Diagnostics.Stopwatch]::StartNew(); `;
      psCmd += `$r = Invoke-WebRequest -Uri '${url}' -Method ${method} -UseBasicParsing -TimeoutSec 10`;
      if (body) {
        psCmd += ` -Body '${body.replace(/'/g, "''")}'`;
        psCmd += ` -ContentType 'application/json'`;
      }
      if (headers && typeof headers === 'object') {
        const headerEntries = Object.entries(headers);
        if (headerEntries.length > 0) {
          const headerStr = headerEntries.map(([k, v]) => `'${k}'='${v}'`).join(';');
          psCmd += ` -Headers @{${headerStr}}`;
        }
      }
      psCmd += `; $sw.Stop(); `;
      psCmd += `Write-Output "STATUS: $($r.StatusCode) $($r.StatusDescription)"; `;
      psCmd += `Write-Output "LATENCY: $($sw.ElapsedMilliseconds)ms"; `;
      psCmd += `Write-Output "BODY: $($r.Content.Substring(0, [Math]::Min(500, $r.Content.Length)))"; `;
      psCmd += `} catch { Write-Output "STATUS: ERROR"; Write-Output "LATENCY: $([Math]::Round(([System.Diagnostics.Stopwatch]::GetTimestamp() - $sw.ElapsedTicks) / [System.Diagnostics.Stopwatch]::Frequency * 1000))ms"; Write-Output "ERROR: $($_.Exception.Message)" }`;
      cmd = psCmd;
    } else {
      // curl with timing on Unix
      let curlCmd = `curl -s -o /tmp/heeba_test_body.txt -w "STATUS: %{http_code}\\nLATENCY: %{time_total}s\\n" -X ${method} '${url}' --max-time 10`;
      if (body) {
        curlCmd += ` -d '${body}' -H 'Content-Type: application/json'`;
      }
      if (headers && typeof headers === 'object') {
        Object.entries(headers).forEach(([k, v]) => {
          curlCmd += ` -H '${k}: ${v}'`;
        });
      }
      curlCmd += ` && echo "BODY: $(head -c 500 /tmp/heeba_test_body.txt)"`;
      cmd = curlCmd;
    }

    const result = await execCommand(cmd);
    const elapsed = Date.now() - startTime;
    const output = result.message || '';

    // Parse status
    const statusMatch = output.match(/STATUS:\s*(.+)/);
    const latencyMatch = output.match(/LATENCY:\s*(.+)/);
    const bodyMatch = output.match(/BODY:\s*([\s\S]*?)(?:$|ERROR:)/);
    const errorMatch = output.match(/ERROR:\s*(.+)/);

    const status = statusMatch ? statusMatch[1].trim() : (result.success ? 'OK' : 'ERROR');
    const latency = latencyMatch ? latencyMatch[1].trim() : `${elapsed}ms`;
    const responseBody = bodyMatch ? bodyMatch[1].trim() : '';
    const error = errorMatch ? errorMatch[1].trim() : '';

    let msg = `[Endpoint Test: ${method} ${url}]\n`;
    msg += `  ◈ Status: ${status}\n`;
    msg += `  ◈ Latency: ${latency}\n`;
    if (responseBody) msg += `  ◈ Response: ${responseBody.substring(0, 200)}`;
    if (error) msg += `  ◈ Error: ${error}`;

    const isSuccess = !error && !status.includes('ERROR') && result.success;
    return { success: isSuccess, message: msg, status, latency };
  }
};

module.exports = fileHandlers;
