// src/ui/components.js
const blessed = require('blessed');
const { C, STYLES } = require('./theme');

function initScreen() {
  return blessed.screen({
    smartCSR: true,
    title: 'Heeba',
    fullUnicode: true,
    forceUnicode: true,
    colorDepth: 256,
    resizeTimeout: 100,
    mouse: true,
  });
}

function createUI(screen) {
  const container = blessed.box({
    parent: screen, top: 0, left: 0, width: '100%', height: '100%', bg: C.bg
  });

  const welcomeCard = blessed.box({
    parent: container, top: 1, left: 1, width: '100%-2', height: 11,
    hidden: true, bg: C.bg, border: STYLES.border
  });

  const modeIndicator = blessed.text({
    parent: welcomeCard, top: 0, left: 1, content: '[*] DINO', fg: C.green, bold: true
  });

  const cardTitle = blessed.text({
    parent: welcomeCard, top: 0, left: 8, content: '| Heeba : Task Mode', fg: C.fg
  });

  blessed.line({
    parent: welcomeCard, top: 1, left: 0, width: '100%-0', orientation: 'horizontal', style: { fg: C.border }
  });

  const cardBody = blessed.box({
    parent: welcomeCard, top: 2, left: 0, width: '100%', height: 8, bg: C.bg
  });

  const mascotEl = blessed.text({
    parent: cardBody, top: 0, left: 2, width: 22, content: '', fg: C.green
  });

  const infoBox = blessed.box({
    parent: cardBody, top: 0, left: 26, width: '100%-28', height: 8, bg: C.bg
  });

  blessed.text({ parent: infoBox, top: 0, left: 0, content: 'Welcome back, Kavi', fg: C.fg, bold: true });

  const statusLinesEl = blessed.text({
    parent: infoBox, top: 2, left: 0, width: '100%', content: '', fg: C.dim
  });

  const engineInfoEl = blessed.text({
    parent: infoBox, top: 4, left: 0, width: '100%', content: '', fg: C.dark
  });

  blessed.text({ parent: infoBox, top: 5, left: 0, content: 'TIPS', fg: C.dark, bold: true });

  const tipsText = blessed.text({
    parent: infoBox, top: 6, left: 0, width: '100%', content: '', fg: C.dim
  });

  const outputArea = blessed.box({
    parent: container, top: 13, left: 1, width: '100%-2', height: '100%-19',
    hidden: true, scrollable: true, alwaysScroll: false, bg: C.bg,
    scrollbar: STYLES.scrollbar, mouse: true
  });

  const inputContainer = blessed.box({
    parent: container, bottom: 1, left: 1, width: '100%-2', height: 5,
    hidden: true, bg: C.bg, border: STYLES.border
  });

  const promptText = blessed.text({
    parent: inputContainer, top: 1, left: 2, content: '[heeba-task]', fg: C.green
  });

  blessed.text({
    parent: inputContainer, top: 1, left: 15, content: '>', fg: C.dark
  });

  const inputBox = blessed.textbox({
    parent: inputContainer, top: 1, left: 18, width: '100%-22', height: 3,
    style: { bg: C.bg, fg: C.fg }, inputOnFocus: true
  });

  const footer = blessed.text({
    parent: container, bottom: 0, left: 1, width: '100%-2',
    content: '  Shift+Space: Switch mode  •  "help" for commands  •  "q" to quit', fg: C.dark
  });

  return {
    container, welcomeCard, modeIndicator, cardTitle, mascotEl, 
    statusLinesEl, engineInfoEl, tipsText, outputArea, inputContainer, 
    promptText, inputBox, footer
  };
}

module.exports = { initScreen, createUI };
