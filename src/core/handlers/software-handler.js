// src/core/handlers/software-handler.js
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const { formatGenericTable } = require('../../utils/table-gen');

const isWindows = os.platform() === 'win32';

// Store last list for "open #N" and "uninstall #N" referencing
let lastSoftwareList = [];

// Helper: Execute PowerShell command
function executePowerShell(command) {
  return new Promise((resolve) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
      shell: false,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        message: stdout.trim(),
        stderr: stderr.trim(),
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

// Helper: Execute Unix shell command
function executeShell(command) {
  return new Promise((resolve) => {
    const proc = spawn('/bin/sh', ['-c', command], {
      shell: false,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stderr.on('data', (data) => { stderr += data.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        message: stdout.trim(),
        stderr: stderr.trim(),
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

const softwareHandlers = {

  /**
   * List installed software
   * Windows: queries HKLM/HKCU registry via PowerShell
   * Linux: parses dpkg -l
   */
  list_software: async (params, context) => {
    if (isWindows) {
      return await listSoftwareWindows(context);
    } else {
      return await listSoftwareLinux(context);
    }
  },

  /**
   * Open a software application by index
   */
  open_software: async (params) => {
    const index = parseInt(params.index) - 1;
    if (isNaN(index) || index < 0 || index >= lastSoftwareList.length) {
      return {
        success: false,
        message: `Invalid index. Say "list software" to see available apps with their numbers.`
      };
    }

    const sw = lastSoftwareList[index];
    if (!sw._installLocation && !sw._exePath) {
      return {
        success: false,
        message: `Install location unknown for "${sw.Name}". Try launching from the Start Menu directly.`
      };
    }

    const target = sw._installLocation || sw._exePath;

    if (isWindows) {
      const result = await executePowerShell(`Start-Process "${target}"`);
      if (result.success) {
        return { success: true, message: `Launching ${sw.Name}...` };
      } else {
        return { success: false, message: `Failed to launch ${sw.Name}: ${result.message}` };
      }
    } else {
      const result = await executeShell(`"${target}" &`);
      if (result.success) {
        return { success: true, message: `Launching ${sw.Name}...` };
      } else {
        return { success: false, message: `Failed to launch ${sw.Name}: ${result.message}` };
      }
    }
  },

  /**
   * Uninstall a software application by index
   */
  uninstall_software: async (params) => {
    const index = parseInt(params.index) - 1;
    if (isNaN(index) || index < 0 || index >= lastSoftwareList.length) {
      return {
        success: false,
        message: `Invalid index. Say "list software" to see installed apps with their numbers.`
      };
    }

    const sw = lastSoftwareList[index];

    if (isWindows) {
      const uninstallString = sw._uninstallString;

      if (!uninstallString) {
        return {
          success: false,
          message: `No uninstall information found for "${sw.Name}". Try uninstalling from Settings > Apps.`
        };
      }

      let cmd = uninstallString;
      // Handle MSI-based uninstalls
      if (uninstallString.toLowerCase().includes('msiexec')) {
        const match = uninstallString.match(/\{[A-F0-9-]+\}/i);
        if (match) {
          cmd = `msiexec /x${match[0]} /qn`;
        }
      }

      const result = await executePowerShell(cmd);
      if (result.success || result.exitCode === 3010) {
        // 3010 = success, restart required
        return {
          success: true,
          message: `Uninstalling ${sw.Name}... This may take a moment. You may need to confirm in a UAC prompt.`
        };
      } else {
        return {
          success: false,
          message: `Uninstall failed for ${sw.Name}: ${result.message}. You may need to run as Administrator.`
        };
      }
    } else {
      // Linux: use apt remove
      if (!sw._packageName) {
        return {
          success: false,
          message: `Package name unknown for "${sw.Name}". Uninstall manually via: sudo apt remove <package>`
        };
      }
      const result = await executeShell(`echo "${sw._packageName}" | xargs -I{} sudo apt remove -y {}`);
      if (result.success) {
        return { success: true, message: `Removing ${sw.Name}...` };
      } else {
        return { success: false, message: `Remove failed for ${sw.Name}: ${result.message}` };
      }
    }
  }
};

// --- Windows Implementation ---
async function listSoftwareWindows(context) {
  const psCommand = `
$software = @()
$paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
            'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
            'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')
foreach ($p in $paths) {
  Get-ItemProperty $p -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
    $software += [PSCustomObject]@{
      Name = $_.DisplayName
      Version = $_.DisplayVersion
      Publisher = $_.Publisher
      InstallDate = $_.InstallDate
      UninstallString = $_.UninstallString
      InstallLocation = $_.InstallLocation
    }
  }
}
$software | Sort-Object Name -Unique | ConvertTo-Json -Compress
`.replace(/\n/g, ' ');

  const result = await executePowerShell(psCommand);
  if (!result.success) {
    return { success: false, message: `Failed to list software: ${result.message}` };
  }

  let softwareList = [];
  try {
    const parsed = JSON.parse(result.message);
    softwareList = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    return { success: false, message: 'Failed to parse software list. Your system may have no software installed.' };
  }

  lastSoftwareList = softwareList;

  const columns = [
    { key: 'Name', name: 'Name', width: 35 },
    { key: 'Version', name: 'Version', width: 16 },
    { key: 'Publisher', name: 'Publisher', width: 22 },
    { key: 'InstallDate', name: 'Installed', width: 12 }
  ];

  const rows = softwareList.map((sw, i) => ({
    Name: sw.Name || '',
    Version: sw.Version || 'N/A',
    Publisher: sw.Publisher || 'N/A',
    InstallDate: sw.InstallDate || 'N/A',
    _uninstallString: sw.UninstallString || '',
    _installLocation: sw.InstallLocation || ''
  }));

  const table = formatGenericTable({
    title: ' Installed Software',
    columns,
    rows,
    context
  });

  return {
    success: true,
    message: `${table}\n\nSay "open #" to launch an app or "uninstall #" to remove it.`
  };
}

// --- Linux Implementation ---
async function listSoftwareLinux(context) {
  const result = await executeShell(`dpkg -l | grep ^ii | awk '{print $2, $3}' | head -200`);
  if (!result.success) {
    return { success: false, message: `Failed to list software: ${result.message}` };
  }

  const lines = result.message.split('\n').filter(l => l.trim());
  const softwareList = lines.map(line => {
    const parts = line.split(/\s+/);
    const name = parts[0] || '';
    const version = parts[1] || 'N/A';
    return {
      Name: name,
      Version: version,
      _packageName: name
    };
  });

  lastSoftwareList = softwareList;

  const columns = [
    { key: 'Name', name: 'Package', width: 40 },
    { key: 'Version', name: 'Version', width: 20 }
  ];

  const rows = softwareList.map(sw => ({
    Name: sw.Name || '',
    Version: sw.Version || 'N/A'
  }));

  const table = formatGenericTable({
    title: ' Installed Packages',
    columns,
    rows,
    context
  });

  return {
    success: true,
    message: `${table}\n\nSay "open #" to open an app or "uninstall #" to remove a package.`
  };
}

module.exports = softwareHandlers;
