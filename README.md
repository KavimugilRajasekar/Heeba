<div align="center">

<img src="assets/heeba.png" alt="Heeba Logo" width="180"/>

# HEEBA

### Humanized Efficient Engine Bridging Automation

**v1.4** · Local AI · Terminal-Native · Private by Design

[Quick Start](#-quick-start) · [Auditors](#-auditors--security) · [Weather](#-weather-intelligence) · [CLI Reference](#-cli-reference) · [Architecture](#-architecture)

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
- **Planning** — Multi-step strategic planning with tree-based roadmap visualization

---

## ◈ Strategic Planning

Heeba features an intelligent **strategic planning system** that breaks down complex requests into executable steps, displayed as a visual tree structure in the terminal.

### How It Works

When you issue a multi-step request, Heeba:

1. **Analyzes** your intent and available tools
2. **Plans** a step-by-step roadmap using the optimal tool sequence
3. **Executes** each step while tracking progress with visual indicators
4. **Reports** results through each phase with clear status updates

### Visual Roadmap

```
◈ Designing strategic plan...
  ◈ STRATEGIC ROADMAP
  └─ Front-loaded approach
  ├─ Step 1: Use list_dir with path "C:\project" to verify the repository
  ├─ Step 2: Execute run_command with parameters { "command": "git branch -a" }
  ├─ Step 3: Execute run_command with parameters { "command": "git log --graph --oneline --all" }
  └─ Step 4: Use read_file with path "..."
```

Progress markers indicate execution state:
- `➤` — Current step being executed
- `✔` — Completed step
- `  ` — Pending step

### CLI Usage

```powershell
# Strategic planning is automatic for complex multi-step queries
heeba -m "Find all branches in this project and show me a tree structure"
heeba -m "Security audit my system for open ports"
heeba -m "Analyze this codebase and find all API endpoints"
```

> **Tip:** Complex queries (repository analysis, security audits, multi-file operations) trigger the planning system automatically. Simple queries execute directly without planning overhead.

---

## ◈ Auditors & Security

Heeba v1.4 introduces **Recursive Autonomous Auditors** — a specialized reasoning engine that allows Heeba to act as an independent security and application analyst.

### 🛡️ Autonomous Security Auditor
Heeba can perform deep, recursive security scans of your local system. It identifies potential vulnerabilities, analyzes open ports, and suggests hardening fixes using a built-in **Security Knowledge Base (KB)**.

- **Recursive Reasoning**: Uses a multi-step agent loop to identify tools, analyze output, and pivot based on findings.
- **KB-Driven**: Automatically learns flags and safe usage patterns for tools like `netstat`, `auditd`, `ufw`, and more.
- **Rich Visual Reports**: Generates color-coded tree reports and action-oriented summaries.
- **Trigger**: *"Run a security audit"*, *"Is my system safe?"*, *"Check for open ports"*.

### 🔍 App & Endpoint Auditor
For developers, Heeba can analyze local backend projects to discover running services and test API health.

- **Repository Analysis**: Recursively scans codebases to find port configurations and route definitions.
- **Endpoint Testing**: Automatically verifies endpoint uptime, latency, and response bodies.
- **Audit Logs**: Provides a step-by-step trace of the backend discovery process.
- **Trigger**: *"Scan my backend project"*, *"Audit this server's endpoints"*.

---

## ◈ Weather Intelligence

Powered by OpenWeather One Call API 3.0, Heeba provides real-time atmospheric data with extreme accuracy and "humanized" summaries.

- **Current & Forecasts**: Hourly and daily weather details with "Feels Like", UV Index, and humidity.
- **IP Location Discovery**: Ask *"How's the weather?"* and Heeba automatically detects your city via IP-based geolocation.
- **Global Geocoding**: High-precision city name resolution for any location on Earth.
- **Resilient Fallback**: Automatically switches between One Call 3.0 and standard 2.5 APIs based on your account's subscription tier.
- **Trigger**: *"What's the weather?"*, *"Forecast for Chennai"*, *"Will it rain tomorrow?"*.

---

## ◈ Quick Start

### Prerequisites

- **Node.js** v18+ (only needed for development — the `.exe` needs no Node.js)
- **llama.cpp binaries** in `engine/inference-engine/` *(for local GGUF models)*
- **GGUF models** in `engine/models/` *(optional — online models work without this)*

### Portable Deployment

After building (`npm run build:exe`), copy these files/folders next to `dist/heeba.exe`:

```
dist/
├── heeba.exe
├── engine/                    ← copy this folder from project root
│   ├── inference-engine/      ← llama-cli.exe, llama-server.exe, *.dll
│   └── models/                ← *.gguf model files
├── heeba.json                 ← copy from project root
└── credentials.json           ← (optional) copy for email/Ollama credentials
```

> **Important:** The `engine/` directory **must** be in the same folder as `heeba.exe`. When `heeba.exe` runs from any terminal directory, it automatically resolves paths relative to its own location — no PATH changes required.

### Installation (Development)

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
├── credentials.json           ← Decrypted API keys and email credentials (git-ignored)
├── credentials.ex.json        ← Encrypted credential reference template (for collaborators)
├── session.json               ← Persisted TUI/Web sessions (created at runtime, next to exe)
├── assets/
│   └── heeba.png              ← Application logo (used for .exe icon)
├── engine/                    ← Local inference runtime (must be copied next to heeba.exe)
│   ├── inference-engine/      ← llama-cli.exe, llama-server.exe, *.dll
│   └── models/                ← *.gguf model files
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
│   │       ├── weather-handler.js  ← OpenWeather 3.0 + IP Geolocation
│   │       └── model-handler.js    ← Online model registration
│   ├── auditors/
│   │   ├── security-auditor.js ← Recursive system audit agent loop
│   │   └── app-auditor.js      ← Local project & endpoint discovery logic
│   ├── security-kb/            ← OS-specific knowledge base for security tools
│   │   ├── windows/            ← netstat, tasklist, etc.
│   │   └── linux/              ← auditd, systemctl, ufw, etc.
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
- `credentials.ex.json` — encrypted credential reference (for collaborator use)
- All `src/` modules and relevant `node_modules`

> **After building**, copy the `engine/` folder from the project root into `dist/` alongside `heeba.exe`. This folder contains the llama.cpp binaries and GGUF models and must be present for local model inference to work.

> **Note:** `credentials.ex.json` is an encrypted credential template for collaborators. It is not loaded at runtime. For actual credentials, use `credentials.json` (decrypted format, git-ignored).

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

Heeba uses a **clean, text-based visual language** optimized for terminal readability:

- **Tree structures** — `├`, `└`, `│` characters for hierarchical display of branches, roadmaps, and reports
- **Box-drawing** — `┌`, `─`, `┐`, `│`, `└`, `─`, `┘` for tables, code blocks, and section dividers
- **Progress markers** — `➤` (current), `✔` (done), `◈` (section header)
- **No emoji** — Pure ASCII/Unicode for maximum terminal compatibility

The markdown renderer preserves tree alignment automatically, ensuring preformatted output like git graphs and strategic roadmaps display correctly without text wrapping artifacts.

---

## ◈ File Statistics

The following table lists all source files by line count in descending order:

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

Heeba is **private by design**:

- Local GGUF models run entirely offline — no requests leave your machine
- Online model API calls go directly to your configured provider (OpenRouter, Ollama, etc.) — no middleware
- Email credentials are stored locally in `heeba.json` — never transmitted
- **Session persistence:** TUI and Web conversations survive app restarts via `session.json` stored next to `heeba.exe`. The Telegram session cache (`telegram-sessions.json`) is also local.

---

## ◈ License

MIT License. Built with ❤️ for terminal enthusiasts who believe their tools should be as smart as they are.
