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
    ignoreTabs: false,
    ignoreLockedKeys: true
  });
}

function createUI(screen) {
  const container = blessed.box({
    parent: screen, top: 0, left: 0, width: '100%', height: '100%', bg: C.bg
  });

  // =============================================
  // TOP BAR (like Claude Code)
  // =============================================
  const topBar = blessed.box({
    parent: container,
    top: 0,
    left: 1,
    width: '100%-2',
    height: 3,
    bg: C.bg2,
    border: { type: 'line', fg: C.border },
    padding: { right: 1 }
  });

  // App name badge - HEEBA
  const appBadge = blessed.text({
    parent: topBar,
    top: 0,
    left: 1,
    content: '█ HEEBA',
    fg: C.green,
    bold: true
  });

  // Mode indicator in Top Bar
  const topModeIndicator = blessed.text({
    parent: topBar,
    top: 0,
    left: 11,
    content: '● DINO',
    fg: C.green,
    bold: true
  });

  // Separator
  blessed.text({
    parent: topBar,
    top: 0,
    left: 20,
    content: '│',
    fg: C.border
  });

  // Model name
  const modelTag = blessed.text({
    parent: topBar,
    top: 0,
    left: 22,
    content: 'SelectedModel: granite4350m',
    fg: C.dim
  });

  // Vertical line separator
  blessed.text({
    parent: topBar,
    top: 0,
    right: 50,
    content: '│',
    fg: C.border
  });

  // System Stats (Right-aligned)
  const tokenTag = blessed.text({
    parent: topBar, top: 0, right: 2, content: 'Tokens: 0', fg: C.yellow
  });

  const uptimeTag = blessed.text({
    parent: topBar, top: 0, right: 14, content: 'UpTime: 0:00:00', fg: C.dim
  });

  const ramTag = blessed.text({
    parent: topBar, top: 0, right: 31, content: 'RAM: 0MB', fg: C.cyan
  });

  const cpuTag = blessed.text({
    parent: topBar, top: 0, right: 42, content: 'CPU: 0%', fg: C.purple
  });


  // =============================================
  // MAIN WELCOME CARD
  // =============================================
  const welcomeCard = blessed.box({
    parent: container,
    top: 3,
    left: 1,
    width: '100%-2',
    height: 11,
    hidden: true,
    bg: C.bg,
    padding: { right: 0 }
  });

  // --- MANUAL PILLAR BORDERS ---
  // Top Line
  const topBorderLine = blessed.box({
    parent: welcomeCard,
    top: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '◈' + '─'.repeat(200), // blessed will clip to size
    fg: C.border,
    wrap: false
  });
  const trCorner = blessed.text({
    parent: topBorderLine, top: 0, right: 0, content: '◈', fg: C.border
  });

  // Bottom Line
  const bottomBorderLine = blessed.box({
    parent: welcomeCard,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    content: '◈' + '─'.repeat(200),
    fg: C.border,
    wrap: false
  });
  const brCorner = blessed.text({
    parent: bottomBorderLine, top: 0, right: 0, content: '◈', fg: C.border
  });

  // Header separator line
  const headerSeparator = blessed.box({
    parent: welcomeCard,
    top: 2,
    left: 2,
    width: '100%-4',
    height: 1,
    content: '─'.repeat(200),
    fg: C.border,
    wrap: false
  });

  // Card header bar
  const cardHeaderBar = blessed.box({
    parent: welcomeCard,
    top: 1, // Row immediately below top border
    left: 0,
    width: '100%', // Use full width now that side borders are gone
    height: 1,
    bg: C.bg2
  });

  const modeIndicator = blessed.text({
    parent: cardHeaderBar,
    top: 0,
    left: 1,
    content: '● DINO',
    fg: C.green,
    bold: true
  });

  const cardTitle = blessed.text({
    parent: cardHeaderBar,
    top: 0,
    left: 10,
    content: 'Heeba Task Mode',
    fg: C.dim
  });



  // Card body
  const cardBody = blessed.box({
    parent: welcomeCard,
    top: 3, // Below header and separator
    left: 0,
    width: '100%', // Use full width now that side borders are gone
    height: 7, 
    bg: C.bg
  });

  // Left column: Mascot
  const mascotEl = blessed.text({
    parent: cardBody,
    top: 0,
    left: 2,
    width: 20,
    content: '',
    fg: C.green
  });

  // Vertical separator between mascot and info
  blessed.text({
    parent: cardBody,
    top: 0,
    left: 23,
    height: 7,
    content: '│\n'.repeat(7),
    fg: C.border
  });

  // Right column: Info
  const infoBox = blessed.box({
    parent: cardBody,
    top: 0,
    left: 25,
    width: '100%-27',
    height: 7,
    bg: C.bg
  });

  blessed.text({
    parent: infoBox,
    top: 0,
    left: 0,
    content: 'Welcome back, Kavi',
    fg: C.fg,
    bold: true
  });

  const statusLinesEl = blessed.text({
    parent: infoBox,
    top: 2,
    left: 0,
    width: '100%',
    content: '',
    fg: C.dim
  });

  const engineInfoEl = blessed.text({
    parent: infoBox,
    top: 4,
    left: 0,
    width: '100%',
    content: '',
    fg: C.dark
  });

  blessed.text({
    parent: infoBox,
    top: 5,
    left: 0,
    content: '─'.repeat(45),
    fg: C.border
  });

  blessed.text({
    parent: infoBox,
    top: 6,
    left: 0,
    content: 'tips',
    fg: C.dark,
    bold: true
  });

  const tipsText = blessed.text({
    parent: infoBox,
    top: 6,
    left: 5,
    width: '100%-5',
    content: '',
    fg: C.dim
  });

  // =============================================
  // OUTPUT AREA (Chat-style scrolling)
  // =============================================
  const outputArea = blessed.box({
    parent: container,
    top: 14,
    left: 1,
    width: '100%-2',
    height: '100%-19',
    hidden: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: STYLES.scrollbar,
    mouse: true,
    // Ensure it scrolls to bottom on new content
    bg: C.bg
  });

  // =============================================
  // INPUT AREA
  // =============================================
  const inputContainer = blessed.box({
    parent: container,
    bottom: 2,
    left: 1,
    width: '100%-2',
    height: 3,
    hidden: true,
    bg: C.bg,
    border: { type: 'line', fg: C.border }
  });

  const promptText = blessed.text({
    parent: inputContainer,
    top: 0,
    left: 1,
    width: 2,
    content: '>',
    fg: C.green,
    bold: true
  });

  blessed.text({
    parent: inputContainer,
    top: 0,
    left: 3,
    content: ' ',
    fg: C.dim
  });

  const inputBox = blessed.textarea({
    parent: inputContainer,
    top: 0,
    left: 4,
    width: '100%-5',
    height: 1,
    style: { bg: C.bg, fg: C.fg },
    inputOnFocus: true,
    focusable: true,
    keys: true,
    mouse: true,
    wrap: true,
    scrollbar: true
  });

  // =============================================
  // BOTTOM BAR (Claude Code style footer)
  // =============================================
  const bottomBar = blessed.box({
    parent: container,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    bg: C.bg2
  });

  // Left section: Simple indicator
  blessed.text({
    parent: bottomBar,
    top: 0,
    left: 1,
    content: '[Shift+Space] mode',
    fg: C.dim
  });

  blessed.text({
    parent: bottomBar,
    top: 0,
    left: 20,
    content: '[↑↓] history',
    fg: C.dim
  });

  blessed.text({
    parent: bottomBar,
    top: 0,
    left: 33,
    content: '[q] quit',
    fg: C.dim
  });

  // Right section: Status
  const footerStatus = blessed.text({
    parent: bottomBar,
    top: 0,
    right: 1,
    width: 10,
    align: 'right',
    content: '● ready',
    fg: C.green
  });

  // =============================================
  // MODEL SELECTION LIST (Centered Modal)
  // =============================================
  const modelList = blessed.list({
    parent: container,
    top: 'center',
    left: 'center',
    width: '50%',
    height: 10,
    hidden: true,
    label: ' {bold}▸ SELECT MODEL ◂{/bold} ',
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    border: { type: 'line', fg: C.purple },
    style: {
      item: { fg: C.fg },
      selected: { fg: C.bg, bg: C.purple, bold: true },
      border: { fg: C.purple },
      label: { fg: C.purple, bold: true },
      bg: C.bg
    },
    scrollbar: STYLES.scrollbar
  });

  return {
    container,
    topBar,
    modelTag,
    topModeIndicator,
    welcomeCard,
    modeIndicator,
    cardTitle,
    mascotEl,
    statusLinesEl,
    engineInfoEl,
    tipsText,
    outputArea,
    inputContainer,
    promptText,
    inputBox,
    bottomBar,
    footerStatus,
    modelList,
    tokenTag,
    uptimeTag,
    ramTag,
    cpuTag
  };
}

module.exports = { initScreen, createUI };
