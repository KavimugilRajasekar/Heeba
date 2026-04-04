<div align="center">

<img src="assets/heeba.png" alt="Heeba Logo" width="180"/>

# HEEBA

### Humanized Efficient Engine Bridging Automation

**v1.3** · Local AI · Terminal-Native · Private by Design

[Quick Start](#-quick-start) · [CLI Reference](#-cli-reference) · [Telegram Interface](#-telegram-interface) · [Architecture](#-architecture) · [Email Suite](#-email-intelligence-suite)

</div>

---

## ◈ What is Heeba?

**Heeba** is a private, config-driven AI terminal companion powered by local GGUF models (`llama.cpp`) and online LLM APIs (Ollama, OpenRouter). It runs entirely on your machine with no cloud dependency — your conversations, emails, and files never leave your system.

Heeba provides **three operational interfaces**:

| Interface | Command | Best For |
|---|---|---|
| **TUI** | `heeba --launch` | Deep, interactive sessions with branching conversations |
| **CLI** | `heeba -m "prompt"` | Fast one-shot queries and shell scripting |
| **Telegram** | `heeba --launch-tele` | Remote access via Telegram bot, anywhere |

---

## ◈ Core Principles

- **Humanized** — Natural, context-aware conversation via local LLMs
- **Efficient** — Runs lightweight GGUF models with minimal resource overhead
- **Engine** — High-performance inference powered by `llama.cpp` or Ollama
- **Bridge** — Translates natural language into structured system actions
- **Automation** — Executes real email, file, and system workflows

---

## ◈ Quick Start

### Prerequisites

- **Node.js** v18+
- **llama.cpp** binaries in `engine/inference-engine/` *(for local models)*
- **GGUF models** in `engine/models/` *(optional — online models work without this)*

### Installation

```powershell
npm install
```

### Launch Modes

```powershell
# Interactive Terminal UI
heeba --launch

# Single natural language query
heeba -m "Summarize my emails from this morning"

# With model override and performance metrics
heeba -m "Show my system status" -model ollama-gpt-oss -M

# List all available models
heeba --list-models
```

---

## ◈ CLI Reference

```
USAGE:
  heeba [options]

OPTIONS:
  --launch                    Start the Interactive Terminal UI (TUI)
  --help, -h                  Show this help information
  --version, -v               Show version number
  -m "<prompt>"               Execute a natural language query (stateless)
  -model "<name>"             Override the default LLM for a query
  --session "<id>"            Resume a specific named session
  -M                          Show token usage and RAM metrics after query
  --list-models               List all available models (local + online)
  --list-online-models        List only online/API-based models
  --list-local-models         List only locally hosted GGUF models

TELEGRAM INTERFACE:
  --launch-tele -l            Listen for /start — logs users & their IDs
  --launch-tele -uid <ID>     Bind the Telegram bot to your User ID
  --launch-tele -model <M> -uid <ID>   Bind with a specific model
```

---

## ◈ Telegram Interface

Heeba v1.3 includes a full **Telegram Bot Interface** that lets you interact with Heeba remotely using your phone — accessing all the same email, system, and AI features from anywhere.

### How It Works

```
┌──────────────┐        ┌──────────────────┐        ┌───────────────┐
│  Telegram    │ ──────▶│  Heeba Telegram  │ ──────▶│  Heeba Core  │
│  (phone)     │        │  Router          │        │  Engine       │
└──────────────┘        └──────────────────┘        └───────────────┘
                               │                            │
                        Session Storage             Intent → Handler
                      (telegram-sessions.json)     (email, system, AI)
```

### Step 1 — Discover your Telegram User ID

Run Heeba in **Listen Mode**, then send `/start` to `@HeebaInterfaceBot` on Telegram:

```powershell
heeba --launch-tele -l
```

Your terminal will display:

```
[18:05:12] @yourusername | ID: 123456789 → Registered
```

The bot will reply to you on Telegram with your ID and the exact bind command.

### Step 2 — Start the Telegram Server

```powershell
# Bind to your Telegram User ID
heeba --launch-tele -uid <YOUR_TELEGRAM_ID>

# With a specific model override
heeba --launch-tele -model ollama-gpt-oss -uid <YOUR_TELEGRAM_ID>
```

### Features via Telegram

Once bound, you can use natural language exactly as you would in the TUI:

| What you type | What Heeba does |
|---|---|
| `"Show my emails from today"` | Fetches inbox, formats as a clean numbered list |
| `"Read email #3"` | Opens and displays the full email body |
| `"What's my system status?"` | Returns CPU, RAM, platform info |
| `"Send email to X about Y"` | Composes and sends an email |
| `"Summarize my morning emails"` | AI-powered digest |

### Terminal Console Logging

Every Telegram interaction is logged in your terminal:

```
[18:08:15] 123456789 | "Show my emails..." → fetch_emails → fetch_emails → Success
[18:08:42] 123456789 | "Read email #3..." → read_email → read_email → Success
```

### Smart Message Handling

- **Long responses** (email bodies, digests) are automatically **split into multiple messages** — Telegram's 4096-char limit is handled transparently
- **Email lists** are reformatted from ASCII tables to **clean numbered entries** with emoji
- **Markdown** is applied where possible, with automatic plain-text fallback

---

## ◈ Architecture

Heeba is built with a clean layered architecture where each module has a single responsibility.

```
heeba/
├── main.js                    ← Entry point, CLI parsing, TUI lifecycle
├── heeba.json                 ← Master config: identity, profile, intent rules
├── assets/
│   └── heeba.png              ← Application logo (used for .exe icon)
├── src/
│   ├── core/
│   │   ├── engine.js          ← LLM inference orchestration (llama.cpp + Ollama)
│   │   ├── intent-executor.js ← Parses AI response → dispatches to handlers
│   │   ├── state-manager.js   ← Branching session tree (non-linear history)
│   │   ├── config-loader.js   ← Hot-reloads heeba.json and credentials.json
│   │   ├── model-registry.js  ← Dynamic discovery: local GGUF + online APIs
│   │   ├── ollama-adapter.js  ← Ollama / OpenRouter HTTP adapter
│   │   ├── email-accounts.js  ← IMAP/SMTP multi-account manager
│   │   └── handlers/
│   │       ├── email-handler.js    ← Core IMAP fetch/send + automation bridge
│   │       ├── system-handler.js   ← CPU, RAM, platform reporting
│   │       ├── file-handler.js     ← File metadata and analysis
│   │       ├── profile-handler.js  ← User identity and tone updates
│   │       ├── session-handler.js  ← Session rename, delete, branching
│   │       └── model-handler.js    ← Online model registration
│   ├── telegram/
│   │   ├── telegram-launcher.js   ← Bot init, listen/server mode, message chunking
│   │   ├── telegram-router.js     ← Session state, Telegram-native formatting
│   │   └── qr-renderer.js         ← Terminal QR code for bot link
│   ├── email/automation/
│   │   ├── digest-generator.js    ← Daily/weekly categorical inbox summary
│   │   ├── otp-detector.js        ← Verification code extraction
│   │   ├── categorizer.js         ← Smart inbox sorting by category
│   │   ├── timeline-view.js       ← Chronological email timeline renderer
│   │   ├── followup-tracker.js    ← Sent-without-reply detection
│   │   ├── priority-unread.js     ← Importance-sorted unread messages
│   │   ├── spam-detector.js       ← Pattern-based spam flagging
│   │   ├── attachment-downloader.js ← Secure file extraction to /downloads/
│   │   ├── exporter.js            ← Inbox → Markdown/TXT backup
│   │   ├── narrator.js            ← Personality-driven inbox narration
│   │   ├── quick-reply.js         ← Template replies (Yes / No / Noted)
│   │   ├── bulk-actions.js        ← Mass mark-read, archive-by-category
│   │   ├── rule-engine.js         ← User-defined automation rule engine
│   │   ├── search-builder.js      ← Natural-language IMAP query builder
│   │   ├── thread-grouper.js      ← Groups emails into conversation threads
│   │   ├── date-filter.js         ← Time-range filtering (morning/evening)
│   │   ├── stats.js               ← Inbox volume statistics
│   │   └── email-to-task.js       ← Action item extraction from emails
│   └── ui/
│       ├── components.js          ← Blessed UI element definitions
│       ├── animations.js          ← Boot sequences, loading overlays
│       ├── layout-manager.js      ← Page rendering & navigation conductor
│       ├── input-manager.js       ← Keyboard input, shortcuts, history
│       ├── markdown-renderer.js   ← Color-aware terminal Markdown parser
│       ├── render-manager.js      ← Debounced render loop
│       ├── scroll-manager.js      ← Smart auto-scroll with user detection
│       └── theme.js               ← Centralized color palette tokens
└── src/utils/
    ├── table-formatter.js         ← Pixel-perfect terminal table builder
    ├── stats-refresher.js         ← Real-time CPU/RAM polling loop
    ├── paths.js                   ← pkg-compatible cross-platform path resolver
    ├── logger.js                  ← Structured runtime debug logger
    └── helpers.js                 ← Shared constants, string utils, MODES
```

---

## ◈ Email Intelligence Suite

Heeba ships with 18 email automation modules — all accessible via natural language from TUI, CLI, or Telegram.

| Command | Natural Language Example | Module |
|---|---|---|
| Fetch inbox | `"Show my emails from today"` | `email-handler` |
| Read email | `"Read email #2"` | `email-handler` |
| Send email | `"Send email to X about Y with file Z"` | `email-handler` |
| Daily digest | `"Give me my daily digest"` | `digest-generator` |
| OTP detection | `"What's the OTP in my mail?"` | `otp-detector` |
| Smart search | `"Find Amazon emails from last week"` | `search-builder` |
| Categorize | `"Categorize my inbox"` | `categorizer` |
| Timeline | `"Show my email timeline"` | `timeline-view` |
| Follow-ups | `"What emails need a reply?"` | `followup-tracker` |
| Priority | `"Show priority unread"` | `priority-unread` |
| Spam check | `"Detect spam in last 3 days"` | `spam-detector` |
| Download | `"Download attachments from email #3"` | `attachment-downloader` |
| Export | `"Export today's emails to markdown"` | `exporter` |
| Narrate | `"Narrate my inbox"` | `narrator` |
| Quick reply | `"Reply noted to #5"` | `quick-reply` |
| Bulk archive | `"Archive all promotional emails"` | `bulk-actions` |
| Threads | `"Show email threads with Amazon"` | `thread-grouper` |
| Stats | `"How many emails this week?"` | `stats` |

---

## ◈ Configuration

All configuration lives in `heeba.json` at the root. It is the single source of truth for:

- **Identity** — Heeba's name, personality, and core principles
- **User Profile** — Your name, address preference, communication style
- **Online Models** — API keys, endpoints, and model IDs for cloud LLMs
- **Email Accounts** — IMAP/SMTP credentials for multiple accounts
- **Intent Routing Rules** — Pattern-to-action mappings for the AI dispatcher
- **System Rules** — Hard behavioral rules enforced at every interaction

### Adding an Online Model

```
heeba -m "add online model named my-model from https://openrouter.ai/api/v1/chat/completions with api key sk-... and model meta-llama/llama-3.1-8b"
```

### Adding an Email Account

```
heeba -m "add email account for user@gmail.com with app password xxxx xxxx xxxx xxxx"
```

---

## ◈ Building an Executable

Heeba can be compiled into a standalone Windows `.exe` with the Heeba logo embedded as the application icon:

```powershell
npm run build:exe
```

The output is placed in `dist/heeba.exe`. The build uses `pkg` and automatically bundles:
- `heeba.json` — your configuration
- `assets/heeba.png` — embedded as the `.exe` icon
- All `src/` modules and relevant `node_modules`

---

## ◈ TUI Keyboard Shortcuts

| Key | Action |
|---|---|
| `Enter` | Submit query |
| `←` `→` | Navigate between conversation branches |
| `↑` `↓` (in session) | Switch between sibling branches |
| `Escape` | Go back / close overlay |
| `Tab` | Open session/page list |
| `Ctrl+C` / `q` | Exit cleanly |

---

## ◈ Privacy

Heeba is **private by design**:

- Local GGUF models run entirely offline — no requests leave your machine
- Online model API calls go directly to your configured provider (OpenRouter, Ollama, etc.) — no middleware
- Email credentials are stored locally in `heeba.json` — never transmitted
- Conversation history is stored in-memory only for the TUI session; the Telegram session cache is local (`telegram-sessions.json`)

---

## ◈ License

MIT License. Built with ❤️ for terminal enthusiasts who believe their tools should be as smart as they are.
