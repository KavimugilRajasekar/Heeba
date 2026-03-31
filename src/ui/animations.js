// src/ui/animations.js
const blessed = require('blessed');
const { C, STYLES } = require('./theme');

function createOverlays(container) {
  // Boot animation box
  const bootAnimBox = blessed.box({
    parent: container, top: 0, left: 0, width: '100%', height: '100%', hidden: true, bg: C.bg
  });

  // Stars - SPREAD ACROSS ENTIRE WINDOW
  const stars = [];
  for (let i = 0; i < 150; i++) {
    const star = blessed.text({
      parent: bootAnimBox,
      top: (Math.random() * 100).toFixed(2) + '%',
      left: (Math.random() * 100).toFixed(2) + '%',
      content: ['*', '.', '·'][Math.floor(Math.random() * 3)],
      fg: [C.cyan, C.purple, C.yellow, C.green][Math.floor(Math.random() * 4)]
    });
    stars.push({
        el: star,
        blinkSpeed: Math.random() > 0.8 ? (0.05 + Math.random() * 0.1) : 0, // Only some stars blink
        phase: Math.random() * Math.PI * 2
    });
  }

  const HEEBA_ART = [
    '██   ██ ███████ ███████ ██████   █████ ',
    '██   ██ ██      ██      ██   ██ ██   ██',
    '███████ █████   █████   ██████  ███████',
    '██   ██ ██      ██      ██   ██ ██   ██',
    '██   ██ ███████ ███████ ██████  ██   ██'
  ];

  const heebaLines = HEEBA_ART.map((line, i) => {
    return blessed.text({
      parent: bootAnimBox,
      top: `50%-${5 - i}`, // Perfectly centered entire group: Lines 0-4 occupy -5 to -1
      left: 'center', // Precise horizontal centering
      content: '', // Start empty for animation
      fg: C.green,
      style: { bold: true }
    });
  });

  const statusText = blessed.text({
    parent: bootAnimBox, 
    top: '50%+1', 
    left: 'center', 
    content: 'Initializing...', 
    fg: C.dim
  });

  const progressText = blessed.text({
    parent: bootAnimBox, 
    top: '50%+3', 
    left: 'center', 
    content: '[                                        ]', 
    fg: C.green, 
    style: { bold: true }
  });

  const percentText = blessed.text({
    parent: bootAnimBox, 
    top: '50%+4', 
    left: 'center', 
    content: '0%', 
    fg: C.dim
  });

  // REMOVED Version text to focus on the centered cluster

  // PERFECT CENTERED LOADING INDICATOR
  const loadingIndicator = blessed.box({
    parent: container, 
    top: '50%-1', // Exact center row
    left: 'center', 
    width: 20, 
    height: 3,
    content: '\n  - Thinking...  ',
    align: 'center',
    fg: C.yellow, 
    hidden: true, 
    bg: C.bg, 
    border: STYLES.border
  });

  // ... (existing modeOverlay logic)
  const modeOverlay = blessed.box({
    parent: container, 
    top: 'center', 
    left: 'center', 
    width: 40, 
    height: 3,
    align: 'center', 
    valign: 'middle', 
    hidden: true, 
    bg: C.bg,
    border: STYLES.border
  });

  const modeOverlayText = blessed.text({
    parent: modeOverlay, top: 0, left: 0, width: '100%-2', align: 'center', content: '', fg: C.dim
  });

  return {
    bootAnimBox, heebaLines, HEEBA_ART, statusText, progressText, percentText, loadingIndicator, modeOverlay, modeOverlayText, stars
  };
}

