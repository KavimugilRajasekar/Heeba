# Heeba — Humanized Efficient Engine Bridging Automation

<div align="center">

```text
  _    _ ______ ______ ____            
 | |  | |  ____|  ____|  _ \     /\    
 | |__| | |__  | |__  | |_) |   /  \   
 |  __  |  __| |  __| |  _ <   / /\ \  
 | |  | | |____| |____| |_) | / ____ \ 
 |_|  |_|______|______|____/ /_/    \_\
                                         
      LOCAL AI TERMINAL COMPANION v1.2
```

**Heeba** is a powerful, config-driven AI terminal companion designed for developers who live in the CLI. Powered by local GGUF models via `llama.cpp` or Ollama, Heeba provides a private, secure, and professional interface for AI assistance, email automation, and system management.

[Explore Functionalities](file:///HEEBAFUNCTIONALITIES.md) • [Report a Bug](#) • [Request Feature](#)

</div>

---

## ◈ Overview
**HEEBA** is a dual-interface AI engine (TUI + CLI) that bridges natural language and terminal operations effortlessly.

- **Humanized** — Natural, context-aware interaction via local LLMs.
- **Efficient** — Optimized for local GGUF models with minimal resource overhead.
- **Engine** — High-performance inference powered by `llama.cpp`.
- **Bridge** — A translation layer converting natural language to structured system actions.
- **Automation** — Real-world execution of email, file, and system workflows.

---

## ◈ Core Architecture: Dual-Interface

### 1. Stateful TUI Mode (Visual Workspace)
*Launch via: `npm start`*
A rich, immersive visual workspace for deep technical work.
- **Branching Conversations**: Explore multiple conversation paths with a non-linear branching system.
- **Visual Feedback**: Cyan-bordered tables, animated sequences, and real-time hardware monitoring.
- **Session Intelligence**: Persistent sessions with auto-generated titles and branch history.

### 2. Stateless CLI Mode (Fast Automation)
*Launch via: `node main.js -m "your query"`*
A non-interactive mode designed for speed and one-off queries.
- **Immediate Execution**: Execute single queries and exit.
- **Action Detect**: Automatically finds and executes background actions (e.g., sending email).
- **Streaming Metrics**: Live token usage and system memory monitoring with `-M`.

---

## ◈ Elite Features

### ✉ Email Automation
A comprehensive intelligence suite that handles fetching, summarizing, and responding.
- **Daily Digest**: categorical summaries of your day's inbox.
- **OTP Detection**: Instant extraction of verification codes.
- **Smart Search**: Find mail by subject, sender, or relative time (e.g., "morning emails").
- **Composition**: Multi-file attachments via natural language.

### ⚙ System & File Intelligence
- **System Metrics**: Live CPU, Platform, and RAM reports.
- **File Analysis**: Metadata, type, and size extraction for local files.
- **Identity Config**: Update user profile and assistant personality on the fly.

---

## ◈ Quick Start

### 1. Prerequisites
- **Node.js**: v18+
- **llama.cpp**: Binaries in `engine/inference-engine/`
- **Models**: GGUF files in `engine/models/`

### 2. Installation
```powershell
npm install
```

### 3. Usage
```powershell
# Start the TUI
npm start

# Fast CLI Query
node main.js -m "Summarize my unread emails from today" -M

# List Models
node main.js --list-models
```

---

## ◈ Usage Flags (CLI)

| Feature | Flag / Query | Description |
| :--- | :--- | :--- |
| **Stateless Mode** | `-m "prompt"` | Run a single query and exit. |
| **Performance Metrics**| `-M` | Show token count and RAM usage. |
| **Model Override** | `--model "name"` | Direct override for the query. |
| **Model Discovery** | `--list-models` | List all registered model paths. |
| **Local Search** | `--list-local-models` | Only show `.gguf` files. |

---

## ◈ Comprehensive File Mapping

Heeba is built with a highly modular architecture. Below is a breakdown of every key file and its specific responsibility within the engine.

### ◈ Root Layer
- **`main.js`**: The entry point. Handles CLI argument parsing, TUI/CLI lifecycle management, and system-wide cleanup.
- **`heeba.json`**: Primary configuration hub for your **Identity**, **User Profile**, and **Intent Routing** rules.
- **`package.json`**: Defines dependencies (Blessed, ImapFlow, etc.) and core executable scripts (`npm start`).

---

### ◈ Core Orchestration (`src/core/`)
The foundational logic for AI interaction, session management, and backend command execution.

- **`engine.js`**: Orchestrates LLM inference via `llama.cpp` or Ollama, managing conversation context and history.
- **`intent-executor.js`**: The central dispatcher. Uses the AI's response to identify and execute backend system actions.
- **`state-manager.js`**: Manages the **non-linear branching tree**. Handles session creation, page navigation, and persistence.
- **`config-loader.js`**: Dynamically loads and reloads the `heeba.json` and `credentials.json` data.
- **`model-registry.js`**: A centralized list for discovery and validation of local GGUF models and online APIs.
- **`ollama-adapter.js`**: Specialized logic for seamless communication with the local Ollama server.
- **`email-accounts.js`**: Securely manages multiple IMAP/SMTP account configurations and connection tests.

#### ◈ Backend Handlers (`src/core/handlers/`)
Specialized logic for individual action categories:
- **`email-handler.js`**: Core IMAP/SMTP operations and bridge to automation modules.
- **`file-handler.js`**: Logic for local file analysis and metadata extraction.
- **`system-handler.js`**: Fetches hardware stats (CPU, RAM) and manages global config updates.
- **`profile-handler.js`**: Manages user-specific identity updates (name, tone, style).
- **`session-handler.js`**: Controls visual session management (rename, delete, branching).

---

### ✉ Email Intelligence (`src/email/automation/`)
A massive suite of self-fetching handlers designed for stateless and stateful automation.

- **`digest-generator.js`**: Generates categorical summaries (Important, Promo, Alerts) of your inbox.
- **`otp-detector.js`**: Scans the last hour of mail to extract and display verification codes.
- **`categorizer.js`**: Sorts your emails into intelligent buckets without manual intervention.
- **`timeline-view.js`**: Renders a chronological, summarized view of your entire mail history.
- **`followup-tracker.js`**: Identifies sent emails that haven't received a response.
- **`priority-unread.js`**: Highlights your most important unread messages.
- **`spam-detector.js`**: Uses pattern matching to flag potential spam and unwanted mail.
- **`attachment-downloader.js`**: Securely extracts and saves files from your emails to `/downloads/`.
- **`exporter.js`**: Powers the backup system, saving inbox snapshots to clean Markdown files.
- **`narrator.js`**: Narrates your inbox status using Heeba's custom personality.
- **`quick-reply.js`**: Handles rapid template-based responses (Noted, Yes, No).
- **`bulk-actions.js`**: Executes massive operations like "Mark All Read" or "Archive Promos."

---

### ◈ Visual UX & Theme (`src/ui/`)
Built using the `blessed` terminal library for a premium, interactive experience.

- **`components.js`**: Definitions for all visual elements (Output cards, Input boxes, Page indicators).
- **`animations.js`**: Manages complex boot-sequences, loading overlays, and transition effects.
- **`layout-manager.js`**: The UI conductor—handles rendering, page switching, and viewport scaling.
- **`input-manager.js`**: High-level input processing for shortcuts, history scrolling, and command entry.
- **`markdown-renderer.js`**: A custom-built, color-aware parser for rendering LLM responses in the terminal.
- **`theme.js`**: Centralized color tokens (Cyan-Cyan Borders, Purple User Tags, Yellow AI Tags).

---

### ◈ Toolbox (`src/utils/`)
- **`table-formatter.js`**: The engine for producing pixel-perfect cyan-bordered tables.
- **`stats-refresher.js`**: A localized poller for real-time CPU and RAM monitoring.
- **`paths.js`**: Handles `pkg`-compatible path resolution for cross-platform stability.
- **`logger.js`**: Low-level runtime logging for system debugging.
- **`helpers.js`**: Shared logic for string manipulation, constants, and data validation.

---

## ◈ Engine Layer
- **`engine/models/`**: The local storage for your `.gguf` model files.
- **`engine/inference-engine/`**: The home for high-performance binaries (e.g., `llama-cli.exe`).

---

## ◈ License
MIT License. Created with ❤️ for terminal enthusiasts.
