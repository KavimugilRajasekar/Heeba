// src/telegram/telegram-launcher.js
const TelegramBot = require('node-telegram-bot-api');
const { renderQRCode } = require('./qr-renderer');
const { processMessage } = require('./telegram-router');
const { state } = require('../core/state-manager');
const logger = require('../utils/logger');

// Hardcoded Credentials
const TELEGRAM_TOKEN = 'TOKEN HERE';
const BOT_LINK = 'https://t.me/HeebaInterfaceBot';

/**
 * Heeba Telegram Interface Launcher
 */
async function launchTelegramMode(options = {}) {
  const { listenOnly, bindUid, modelOverride } = options;

  if (listenOnly) {
    console.log(`\n\x1b[36m◈ Heeba Telegram: Listen Mode\x1b[0m`);
    console.log(`\x1b[90mWaiting for /start <user-name> from users...\x1b[0m\n`);
  } else if (bindUid) {
    console.log(`\n\x1b[36m◈ Heeba Telegram: Server Mode\x1b[0m`);
    console.log(`\x1b[90mBound to User ID: ${bindUid}\x1b[0m`);
    if (modelOverride) {
      console.log(`\x1b[90mModel Override: ${modelOverride}\x1b[0m`);
    }
    console.log(`\x1b[90mMonitoring incoming messages...\x1b[0m\n`);
  } else {
    // Default help display
    return showTeleHelp();
  }

  // Render QR Code for both modes
  renderQRCode(BOT_LINK);

  // Initialize Bot
  const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

  // Listen Mode: Simple discovery
  if (listenOnly) {
    bot.onText(/\/start/, (msg) => {
      const timestamp = new Date().toLocaleTimeString();
      const userName = msg.from.username ? `@${msg.from.username}` : (msg.from.first_name || 'Unknown');
      const userId = msg.from.id;

      // Modern clean log line
      console.log(`\x1b[90m[${timestamp}]\x1b[0m \x1b[36m${userName}\x1b[0m | ID: \x1b[33m${userId}\x1b[0m \x1b[90m→\x1b[0m \x1b[32mRegistered\x1b[0m`);

      bot.sendMessage(msg.chat.id, `Welcome to Heeba, ${userName}! 

Your Telegram User ID is:
\`${userId}\`

To bind this bot to your local Heeba server, run:
heeba --launch-tele -uid ${userId}`, { parse_mode: 'Markdown' });
    });
  }

  // Telegram hard limit: 4096 chars per message
  const TELEGRAM_LIMIT = 4096;

  /**
   * Sends a message safely — splits into chunks if over the Telegram limit.
   * Tries Markdown first, falls back to plain text on each chunk.
   */
  async function sendSafe(chatId, text) {
    if (!text || text.trim() === '') return;

    // Split on newlines to avoid cutting mid-word or mid-markdown
    const chunks = [];
    let current = '';
    for (const line of text.split('\n')) {
      if ((current + '\n' + line).length > TELEGRAM_LIMIT) {
        if (current) chunks.push(current.trim());
        current = line;
      } else {
        current = current ? current + '\n' + line : line;
      }
    }
    if (current) chunks.push(current.trim());

    for (const chunk of chunks) {
      try {
        await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
      } catch (e) {
        // Markdown parse failed — strip and send plain
        try {
          await bot.sendMessage(chatId, chunk.replace(/[*_`]/g, ''));
        } catch (e2) {
          console.error(`\x1b[31m◈ Send failed:\x1b[0m ${e2.message}`);
        }
      }
    }
  }

  // Server Mode: Route messages through Heeba Core
  if (bindUid) {
    bot.on('message', async (msg) => {
      try {
        if (msg.from.id.toString() !== bindUid.toString()) {
          // Silently ignore messages from other users
          return;
        }

        if (msg.text && !msg.text.startsWith('/')) {
          const result = await processMessage(
            msg.from.id, 
            msg.text, 
            { 
              model: modelOverride || state.CONFIG.model,
              onUpdate: async (stepText) => {
                await sendSafe(msg.chat.id, stepText);
              }
            }
          );

          // Console Log: [TIME] USER_ID | PROMPT → INTENT → HANDLER → STATUS
          const { log } = result;
          const logLine = `\x1b[90m[${log.time}]\x1b[0m \x1b[36m${log.uid}\x1b[0m | \x1b[33m"${log.prompt}..."\x1b[0m \x1b[90m→\x1b[0m \x1b[35m${log.intent}\x1b[0m \x1b[90m→\x1b[0m \x1b[32m${log.handler}\x1b[0m \x1b[90m→\x1b[0m \x1b[37m${log.status}\x1b[0m`;
          console.log(logLine);

          // Send reply — chunked to respect Telegram's 4096 char limit
          await sendSafe(msg.chat.id, result.text);
        }
      } catch (err) {
        console.error(`\n\x1b[31m◈ CRITICAL BOT ERROR:\x1b[0m ${err.message}`);
        bot.sendMessage(msg.chat.id, `⚠️ Heeba error: ${err.message}`);
      }
    });

    // Handle /start for confirmation
    bot.onText(/\/start/, (msg) => {
      if (msg.from.id.toString() === bindUid.toString()) {
        bot.sendMessage(msg.chat.id, `Heeba Server bound to your ID: ${msg.from.id}. Ready to assist!`);
      }
    });
  }

  // Shutdown handler
  process.on('SIGINT', () => {
    bot.stopPolling();
    process.exit(0);
  });
}

/**
 * Display help for Telegram mode
 */
function showTeleHelp() {
  const { version } = require('../../package.json');
  console.log(`\x1b[36m
   __    __   _______  _______ .______      ___      
  |  |  |  | |   ____||   ____||   _  \\    /   \\     
  |  |__|  | |  |__   |  |__   |  |_)  |  /  ^  \\    
  |   __   | |   __|  |   __|  |   _  <  /  /_\\  \\   
  |  |  |  | |  |____ |  |____ |  |_)  |/  _____  \\  
  |__|  |__| |_______||_______||______//__/     \\__\\ 
                                                     \x1b[0m`);
  console.log(`\x1b[32m  Heeba Telegram Interface (v${version})\x1b[0m\n`);

  console.log(`\x1b[1mUSAGE:\x1b[0m`);
  console.log(`  heeba --launch-tele [options]\n`);

  console.log(`\x1b[1mOPTIONS:\x1b[0m`);
  console.log(`  \x1b[33m--launch-tele -l\x1b[0m                     Listen for /start — log users & their IDs`);
  console.log(`  \x1b[33m--launch-tele -uid <ID>\x1b[0m              Bind server to a specific Telegram User ID`);
  console.log(`  \x1b[33m--launch-tele -model <M> -uid <ID>\x1b[0m  Bind server with a specific model override\n`);

  console.log(`\x1b[1mEXAMPLES:\x1b[0m`);
  console.log(`  heeba --launch-tele -l`);
  console.log(`  heeba --launch-tele -uid <YOUR_TELEGRAM_ID>`);
  console.log(`  heeba --launch-tele -model ollama-gpt-oss -uid <YOUR_TELEGRAM_ID>\n`);

  console.log(`\x1b[90m  Tip: Run 'heeba --help' for the full command reference.\x1b[0m\n`);
  process.exit(0);
}

module.exports = { launchTelegramMode };
