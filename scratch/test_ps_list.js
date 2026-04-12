const { spawn } = require('child_process');

function executePowerShell(command) {
  return new Promise((resolve) => {
    // Note: We MUST wrap the command in quotes or use standard input for complex scripts
    // but spawn with -Command usually handles a single string argument.
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
  });
}

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
    }
  }
}
$software | Sort-Object Name -Unique | Select-Object -First 5 | ConvertTo-Json -Compress
`;

executePowerShell(psCommand).then(result => {
    console.log('Success:', result.success);
    console.log('Message:', result.message);
    console.log('Stderr:', result.stderr);
    console.log('JSON Parse Test:', !!JSON.parse(result.message));
}).catch(err => {
    console.error('Error:', err);
});
