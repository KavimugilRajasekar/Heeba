# HEEBA — Humanized Efficient Engine Bridging Automation

<div align="center">
<img src="assets/heeba.png" alt="Heeba Logo" width="180"/>

**v1.4** · Local AI · Terminal-Native · Private by Design

*Your config-driven AI terminal companion — email, browser, security, and more.*

[Quick Start](#-quick-start) · [Browser Automation](#-browser-automation) · [CLI Reference](#-cli-reference) · [Architecture](#-architecture) · [Email Suite](#-email-intelligence-suite)

</div>

---

## ◈ What is Heeba?

Heeba is a private, config-driven AI terminal companion powered by local GGUF models (`llama.cpp`) and online LLM APIs (Ollama, OpenRouter). It runs entirely on your machine — your conversations, emails, and files never leave your system.

**Three operational interfaces:**

| Interface | Command | Best For |
|---|---|---|
| **TUI** | `heeba --launch` | Deep, interactive sessions with branching conversations |
| **CLI** | `heeba -m "prompt"` | Fast one-shot queries, scripting, and automation |
| **Telegram** | `heeba --launch-tele` | Remote access via Telegram bot, anywhere |

**Key capabilities:**

- **Email** — Fetch, send, search, digest, narrate, automate via IMAP/SMTP
- **Browser Automation** — Full DOM manipulation via Playwright: navigate, click, type, scroll, screenshot, tabs
- **Security Auditing** — Recursive autonomous security scanner with a built-in Security Knowledge Base
- **App Endpoint Auditing** — Scans local codebases for running services and API routes
- **Strategic Planning** — Breaks complex multi-step requests into a visual tree roadmap
- **Weather Intelligence** — Real-time forecasts via OpenWeather with IP geolocation

---

## ◈ Quick Start

### Prerequisites

- **Node.js** v18+ (development only — the `.exe` needs no Node.js)
- **llama.cpp binaries** in `engine/inference-engine/` *(for local GGUF models)*
- **GGUF models** in `engine/models/` *(optional — online models work without this)*

### Installation

```powershell
npm install
```

### Launch Modes

```powershell
# Interactive Terminal UI
heeba --launch

# Single natural language query (stateless)
heeba -m "Summarize my emails from this morning"

# System diagnostics (like flutter doctor)
heeba --doctor

# List all available models
heeba --list-models
```

### Portable Deployment

After building (`npm run build:exe`), copy these next to `dist/heeba.exe`:

```
dist/
├── heeba.exe
├── engine/                    ← from project root
│   ├── inference-engine/      ← llama-cli.exe, llama-server.exe, *.dll
│   └── models/                ← *.gguf model files
├── heeba.json                 ← from project root
└── credentials.json            ← (optional) for email/Ollama credentials
```

> The `engine/` directory **must** be in the same folder as `heeba.exe`. Paths are resolved relative to the exe location automatically.

---

## ◈ Browser Automation

Heeba embeds a full **Playwright-based browser automation engine** — navigate websites, interact with forms, scrape content, manage tabs, and take screenshots.

### Supported Actions

| Action | Natural Language Trigger | Parameters |
|---|---|---|
| `browser_launch` | "launch browser", "open browser" | `browserType`, `headless`, `visible` |
| `browser_navigate` | "go to google.com", "visit", "navigate to" | `url` |
| `browser_click` | "click the button", "click on the link" | `selector` |
| `browser_type` | "type into", "fill in", "enter text" | `selector`, `value` |
| `browser_select` | "select option", "choose from dropdown" | `selector`, `value` |
| `browser_scroll` | "scroll down", "scroll up" | `direction`, `amount`, `selector` |
| `browser_screenshot` | "take screenshot", "capture screen" | `path` |
| `browser_get_state` | "get page state", "what page am I on" | — |
| `browser_back` / `browser_forward` | "go back", "go forward" | — |
| `browser_reload` | "reload page", "refresh" | — |
| `browser_new_tab` | "open new tab" | — |
| `browser_switch_tab` | "switch to tab 2" | `index` |
| `browser_close_tab` | "close this tab" | `index` |
| `browser_close` | "close browser" | — |

### Usage

Enable browser automation in `heeba.json`:

```json
{
  "browserEnabled": true,
  "browserType": "chromium",
  "browserVisible": false
}
```

Then use natural language:

```
"Open gmail.com and log me in"
"Click the login button"
"Take a screenshot of the current page"
"Scroll down to see more content"
"Open a new tab and go to github.com"
```

### How It Works

The browser engine is managed by `BrowserManager` — a Playwright singleton that maintains persistent context (cookies/localStorage survive across pages) and exposes methods for every DOM action. The `dom-handler.js` layer maps each `browser_*` action to the corresponding `BrowserManager` method, and all handlers are registered in `intent-executor.js` so the LLM can emit them from natural language.

---

## ◈ System Diagnostics (`--doctor`)

Run `heeba --doctor` to get a `flutter doctor`-style diagnostic report covering:

| Section | Checks |
|---|---|
| **Platform** | Node version, OS, arch, CPU cores, RAM |
| **Network** | Internet connectivity, proxy settings |
| **Engine (llama.cpp)** | `llama-cli.exe` exists, models directory |
| **Local Models** | GGUF/BIN files found, file sizes |
| **Online Models** | `credentials.json`, endpoint reachability |
| **heeba.json** | File validity, identity, routing rules, browser/email config |
| **Browser (Playwright)** | playwright installed, Chromium/Firefox/Webkit |
| **Runtime Directories** | exports, email cache, downloads |
| **Email** | IMAP/SMTP accounts configured |

```
$ heeba --doctor

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  HEEBA DOCTOR — System Diagnostics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━ Platform ━━━
  ✔ Node.js version (v22.14.0)
  ✔ Platform (win32 10.0.26200)
  ✔ Architecture (x64)
  ✔ CPU cores (12)
  ✔ RAM (7.6 GB free / 15.3 GB total)

━━━ Network ━━━
  ✔ Internet connectivity
  ✔ Proxy (none configured)

━━━ Engine (llama.cpp) ━━━
  ✔ llama-cli executable
    ✔ Version available
  ✔ Models directory
    ✔ Local model files (1 found)

━━━ Summary ━━━
  ✔ All checks passed!
```

---

## ◈ Auditors & Security

### Security Auditor

Heeba performs deep, recursive security scans of your local system using a multi-step agent loop and a built-in **Security Knowledge Base** (`Security-KB/`).

- **Recursive reasoning** — identifies tools, analyzes output, pivots based on findings
- **KB-driven** — learns safe flags and usage patterns for `netstat`, `auditd`, `ufw`, `netsh`, etc.
- **Rich visual reports** — color-coded tree reports with actionable fixes
- **Trigger**: *"Run a security audit"*, *"Is my system safe?"*, *"Check for open ports"*

### App & Endpoint Auditor

Scans local backend projects to discover running services, route definitions, and API health.

- **Repository analysis** — recursively finds port configs and route definitions
- **Endpoint testing** — verifies uptime, latency, and response bodies
- **Trigger**: *"Scan my backend project"*, *"Audit this server's endpoints"*

---

## ◈ Weather Intelligence

Powered by OpenWeather One Call API 3.0:

- **Current conditions + hourly/daily forecasts** with Feels Like, UV Index, humidity
- **IP-based geolocation** — ask *"How's the weather?"* without specifying a location
- **Global geocoding** — any city on Earth
- **API fallback** — automatically switches between 3.0 and 2.5 based on subscription tier
- **Trigger**: *"What's the weather?"*, *"Forecast for Chennai"*, *"Will it rain tomorrow?"*

---

## ◈ Telegram Interface

Full Telegram bot integration for remote access from anywhere.

### Step 1 — Discover your User ID

```powershell
heeba --launch-tele -l
```
Send `/start` to `@HeebaInterfaceBot` — your terminal shows your ID.

### Step 2 — Bind to your ID

```powershell
heeba --launch-tele -uid <YOUR_TELEGRAM_ID>
```

Once bound, use natural language exactly as in the TUI:

| What you type | What Heeba does |
|---|---|
| `"Show my emails from today"` | Fetches inbox as a numbered list |
| `"Read email #3"` | Displays full email body |
| `"Send email to X about Y"` | Composes and sends |
| `"Summarize my morning emails"` | AI-powered digest |
| `"Run a security audit"` | Fires the autonomous auditor |

Long responses are automatically split into multiple messages (Telegram's 4096-char limit).

---

## ◈ CLI Reference

```
USAGE:
  heeba [options]

OPTIONS:
  --launch                    Start the Interactive Terminal UI (TUI)
  --launch-web                Start the Local Web Interface
  -p <port>                   Port for web interface (default: 7856)
  --help, -h                  Show this help information
  --version, -v               Show version number
  -m "<prompt>"               Execute a natural language query (stateless)
  -model "<name>"             Override the default LLM for a query
  --session "<id>"            Resume a specific named session
  -M                          Show token usage and RAM metrics after query
  --list-models               List all available models (local + online)
  --list-online-models        List only online/API-based models
  --list-local-models         List only locally hosted GGUF models
  --doctor                    Run system diagnostics

TELEGRAM INTERFACE:
  --launch-tele -l            Listen mode — logs /start users & their IDs
  --launch-tele -uid <ID>     Server mode — bind bot to a Telegram User ID
  --launch-tele -model <M> -uid <ID>   Server mode with model override
```

---

## ◈ Architecture

```
heeba/
├── main.js                    ← Entry point, CLI parsing, TUI/CLI/Telegram lifecycle
├── heeba.json                 ← Master config: identity, profile, 77+ intent routing rules
├── credentials.json           ← API keys, email credentials (git-ignored)
├── credentials.ex.json       ← Encrypted credential reference template for collaborators
├── session.json               ← Persisted TUI/Web sessions (created at runtime)
├── engine/                    ← Local inference runtime (must be next to heeba.exe)
│   ├── inference-engine/     ← llama-cli.exe, llama-server.exe, *.dll
│   └── models/                ← *.gguf model files
├── Security-KB/               ← OS-specific security tool knowledge base
│   ├── Windows-Security-KB/  ← netsh, netstat, auditpol, sfc, etc.
│   └── Linux-Security-KB/     ← iptables, ss, journalctl, auditd, etc.
├── src/
│   ├── core/
│   │   ├── engine.js          ← LLM inference orchestration (llama.cpp + Ollama)
│   │   ├── intent-executor.js ← Parses AI JSON responses → dispatches to handlers
│   │   ├── state-manager.js   ← Branching session tree with non-linear history
│   │   ├── config-loader.js   ← Hot-reloads heeba.json and credentials.json
│   │   ├── model-registry.js  ← Dynamic discovery: local GGUF + online APIs
│   │   ├── ollama-adapter.js  ← Ollama / OpenRouter / OpenAI HTTP adapter
│   │   ├── email-accounts.js  ← IMAP/SMTP multi-account manager
│   │   ├── agent-executor.js  ← Multi-step agent loop with plan/execute phases
│   │   ├── security-tools-index.js  ← Security KB indexing and lookup
│   │   ├── kb-loader.js       ← Loads and formats KB context for the LLM
│   │   └── handlers/
│   │       ├── email-handler.js    ← Core IMAP fetch/send + automation bridge
│   │       ├── system-handler.js   ← CPU, RAM, platform reporting
│   │       ├── file-handler.js     ← File metadata and analysis
│   │       ├── profile-handler.js  ← User identity and tone updates
│   │       ├── session-handler.js  ← Session rename, delete, branching
│   │       ├── weather-handler.js  ← OpenWeather 3.0 + IP Geolocation
│   │       ├── news-handler.js     ← Google News via web scraper
│   │       ├── model-handler.js    ← Online model registration
│   │       ├── software-handler.js ← Windows installed software listing
│   │       ├── dom-handler.js      ← Browser DOM automation (Playwright)
│   │       └── doctor-handler.js   ← System diagnostics (--doctor)
│   ├── auditors/
│   │   ├── security-auditor.js ← Recursive autonomous security audit agent loop
│   │   └── app-auditor.js      ← Local project & endpoint discovery logic
│   ├── browser/
│   │   ├── manager.js         ← Playwright BrowserManager singleton
│   │   └── cleaner.js         ← Browser lifecycle management and cleanup
│   ├── telegram/
│   │   ├── telegram-launcher.js  ← Bot init, listen/server mode, message chunking
│   │   ├── telegram-router.js    ← Session state, Telegram-native formatting
│   │   └── qr-renderer.js        ← Terminal QR code rendering for bot link
│   ├── web/
│   │   ├── web-launcher.js       ← Local web interface launcher
│   │   ├── web-router.js         ← Web session management and routing
│   │   ├── session-bridge.js      ← TUI ↔ Web bridge
│   │   └── client/app.js         ← Web UI (blessed-backed terminal in browser)
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
│   │   ├── date-filter.js         ← Time-range filtering (morning/afternoon/evening/night)
│   │   ├── stats.js               ← Inbox volume statistics
│   │   ├── email-to-task.js       ← Action item extraction from emails
│   │   └── utils/
│   │       ├── imap-client.js  ← imapflow wrapper for mailbox operations
│   │       ├── parsers.js      ← Email parsing utilities
│   │       ├── formatters.js   ← Terminal formatting helpers
│   │       └── cache.js        ← Email cache manager
│   └── ui/
│       ├── components.js          ← Blessed UI element definitions
│       ├── animations.js          ← Boot sequences, loading overlays
│       ├── layout-manager.js      ← Page rendering & navigation conductor
│       ├── input-manager.js      ← Keyboard input, shortcuts, history
│       ├── markdown-renderer.js   ← Color-aware terminal Markdown parser
│       ├── render-manager.js     ← Debounced render loop
│       ├── scroll-manager.js     ← Smart auto-scroll with user detection
│       ├── theme.js              ← Centralized color palette tokens
│       └── table-gen.js          ← Terminal table builder
└── src/utils/
    ├── table-formatter.js         ← Pixel-perfect terminal table builder
    ├── stats-refresher.js        ← Real-time CPU/RAM polling loop
    ├── paths.js                   ← pkg-compatible cross-platform path resolver
    ├── logger.js                 ← Structured runtime debug logger
    ├── tree-reporter.js          ← Tree-structure output for roadmaps/reports
    └── helpers.js                ← Shared constants, buildSystemPrompt, MODES
```

---

## ◈ Email Intelligence Suite

18 automation modules — all accessible via natural language from TUI, CLI, or Telegram:

| Command | Natural Language Example |
|---|---|
| Fetch inbox | `"Show my emails from today"` |
| Read email | `"Read email #2"` |
| Send email | `"Send email to X about Y with file Z"` |
| Daily digest | `"Give me my daily digest"` |
| Weekly digest | `"Summarize this week's emails"` |
| OTP detection | `"What's the OTP in my mail?"` |
| Smart search | `"Find Amazon emails from last week"` |
| Categorize | `"Categorize my inbox"` |
| Timeline | `"Show my email timeline"` |
| Follow-ups | `"What emails need a reply?"` |
| Priority unread | `"Show priority unread"` |
| Spam check | `"Detect spam in last 3 days"` |
| Download attachments | `"Download attachments from email #3"` |
| Export to markdown | `"Export today's emails"` |
| Narrate inbox | `"Tell me about my emails"` |
| Quick reply | `"Reply yes to #5"` |
| Bulk archive | `"Archive all promotional emails"` |
| Email threads | `"Show email threads with Amazon"` |
| Stats | `"How many emails this week?"` |
| Detect action items | `"Extract tasks from email #3"` |
| Apply rules | `"Apply automation rules to inbox"` |
| Search emails | `"Search for messages about project X"` |

---

## ◈ Configuration

All configuration lives in `heeba.json` — the single source of truth for identity, profile, models, email accounts, and intent routing rules.

### Adding an Online Model

```
heeba -m "add online model from https://openrouter.ai/api/v1/chat/completions with api key sk-... and model meta-llama/llama-3.1-8b"
```

### Adding an Email Account

```
heeba -m "add email account for user@gmail.com with app password xxxx xxxx xxxx xxxx"
```

### Intent Routing

Heeba ships with **77+ intent routing rules** in `heeba.json`. Each rule maps natural language patterns to an action and optional backend command. To add a new command:

1. Add a handler function in `src/core/handlers/<name>-handler.js`
2. Register it in `intent-executor.js` via `...require('./handlers/<name>-handler')`
3. Add a routing rule in `heeba.json` under `intent_routing_rules`

---

## ◈ Building an Executable

```powershell
npm run build:exe
```

Output is placed in `dist/heeba.exe`. The build uses `pkg` and automatically bundles `heeba.json`, `assets/`, `src/`, and relevant `node_modules`.

> After building, copy `engine/` from the project root into `dist/` — it contains llama.cpp binaries and GGUF models.

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

## ◈ Visual Design

- **Tree structures** — `├`, `└`, `│` for hierarchical display
- **Box-drawing** — `┌ ─ ┐ │ └ ─ ┘` for tables and section dividers
- **Progress markers** — `➤` (current), `✔` (done), `◈` (section header)
- **Color system** — Centralized palette via `src/ui/theme.js` (cyan, yellow, green, red, border)

---

## ◈ File Statistics

| Lines | File |
|---:|---|
| 722 | `src/web/client/app.js` |
| 655 | `src/core/auditors/security-auditor.js` |
| 611 | `src/core/auditors/app-auditor.js` |
| 578 | `src/core/handlers/email-handler.js` |
| 540 | `src/ui/components.js` |
| 511 | `src/web/web-router.js` |
| 436 | `src/telegram/telegram-router.js` |
| 418 | `src/core/handlers/file-handler.js` |
| 374 | `src/ui/layout-manager.js` |
| 331 | `src/ui/animations.js` |
| 330 | `src/ui/markdown-renderer.js` |
| 308 | `src/core/handlers/software-handler.js` |
| 262 | `src/core/ollama-adapter.js` |
| 222 | `src/core/agent-executor.js` |
| 210 | `src/core/engine.js` |
| 210 | `src/core/email-accounts.js` |
| 207 | `src/core/handlers/weather-handler.js` |
| 393 | `src/core/handlers/doctor-handler.js` |
| 185 | `src/core/handlers/system-handler.js` |
| 179 | `src/web/session-bridge.js` |
| 178 | `src/telegram/telegram-launcher.js` |
| 174 | `src/core/state-manager.js` |
| 173 | `src/email/automation/utils/parsers.js` |
| 156 | `src/core/handlers/news-handler.js` |
| 138 | `src/core/model-registry.js` |
| 134 | `src/core/intent-executor.js` |
| 125 | `src/email/automation/utils/formatters.js` |
| 120 | `src/core/handlers/model-handler.js` |
| 119 | `src/ui/input-manager.js` |
| 116 | `src/email/automation/utils/cache.js` |
| 113 | `src/core/security-tools-index.js` |

---

## ◈ Privacy

- **Local GGUF models** — run entirely offline, no requests leave your machine
- **Online API calls** — go directly to your configured provider, no middleware
- **Email credentials** — stored locally in `credentials.json`, never transmitted
- **Session persistence** — conversations survive restarts via `session.json` stored next to `heeba.exe`

---

## ◈ License

MIT License. Built with care for terminal enthusiasts who want their tools to be genuinely intelligent.
