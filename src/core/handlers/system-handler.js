// src/core/handlers/system-handler.js
const fs = require('fs');
const { spawn } = require('child_process');
const { getHeebaConfig, reloadConfig } = require('../config-loader');
const { HEEBA_JSON_PATH } = require('../../utils/paths');

const systemHandlers = {
  get_system_info: async () => {
    const os = require('os');
    const { version } = require('../../../package.json');
    const uptime = Math.floor(os.uptime() / 3600);
    const freeMem = (os.freemem() / (1024 * 1024 * 1024)).toFixed(2);
    const totalMem = (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2);

    const TreeReporter = require('../../utils/tree-reporter');
    const tree = new TreeReporter('System Status', `Heeba v${version}`);
    
    tree.branch('Platform', `${os.platform()} (${os.arch()})`)
        .leaf('Host', os.hostname())
        .leaf('Uptime', `${uptime} hours`);
        
    tree.branch('CPU', os.cpus()[0].model)
        .leaf('Cores', os.cpus().length);
        
    tree.branch('Memory', `${totalMem} GB total`)
        .leaf('Free', `${freeMem} GB`);

    return { success: true, message: tree.toString() };
  },

  exec_security_command: async (params, callbacks = {}) => {
    const { command, reason, stepNumber, silent = false } = params;
    const { onStdout, onComplete } = callbacks;
    if (!command) {
      return { success: false, message: 'No command provided' };
    }

    const isWindows = require('os').platform() === 'win32';
    const stepLabel = stepNumber ? `[Step ${stepNumber}]` : '';
    let result = { stdout: '', stderr: '', exitCode: null };

    if (!silent) console.log(`\x1b[35m${stepLabel ? stepLabel + ' ' : ''}⚡ Executing:\x1b[0m ${command}`);

    return new Promise((resolve) => {
      const shell = isWindows ? 'powershell.exe' : '/bin/sh';
      const args = isWindows
        ? ['-NoProfile', '-Command', command]
        : ['-c', command];

      const proc = spawn(shell, args, { shell: false, windowsHide: true });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        onStdout?.(chunk);
      });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('close', (code) => {
        result.stdout = stdout;
        result.stderr = stderr;
        result.exitCode = code;
        const execResult = {
          success: code === 0,
          message: stdout || stderr,
          exitCode: code,
          reason: reason || '',
          raw_output: stdout + (stderr ? '\n[STDERR]\n' + stderr : '')
        };
        if (stepLabel && !silent) {
          if (execResult.success) {
            console.log(`\x1b[32m${stepLabel} ✓ Command succeeded\x1b[0m (exit: 0)`);
          } else {
            console.log(`\x1b[31m${stepLabel} ✗ Command failed\x1b[0m (exit: ${code})`);
          }
        }
        onComplete?.(execResult);
        resolve(execResult);
      });

      proc.on('error', (err) => {
        const execResult = {
          success: false,
          message: err.message,
          reason: reason || ''
        };
        if (stepLabel && !silent) console.log(`\x1b[31m${stepLabel} ✗ Command error:\x1b[0m ${err.message}`);
        onComplete?.(execResult);
        resolve(execResult);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        proc.kill();
        const execResult = {
          success: false,
          message: 'Command timed out after 30 seconds',
          reason: reason || ''
        };
        if (stepLabel && !silent) console.log(`\x1b[33m${stepLabel} ⏱ Command timed out\x1b[0m after 30 seconds`);
        onComplete?.(execResult);
        resolve(execResult);
      }, 30000);
    });
  },

  get_security_findings: async () => {
    const os = require('os');
    const platform = os.platform();

    if (platform === 'win32') {
      return {
        success: true,
        message: 'Security findings summary not yet available. Run a security audit first.',
        platform
      };
    } else {
      return {
        success: true,
        message: 'Security findings summary not yet available. Run a security audit first.',
        platform
      };
    }
  },

  run_security_audit: async (params, context) => {
    // This is called by the intent-executor when security intent is triggered
    // The actual loop runs in intent-executor.js runSecurityAuditLoop
    return {
      success: true,
      message: 'Security audit initiated. Running recursive agent loop...',
      action: 'run_security_audit'
    };
  },

  test_endpoint: async (params) => {
    const { url, method = 'GET', body, headers = {} } = params;
    if (!url) return { success: false, message: 'No URL provided' };

    const isWindows = require('os').platform() === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/sh';
    
    // Construct curl command
    let curlCmd = `curl -X ${method} "${url}" -i --max-time 10`;
    
    // Add headers
    Object.keys(headers).forEach(key => {
      curlCmd += ` -H "${key}: ${headers[key]}"`;
    });

    // Add body if exists
    if (body) {
      const bodyStr = typeof body === 'object' ? JSON.stringify(body).replace(/"/g, '\\"') : body.replace(/"/g, '\\"');
      curlCmd += ` -d "${bodyStr}"`;
    }

    const { spawn } = require('child_process');
    return new Promise((resolve) => {
      const args = isWindows ? ['-NoProfile', '-Command', curlCmd] : ['-c', curlCmd];
      const proc = spawn(shell, args, { shell: false, windowsHide: true });

      let output = '';
      proc.stdout.on('data', (d) => output += d.toString());
      proc.stderr.on('data', (d) => output += d.toString());

      proc.on('close', (code) => {
        resolve({
          success: code === 0,
          message: output.trim(),
          exitCode: code,
          url,
          method
        });
      });

      proc.on('error', (err) => resolve({ success: false, message: err.message }));
      setTimeout(() => { proc.kill(); resolve({ success: false, message: 'Request timed out' }); }, 12000);
    });
  }
};

module.exports = systemHandlers;
