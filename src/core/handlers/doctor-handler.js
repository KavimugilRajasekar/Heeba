// src/core/handlers/doctor-handler.js
// System diagnostics — checks all dependencies and configurations like `flutter doctor`

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const {
  ROOT_PATH, ENGINE_EXE, MODELS_DIR, CREDENTIALS_PATH,
  HEEBA_JSON_PATH, EXPORT_DIR, CACHE_DIR, DOWNLOADS_DIR
} = require('../../utils/paths');
const { getAllModels, isOnlineModel, getOnlineModel } = require('../model-registry');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM    = '\x1b[90m';
const RESET  = '\x1b[0m';

const tick  = `${GREEN}✓${RESET}`;
const cross = `${RED}✗${RESET}`;
const warn  = `${YELLOW}!${RESET}`;

function mark(ok, warning) {
  if (ok) return tick;
  if (warning) return warn;
  return cross;
}

// ── Platform ──────────────────────────────────────────────────────────────────
function checkPlatform() {
  const issues = [];
  const ok = [];

  ok.push(`Node.js ${process.version}`);
  ok.push(`${os.platform()} ${os.arch}, ${os.cpus().length} CPUs`);
  const free = (os.freemem() / (1024 ** 3)).toFixed(1);
  const total = (os.totalmem() / (1024 ** 3)).toFixed(1);
  ok.push(`${free} / ${total} GB RAM`);

  return { ok, issues };
}

// ── Network ──────────────────────────────────────────────────────────────
function checkNetwork() {
  const issues = [];
  const ok = [];

  try {
    require('dns').lookupSync('google.com');
    ok.push('Internet connection');
  } catch (e) {
    issues.push('Internet connection offline');
  }

  const proxies = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']
    .filter(v => process.env[v]);
  ok.push(proxies.length ? `Proxy: ${proxies.join(', ')}` : 'Proxy: none');

  return { ok, issues };
}

// ── Engine ────────────────────────────────────────────────────────────────
function checkEngine() {
  const issues = [];
  const ok = [];

  const exe = fs.existsSync(ENGINE_EXE);
  if (exe) {
    ok.push('llama-cli found');
    try {
      const v = execSync(`"${ENGINE_EXE}" --version 2>&1`, { timeout: 3000, windowsHide: true })
        .toString().trim().split('\n')[0];
      ok.push(`llama-cli ${v}`);
    } catch (e) {}
  } else {
    issues.push('llama-cli not found');
  }

  const mdir = fs.existsSync(MODELS_DIR);
  if (mdir) {
    const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.gguf') || f.endsWith('.bin'));
    ok.push(`models dir (${files.length} file${files.length !== 1 ? 's' : ''})`);
  } else {
    issues.push('models dir missing');
  }

  return { ok, issues };
}

// ── Models ────────────────────────────────────────────────────────────────
function checkModels() {
  const issues = [];
  const ok = [];

  const all = getAllModels();
  const local = all.filter(m => !isOnlineModel(m));
  const online = all.filter(m => isOnlineModel(m));

  if (local.length) {
    const top = local.slice(0, 3);
    const sizes = top.map(m => {
      const s = fs.existsSync(path.join(MODELS_DIR, m.split(' (')[0]))
        ? fs.statSync(path.join(MODELS_DIR, m.split(' (')[0]))
        : null;
      return s ? `${m.split(' (')[0]} (${(s.size / 1024**3).toFixed(2)} GB)` : m.split(' (')[0];
    });
    ok.push(`Local: ${sizes.join(', ')}${local.length > 3 ? ` +${local.length - 3}` : ''}`);
  } else {
    issues.push('No local models found');
  }

  if (online.length) {
    ok.push(`Online: ${online.map(m => m.replace(' (Online)', '').replace(' (Legacy)', '')).join(', ')}`);
  }

  return { ok, issues };
}

// ── Config (heeba.json + credentials) ────────────────────────────────────
function checkConfig() {
  const issues = [];
  const ok = [];

  if (!fs.existsSync(HEEBA_JSON_PATH)) {
    issues.push('heeba.json not found');
    return { ok, issues };
  }

  try {
    const cfg = JSON.parse(fs.readFileSync(HEEBA_JSON_PATH, 'utf8'));
    const id = cfg.heeba_identity || {};
    ok.push(`${id.name || 'Heeba'} v${id.version || '?'}`);
    ok.push(`${cfg.intent_routing_rules ? Object.keys(cfg.intent_routing_rules).length : 0} intent rules`);

    if (!cfg.browserEnabled) {
      issues.push('Browser disabled in heeba.json');
    }

    const accs = cfg.email_accounts || [];
    if (accs.length === 0) {
      issues.push('No email accounts configured');
    } else {
      ok.push(`${accs.length} email account${accs.length > 1 ? 's' : ''}`);
    }
  } catch (e) {
    issues.push(`heeba.json parse error: ${e.message}`);
  }

  return { ok, issues };
}

// ── Playwright / Browser ──────────────────────────────────────────────────
function checkPlaywright() {
  const issues = [];
  const ok = [];

  try {
    require('playwright');
    ok.push('playwright installed');

    const browsers = ['chromium', 'firefox', 'webkit'].filter(b =>
      fs.existsSync(path.join(ROOT_PATH, 'node_modules', 'playwright', `.local-${b}`))
    );

    if (browsers.length === 0) {
      issues.push('No browsers installed (run: npx playwright install)');
    } else {
      ok.push(`Browsers: ${browsers.join(', ')}`);
    }
  } catch (e) {
    issues.push('playwright not installed');
  }

  return { ok, issues };
}

// ── Runtime dirs ─────────────────────────────────────────────────────────
function checkDirs() {
  const issues = [];
  const ok = [];

  const dirs = [
    [EXPORT_DIR, 'exports'],
    [CACHE_DIR, 'email cache'],
    [DOWNLOADS_DIR, 'downloads'],
  ];

  dirs.forEach(([p, label]) => {
    if (fs.existsSync(p)) {
      ok.push(label);
    } else {
      issues.push(`${label} dir missing`);
    }
  });

  return { ok, issues };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function runDoctor() {
  const lines = [];

  lines.push(`\n  HEEBA DOCTOR  —  System Diagnostics\n`);

  const sections = [
    { label: 'Platform', checks: checkPlatform() },
    { label: 'Network', checks: await checkNetwork() },
    { label: 'Engine', checks: checkEngine() },
    { label: 'Models', checks: checkModels() },
    { label: 'Config', checks: checkConfig() },
    { label: 'Browser', checks: checkPlaywright() },
    { label: 'Dirs', checks: checkDirs() },
  ];

  let totalIssues = 0;

  sections.forEach(({ label, checks }) => {
    if (checks.ok.length === 0 && checks.issues.length === 0) return;

    lines.push(`  ${label}`);
    checks.ok.forEach(t => lines.push(`    ${tick} ${t}`));
    checks.issues.forEach(t => {
      totalIssues++;
      lines.push(`    ${cross} ${t}`);
    });
  });

  lines.push('');
  if (totalIssues === 0) {
    lines.push(`  ${tick} All checks passed!`);
  } else {
    lines.push(`  ${warn} ${totalIssues} issue${totalIssues > 1 ? 's' : ''} found`);
  }

  lines.push(`\n  Run \`heeba --help\` for usage.\n`);

  return lines.join('\n');
}

// Handler exposed as run_doctor to match intent routing action name
async function run_doctor(params, context) {
  const output = await runDoctor();
  return { success: true, message: output };
}

module.exports = { runDoctor, doctor_run: run_doctor };
