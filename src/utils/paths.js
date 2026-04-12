// src/utils/paths.js
// pkg-compatible path resolution — must be used for ALL file reads/writes of bundled assets
const path = require('path');

// Detect if running as packaged exe
const IS_PKG = __dirname.includes('snapshot');

// ROOT_PATH: External files that live next to the exe (heeba.json, credentials.json, etc.)
// When pkg: points to the directory containing the exe (dist/)
// When node: points to project root
const ROOT_PATH = IS_PKG
  ? path.dirname(process.execPath)
  : path.join(__dirname, '..', '..');

// SNAPSHOT_ROOT: The root of the virtual filesystem where pkg bundles the project files
// Only valid when running as pkg, otherwise same as ROOT_PATH
const SNAPSHOT_ROOT = IS_PKG
  ? path.join(__dirname, '..', '..')  // goes up from src/utils to C:\snapshot\Heeba
  : ROOT_PATH;

// Paths to bundled config files (external - next to exe)
const HEEBA_JSON_PATH  = path.join(ROOT_PATH, 'heeba.json');
const CREDENTIALS_PATH = path.join(ROOT_PATH, 'credentials.json');
const ENGINE_DIR       = path.join(ROOT_PATH, 'engine');
const MODELS_DIR       = path.join(ENGINE_DIR, 'models');
const ENGINE_EXE       = path.join(ENGINE_DIR, 'inference-engine', 'llama-cli.exe');

// Runtime data directories (external - next to exe)
const CACHE_DIR = path.join(ROOT_PATH, '.cache', 'email');
const EXPORT_DIR = path.join(ROOT_PATH, 'exports');
const DOWNLOADS_DIR = path.join(ROOT_PATH, 'downloads', 'email');
const SESSION_FILE = path.join(ROOT_PATH, 'session.json');

// Bundled source paths (internal - in pkg snapshot)
const AUTOMATION_DIR = path.join(SNAPSHOT_ROOT, 'src', 'email', 'automation');
const STATIC_PATH    = path.join(SNAPSHOT_ROOT, 'src', 'web', 'client');

module.exports = {
  IS_PKG,
  ROOT_PATH,
  SNAPSHOT_ROOT,
  HEEBA_JSON_PATH,
  CREDENTIALS_PATH,
  ENGINE_DIR,
  MODELS_DIR,
  ENGINE_EXE,
  CACHE_DIR,
  EXPORT_DIR,
  DOWNLOADS_DIR,
  SESSION_FILE,
  AUTOMATION_DIR,
  STATIC_PATH
};
