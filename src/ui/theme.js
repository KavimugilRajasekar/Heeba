// src/ui/theme.js

const C = {
  bg: '#0a0a0c',
  bg2: '#111114',
  bg3: '#18181c',
  border: '#2a2a32',
  fg: '#ededef',
  dim: '#8b8b96',
  dark: '#5c5c66',
  cyan: '#79c0ff',
  green: '#7ee787',
  yellow: '#e3b341',
  purple: '#d2a8ff',
  red: '#ff7b72',
};

const STYLES = {
  border: { type: 'line', fg: C.border },
  box: { bg: C.bg, fg: C.fg },
  scrollbar: { ch: ' ', track: { bg: C.bg2 }, style: { bg: C.border } },
};

module.exports = { C, STYLES };
