# Heeba — Humanized Efficient Engine Bridging Automation

```text
  _    _ ______ ______ ____            
 | |  | |  ____|  ____|  _ \     /\    
 | |__| | |__  | |__  | |_) |   /  \   
 |  __  |  __| |  __| |  _ <   / /\ \  
 | |  | | |____| |____| |_) | / ____ \ 
 |_|  |_|______|______|____/ /_/    \_\
                                         
      AI TERMINAL COMPANION v1.2
```

**Heeba** is a powerful, config-driven AI terminal companion designed for developers who live in the CLI. Powered by local GGUF models via `llama.cpp` or Ollama, Heeba provides a private, secure, and professional interface for AI assistance, email automation, and system management.

---

## ◈ Overview

**HEEBA** is a dual-interface AI engine (TUI + CLI) that bridges natural language and terminal operations.

- **Humanized** — Natural interaction via local LLMs.
- **Efficient** — Optimized for local GGUF models with minimal footprint.
- **Engine** — Powered by high-performance `llama.cpp` inference.
- **Bridge** — Connects natural language to structured system actions.
- **Automation** — Executes real-world terminal tasks and workflows.

---

## ◈ Key Features (v1.2 Upgrade)

### 1. Dual-Interface Architecture
- **Stateless CLI Mode**: Execute one-off queries, automation, and system checks directly from your shell.
- **Stateful TUI Mode**: A rich, branching conversation workspace for deep technical work.

### 2. Advanced Branching Conversations (TUI)
- **Session Tree**: Explore multiple conversation paths with a non-linear branching system.
- **Context-Aware**: Automatically reconstructs LLM history for any specific turn or branch.

### 3. Automated Email Intelligence
- **Zero-Context Automation**: Daily digests, OTP detection, and categorization now **self-fetch** data from IMAP even in Stateless mode.
- **Smart Search**: Find emails by sender, subject, date, or relative time.
- **Composition**: Send emails with multi-file attachments using natural language.

### 4. System & File Intelligence
- **System Info**: Real-time status on hardware, OS metrics, and RAM availability.
- **File Analysis**: Instant metadata extraction (size, type, dates) for local files.

---

## ◈ Stateless CLI Mode
Heeba 1.2 introduces a non-interactive mode for quick automation. It bypasses UI initialization and streams LLM responses directly to your terminal.

**Core Commands:**
- `-m "prompt"` : Execute a single query and exit.
- `--model "name"` : Override the default model for this query.
- `-M` : Display token usage and system metrics (Free RAM, Model ID).

**Example:**
```powershell
node main.js -m "What is the OTP from my last mail?" -M
```

**Model Discovery:**
- `--list-models`: Show all available models.
- `--list-local-models`: Show only `.gguf` files in `/models/`.
- `--list-online-models`: Show only configured API/Ollama models.

---

## ◈ Setup & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher.
- **llama.cpp**: Binaries required in `engine/inference-engine/`.
- **GGUF Models**: Quantized models in `engine/models/`.

### Quick Start
```powershell
npm install
npm start   # Launches TUI
node main.js -m "hi"  # Launches CLI
```

---

## ◈ Usage & Commands

| Feature | CLI Flag / Query Example |
| --- | --- |
| **Stateless Mode** | `node main.js -m "Summarize today's emails"` |
| **With Metrics** | `node main.js -m "System info" -M` |
| **Override Model** | `node main.js --model "ollama-gpt-oss" -m "hi"` |
| **List Models** | `node main.js --list-models` |
| **System Status** | "Show system status", "RAM usage?" |
| **File Analysis** | "Analyze main.js", "Look at heeba.json" |
| **OTP Detection** | "Find recent OTP codes", "What is my code?" |
| **Daily Digest** | "Give me a daily digest", "Email summary" |

---

## ◈ Project Architecture

Heeba follows a modular architecture designed for performance and strict state isolation.

```text
Heeba/
├── main.js                  # Entry point (CLI Argument Parser + TUI Launcher)
├── heeba.json               # Primary Config (Identity, Rules, Email)
├── credentials.json         # Legacy Storage (API Keys, Virtual Models)
├── src/
│   ├── core/                # ◈ Logic & Orchestration
│   │   ├── handlers/        # ◈ backend Action Map
│   │   ├── engine.js        # Inference (llama.cpp vs Ollama)
│   │   ├── intent-executor.js # Command Dispatcher
│   │   └── state-manager.js   # Tree Logic & Session History
│   ├── email/               # ◈ Specialized Email Automation
│   │   └── automation/      # ◈ Self-Fetching Handlers (Digest, OTP, etc.)
│   ├── ui/                  # ◈ Terminal UX (Blessed)
│   └── utils/               # ◈ Formatting & Path Utilities
└── exports/                 # Destination for backups & file exports
```

---

## ◈ License
MIT License. Created with ❤️ for terminal enthusiasts.
vers for local/packaged env
│       ├── table-formatter.js# Cyan-border table generator (Cyan-Cyan layout)
│       └── stats-refresher.js# Real-time hardware metric polling
├── logs/                    # Runtime technical logs (.log files)
└── exports/                 # Default destination for email/file backups
```

---

## ◈ License
MIT License. Created with ❤️ for terminal enthusiasts.
