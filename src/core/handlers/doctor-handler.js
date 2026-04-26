// src/core/handlers/doctor-handler.js
// System diagnostics — checks all dependencies and configurations like `flutter doctor`

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const {
  ROOT_PATH, ENGINE_EXE, MODELS_DIR, HEEBA_JSON_PATH, EXPORT_DIR, CACHE_DIR, DOWNLOADS_DIR
} = require('../../utils/paths');
const { getAllModels, isOnlineModel } = require('../model-registry');

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM    = '\x1b[90m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

const tick = `${GREEN}${BOLD}[✓]${RESET}`;
const cross = `${RED}${BOLD}[✗]${RESET}`;
const warn = `${YELLOW}${BOLD}[!]${RESET}`;

function branch(items, issues) {
  const lines = [];
  const all = [
    ...items.map(t => ({ text: t.text, ok: true, reason: t.reason })),
    ...issues.map(t => ({ text: t.text, ok: false, reason: t.reason }))
  ];
  all.forEach(item => {
    const icon = item.ok ? tick : cross;
    lines.push(`    ${icon} ${item.text}${item.reason ? DIM + ` — ${item.reason}` + RESET : ''}`);
  });
  return lines;
}

// ── Platform ──────────────────────────────────────────────────────────────────
function checkPlatform() {
  const items = [];
  const issues = [];

  items.push({ text: `Node.js ${process.version.replace(/^v/, '')}`, reason: null });
  items.push({ text: `${os.platform()} ${os.arch}, ${os.cpus().length} CPUs`, reason: null });
  const free = (os.freemem() / (1024 ** 3)).toFixed(1);
  const total = (os.totalmem() / (1024 ** 3)).toFixed(1);
  items.push({ text: `${free} / ${total} GB RAM`, reason: null });

  return { items, issues };
}

// ── Network ──────────────────────────────────────────────────────────────────
function checkNetwork() {
  const items = [];
  const issues = [];

  try {
    require('dns').lookupSync('google.com');
    items.push({ text: `Internet connection`, reason: `online models will work` });
  } catch (e) {
    issues.push({ text: `Internet connection offline`, reason: `online models won't work — enable network to use them` });
  }

  const proxies = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy']
    .filter(v => process.env[v]);
  items.push({ text: proxies.length ? `Proxy: ${proxies.join(', ')}` : `Proxy: none`, reason: null });

  return { items, issues };
}

// ── Engine ────────────────────────────────────────────────────────────────────
function checkEngine() {
  const items = [];
  const issues = [];

  const exe = fs.existsSync(ENGINE_EXE);
  if (exe) {
    items.push({ text: `llama-cli found`, reason: null });
    try {
      const v = execSync(`"${ENGINE_EXE}" --version 2>&1`, { timeout: 3000, windowsHide: true })
        .toString().trim().split('\n')[0];
      items.push({ text: `llama-cli ${v}`, reason: null });
    } catch (e) {}
  } else {
    issues.push({ text: `llama-cli not found`, reason: `download llama.cpp and place llama-cli.exe in the engine dir` });
  }

  const mdir = fs.existsSync(MODELS_DIR);
  if (mdir) {
    const files = fs.readdirSync(MODELS_DIR).filter(f => f.endsWith('.gguf') || f.endsWith('.bin'));
    items.push({ text: `models dir (${files.length} file${files.length !== 1 ? 's' : ''})`, reason: null });
  } else {
    issues.push({ text: `models dir missing`, reason: `create the models dir and add your GGUF files` });
  }

  return { items, issues };
}

// ── Models ────────────────────────────────────────────────────────────────────
function checkModels() {
  const items = [];
  const issues = [];

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
    items.push({ text: `Local: ${sizes.join(', ')}${local.length > 3 ? ` +${local.length - 3}` : ''}`, reason: null });
  } else {
    issues.push({ text: `No local models found`, reason: `add GGUF model files to the models directory` });
  }

  if (online.length) {
    items.push({ text: `Online: ${online.map(m => m.replace(' (Online)', '').replace(' (Legacy)', '')).join(', ')}`, reason: `requires internet connection` });
  }

  return { items, issues };
}

