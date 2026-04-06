// src/utils/paths.js
// pkg-compatible path resolution — must be used for ALL file reads/writes of bundled assets
const path = require('path');

// Executable directory when packaged with pkg, otherwise __dirname
const BASE_PATH = process.pkg
  ? path.dirname(process.execPath)
  : path.join(__dirname, '..', '..');

const ROOT_PATH = BASE_PATH;

// Paths to bundled config files
const HEEBA_JSON_PATH  = path.join(ROOT_PATH, 'heeba.json');
const CREDENTIALS_PATH = path.join(ROOT_PATH, 'credentials.json');
const ENGINE_DIR       = path.join(ROOT_PATH, 'engine');
const MODELS_DIR       = path.join(ENGINE_DIR, 'models');
const ENGINE_EXE       = path.join(ENGINE_DIR, 'inference-engine', 'llama-cli.exe');

// Runtime data directories (created on first run)
const CACHE_DIR = path.join(ROOT_PATH, '.cache', 'email');
const EXPORT_DIR = path.join(ROOT_PATH, 'exports');
const DOWNLOADS_DIR = path.join(ROOT_PATH, 'downloads', 'email');
const AUTOMATION_DIR = path.join(ROOT_PATH, 'src', 'email', 'automation');
const STATIC_PATH = path.join(ROOT_PATH, 'src', 'web', 'client');

module.exports = {
  BASE_PATH,
  ROOT_PATH,
  HEEBA_JSON_PATH,
  CREDENTIALS_PATH,
  ENGINE_DIR,
  MODELS_DIR,
  ENGINE_EXE,
  CACHE_DIR,
  EXPORT_DIR,
  DOWNLOADS_DIR,
  AUTOMATION_DIR,
  STATIC_PATH
};