async function runBootSequence(overlays, ui, screen, CONFIG) {
  const { bootAnimBox, heebaLines, HEEBA_ART, statusText, progressText, percentText, stars } = overlays;
  const { welcomeCard, outputArea, inputContainer, inputBox } = ui;

  bootAnimBox.show();
  screen.render();

  const bootMessages = [
    'Initializing neural pathways...',
    'Loading personality matrix...',
    'Connecting to llama.cpp engine...',
    'Loading model: ' + CONFIG.model,
    'Warming up AI cores...',
    'Almost ready...',
    'Heeba is now online!'
  ];

  const colors = [C.green, C.cyan, C.yellow, C.purple];
  const charDelay = 10; // ms between "pixel" reveals

  // TOTAL CHARS for proportional reveal
  const totalChars = HEEBA_ART.join('').length;

  for (let frame = 0; frame <= 100; frame++) {
    const t = frame / 100;
    const colorIdx = Math.floor(frame / 25) % colors.length;

    // Animate ASCII Art character by character
    // Start with a small baseline so something is visible immediately
    let charsToReveal = Math.floor(t * totalChars);
    if (t > 0 && charsToReveal === 0) charsToReveal = 1;
    
    let cumulativeChars = 0;
    for (let i = 0; i < HEEBA_ART.length; i++) {
        const lineContent = HEEBA_ART[i];
        const lineLen = lineContent.length;
        
        if (cumulativeChars + lineLen <= charsToReveal) {
            heebaLines[i].setContent(lineContent);
        } else if (cumulativeChars < charsToReveal) {
            heebaLines[i].setContent(lineContent.substring(0, charsToReveal - cumulativeChars));
        } else {
            heebaLines[i].setContent('');
        }
        heebaLines[i].style.fg = colors[colorIdx];
        cumulativeChars += lineLen;
    }

    const msgIdx = Math.min(bootMessages.length - 1, Math.floor(t * bootMessages.length * 1.2));
    statusText.setContent(bootMessages[msgIdx]);
    statusText.style.fg = colors[colorIdx];

    const barLen = 40;
    const filled = Math.floor(t * barLen);
    progressText.setContent('[' + '█'.repeat(filled) + '░'.repeat(barLen - filled) + ']');
    percentText.setContent(`${Math.floor(t * 100)}%`);

    // Animate Stars (Twinkle & Fade)
    stars.forEach(s => {
        if (s.blinkSpeed > 0) {
            s.phase += s.blinkSpeed;
            if (Math.sin(s.phase) > 0.5) s.el.hide();
            else s.el.show();
        }
        // Fade out stars as we approach 100%
        if (frame > 80 && Math.random() > (100 - frame) / 20) {
            s.el.hide();
        }
    });

    screen.render();
    await new Promise(r => setTimeout(r, 40));
  }

  // 1.5 SECOND PAUSE TO ADMIRE FULL WORD REVEAL
  await new Promise(r => setTimeout(r, 1500));

  bootAnimBox.hide();
  welcomeCard.show();
  outputArea.show();
  inputContainer.show();
  inputBox.focus();
  screen.render();
}

let loadingInterval = null;
let mascotInterval = null;

function startLoadingAnimation(ui, overlays, screen, modeColor) {
  const { loadingIndicator } = overlays;
  const { mascotEl } = ui;
  const frames = ['-', '\\', '|', '/'];
  let i = 0;
  
  loadingIndicator.show();
  loadingIndicator.setFront();
  
  loadingInterval = setInterval(() => {
    loadingIndicator.setContent(`\n  ${frames[i]} Thinking...  `);
    i = (i + 1) % frames.length;
    screen.render();
  }, 200);

  // Mascot pulsing
  let pulseDir = 1;
  let pulseRef = 0;
  mascotInterval = setInterval(() => {
    pulseRef += 0.1 * pulseDir;
    if (pulseRef >= 1 || pulseRef <= 0) pulseDir *= -1;
    
    // Dim/Brighten mascot based on pulse
    if (pulseRef > 0.5) {
        mascotEl.style.fg = modeColor;
    } else {
        mascotEl.style.fg = C.dim;
    }
    screen.render();
  }, 100);
}

function stopLoadingAnimation(ui, overlays, screen, modeColor) {
  if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
  if (mascotInterval) { clearInterval(mascotInterval); mascotInterval = null; }
  
  overlays.loadingIndicator.hide();
  ui.mascotEl.style.fg = modeColor;
  screen.render();
}

module.exports = { createOverlays, runBootSequence, startLoadingAnimation, stopLoadingAnimation };