// ── Config ────────────────────────────────────────────────────────────────────
function checkConfig() {
  const items = [];
  const issues = [];

  if (!fs.existsSync(HEEBA_JSON_PATH)) {
    issues.push({ text: `heeba.json not found`, reason: `run heeba setup or copy heeba.json from the repo` });
    return { items, issues };
  }

  try {
    const cfg = JSON.parse(fs.readFileSync(HEEBA_JSON_PATH, 'utf8'));
    const id = cfg.heeba_identity || {};
    items.push({ text: `${id.name || 'Heeba'} v${id.version || '?'}`, reason: null });
    items.push({ text: `${cfg.intent_routing_rules ? Object.keys(cfg.intent_routing_rules).length : 0} intent rules`, reason: null });

    if (!cfg.browserEnabled) {
      issues.push({ text: `Browser disabled in heeba.json`, reason: `set browserEnabled to true to enable web automation` });
    }

    const accs = cfg.email_accounts || [];
    if (accs.length === 0) {
      issues.push({ text: `No email accounts configured`, reason: `add email accounts in heeba.json to enable email features` });
    } else {
      items.push({ text: `${accs.length} email account${accs.length > 1 ? 's' : ''}`, reason: null });
    }
  } catch (e) {
    issues.push({ text: `heeba.json parse error`, reason: e.message });
  }

  return { items, issues };
}

// ── Browser ───────────────────────────────────────────────────────────────────
function checkPlaywright() {
  const items = [];
  const issues = [];

  try {
    require('playwright');
    items.push({ text: `playwright installed`, reason: null });

    const browsers = ['chromium', 'firefox', 'webkit'].filter(b =>
      fs.existsSync(path.join(ROOT_PATH, 'node_modules', 'playwright', `.local-${b}`))
    );

    if (browsers.length === 0) {
      issues.push({ text: `No browsers installed`, reason: `run: npx playwright install` });
    } else {
      items.push({ text: `Browsers: ${browsers.join(', ')}`, reason: null });
    }
  } catch (e) {
    issues.push({ text: `playwright not installed`, reason: `run: npm install playwright` });
  }

  return { items, issues };
}

// ── Dirs ──────────────────────────────────────────────────────────────────────
function checkDirs() {
  const items = [];
  const issues = [];

  const dirs = [
    [EXPORT_DIR, 'exports'],
    [CACHE_DIR, 'email cache'],
    [DOWNLOADS_DIR, 'downloads'],
  ];

  dirs.forEach(([p, label]) => {
    if (fs.existsSync(p)) {
      items.push({ text: label, reason: null });
    } else {
      issues.push({ text: `${label} dir missing`, reason: `create this directory to enable file exports` });
    }
  });

  return { items, issues };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function runDoctor() {
  const lines = [];

  const sections = [
    { label: `Platform`, icon: tick, checks: checkPlatform() },
    { label: `Network`, icon: null, checks: checkNetwork() },
    { label: `Engine`, icon: null, checks: checkEngine() },
    { label: `Models`, icon: null, checks: checkModels() },
    { label: `Config`, icon: null, checks: checkConfig() },
    { label: `Browser`, icon: null, checks: checkPlaywright() },
    { label: `Dirs`, icon: null, checks: checkDirs() },
  ];

  // Determine section icons based on issues
  sections.forEach(s => {
    const hasIssues = s.checks.issues.length > 0;
    const allOk = s.checks.items.length > 0 && s.checks.issues.length === 0;
    if (s.checks.items.length === 0 && s.checks.issues.length === 0) {
      s.icon = null;
    } else if (hasIssues) {
      s.icon = cross;
    } else {
      s.icon = tick;
    }
  });

  const totalIssues = sections.reduce((sum, s) => sum + s.checks.issues.length, 0);

  // Header
  const osRel = os.release().replace(/^(\d+\.\d+\.\d+).*/,'$1');
  const headerIcon = totalIssues === 0 ? tick : cross;
  lines.push(`${headerIcon} HEEBA DOCTOR — System Diagnostics`);
  lines.push(`${DIM}   ${process.version.replace(/^v/, '')} ${os.platform()} [Version ${osRel}]${RESET}`);
  lines.push(``);

  // Sections as tree
  sections.forEach(({ label, icon, checks }) => {
    if (checks.items.length === 0 && checks.issues.length === 0) return;

    const sectionIcon = icon || tick;
    lines.push(`${sectionIcon} ${label}`);

    const all = [
      ...checks.items.map(t => ({ text: t.text, ok: true, reason: t.reason })),
      ...checks.issues.map(t => ({ text: t.text, ok: false, reason: t.reason }))
    ];

    all.forEach(item => {
      const itemIcon = item.ok ? tick : cross;
      const reason = item.reason ? `${DIM}— ${item.reason}${RESET}` : '';
      lines.push(`   ${itemIcon} ${item.text} ${reason}`.trimEnd());
    });

    lines.push(``);
  });

  // Summary
  if (totalIssues === 0) {
    lines.push(`${tick} No issues found.`);
  } else {
    lines.push(`${warn} ${totalIssues} issue${totalIssues > 1 ? 's' : ''} found.`);
  }

  lines.push(``);

  return lines.join('\n');
}

// Handler exposed as run_doctor to match intent routing action name
async function run_doctor(params, context) {
  const output = await runDoctor();
  return { success: true, message: output };
}

module.exports = { runDoctor, doctor_run: run_doctor };
