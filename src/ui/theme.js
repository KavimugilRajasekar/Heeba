// src/ui/theme.js

const C = {
  bg: '#000000',
  bg2: '#000000',
  bg3: '#101010',
  border: '#4c4c58',
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
