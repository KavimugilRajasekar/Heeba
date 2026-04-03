# Heeba — Humanized Efficient Engine Bridging Automation

```text
  _    _ ______ ______ ____            
 | |  | |  ____|  ____|  _ \     /\    
 | |__| | |__  | |__  | |_) |   /  \   
 |  __  |  __| |  __| |  _ <   / /\ \  
 | |  | | |____| |____| |_) | / ____ \ 
 |_|  |_|______|______|____/ /_/    \_\
                                       
     AI TERMINAL COMPANION v1.0
```

**Heeba** is a config-driven AI terminal companion powered by local GGUF models and `llama.cpp`. It features a professional terminal interface with an animated boot sequence, real-time system monitoring, and intelligent intent routing.

---

## ◈ Overview

**HEEBA** is designed to be more than just a chat interface; it's a bridge between natural language and terminal operations. By leveraging local LLMs, it provides a private, secure, and highly customizable assistant that adapts to your workflow.

- **H**umanized — Natural interaction via local LLM.
- **E**fficient — Runs lightweight GGUF models locally with minimal footprint.
- **E**ngine — Powered by high-performance `llama.cpp` inference.
- **B**ridge — Connects user commands to structured system actions.
- **A**utomation — Executes real-world terminal tasks and workflows.

---

## ◈ Key Features

### 1. Config-Driven Personality
All AI behavior, identity, and routing rules are defined in `heeba.json`. You can refine Heeba's tone, communication style, and allowed actions without touching a single line of code.

### 2. AI-Powered Chat
- **Auto Mode**: Full AI conversation with session history and context memory. Ideal for brainstorming, debugging, and general assistance. Features a tree-based branching navigation so you can explore multiple conversation paths.

### 3. Professional Terminal UI
Built with the `blessed` library, Heeba offers a feature-rich CLI experience:
- **Animated Boot**: Character-by-character ASCII reveal with progress tracking.
- **Real-Time Stats**: Live monitoring of RAM, CPU, Uptime, and Token usage.
- **Mascot Animations**: Dynamic character states (idle, thinking, busy, sleeping).
- **Multiline Input**: Smart expanding input field with history navigation.

### 4. Intent Routing & Structured Commands
Heeba automatically detects user intent (e.g., code generation, debugging, profile updates) and translates requests into structured JSON commands for backend execution.

### 5. Email Integration
Heeba connects to your inbox via IMAP and sends mail via SMTP.
- **Fetch & Read**: List recent emails and read full contents with HTML-to-text conversion.
- **Attachments**: Send emails with local file attachments directly from the terminal.
- **Contextual Aliases**: Intelligently resolves "reception" or other aliases mentioned in the conversation.
- See [EmailService.md](./EmailService.md) for detailed configuration.

---

## ◈ Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher.
- **llama.cpp**: Binaries required in `engine/inference-engine/`.
- **GGUF Model**: At least one quantized model in `engine/models/`.

### Installation
```powershell
# Clone the repository
git clone https://github.com/kavimugilrajasekar/Heeba.git
cd Heeba

# Install dependencies
npm install

# Start the application
npm start
```

---

## ◈ Configuration

### `heeba.json`
The heart of Heeba's behavior. Customize your identity and interaction rules:

```json
{
  "heeba_identity": { "name": "Heeba", "personality": "friendly, helpful, concise" },
  "user_profile": { "name": "User", "communication_style": "friendly, concise" },
  "intent_routing_rules": {
    "profile_update": {
      "patterns": ["change my name to", "rename me"],
      "action": "update_user_profile"
    }
  }
}
```

### System Configuration
Found in `src/core/config.js`:
- **Threads**: CPU threads for inference (Default: 4).
- **Context Length**: Maximum conversation history (Default: 2048 tokens).
- **Model**: Default GGUF file used on startup.

---

## ◈ Usage

### Keyboard Shortcuts
| Key | Action |
| --- | --- |
| `↑` / `↓` | Navigate command history |
| `Esc` / `q` | Safe exit |

### Integrated Commands
- `models`: Scan and list available GGUF models.
- `model <name>`: Switch active model dynamically.

---

## ◈ Directory Structure

The project follows a modular architecture, separating concerns between state, logic, and presentation:

```text
Heeba/
├── main.js                 # Entry point & Orchestrator
├── heeba.json              # Main configuration & Identity
├── credentials.json        # Private API keys & service credentials
├── src/
│   ├── core/               # Business Logic & State
│   │   ├── state-manager.js    # Application state & session tree logic
│   │   ├── engine.js           # LLM Query & Inference control
│   │   ├── intent-executor.js  # Command dispatcher (orchestrates handlers)
│   │   ├── handlers/           # Specific action implementations
│   │   │   ├── email-handler.js   # IMAP/SMTP & email formatting
│   │   │   ├── session-handler.js # Session/Page lifecycle management
│   │   │   ├── profile-handler.js # User identity & heeba.json updates
│   │   │   └── model-handler.js   # Ollama & GGUF model management
│   │   ├── config.js           # System settings & Model discovery
│   │   ├── config-loader.js    # Config persistence & reloading
│   │   └── ollama-adapter.js   # Remote LLM / API support
│   ├── ui/                 # Visual components
│   │   ├── components.js       # Blessed element definitions
│   │   ├── layout-manager.js   # Screen rendering & Page population
│   │   ├── input-manager.js    # Keyboard bindings & Input handling
│   │   ├── animations.js       # Boot sequence & Mascot logic
│   │   ├── render-manager.js   # Screen update coordination
│   │   ├── scroll-manager.js   # Smart auto-scroll control
│   │   ├── theme.js            # Visual design & color tokens
│   │   └── markdown-renderer.js# Markdown to ANSI terminal translator
│   └── utils/              # Shared utilities
│       ├── helpers.js          # Shared constants & tiny helpers
│       ├── logger.js           # Debug & info logging to /logs
│       └── stats-refresher.js  # Real-time CPU/RAM/Token monitoring
└── engine/                 # Inference binaries & LLM Models
```

---

## ◈ How It Works

Heeba operates as an event-driven terminal workflow engine. Here is the step-by-step lifecycle of an interaction:

1. **Initialization**: On startup, `main.js` initializes the `blessed` screen and spawns a 1-second interval for the `stats-refresher`. It then triggers the `animations.js` boot sequence.
2. **Input Capture**: The `input-manager.js` monitors the multi-line input box. When you press **Enter** (without Shift), the input is captured and sent to the orchestrator in `main.js`.
3. **State & Context**: `main.js` uses `state-manager.js` to identify the current session or create a new one. It reconstructs the conversation history (the path from the root node to your current page) to provide the LLM with full context.
4. **Inference**: The request is sent to `engine.js`, which spawns a `llama.cpp` process or queries Ollama. Tokens are streamed back in real-time.
5. **Real-Time Rendering**: As tokens arrive, `main.js` calls `layout-manager.js` to update the active page. The `markdown-renderer.js` ensures code blocks and formatting look professional in the terminal.
6. **Intent Resolution**: Once the response is complete, `intent-executor.js` parses the text for structured JSON blocks. If a command (like `fetch_emails` or `update_user_profile`) is detected, it dispatches the task to the appropriate **Handler** in `src/core/handlers/`.
7. **Action & Feedback**: The handler executes the requested action (e.g., connecting to IMAP) and returns a result. This result is appended to the conversation, and the UI is refreshed to show the success or failure.
8. **Persistence**: Throughout the process, any changes to the user profile or session names are automatically persisted to `heeba.json` via `config-loader.js`.

---

## ◈ Roadmap

- [ ] **HTTP Server Mode**: Integration with `llama-server.exe` for faster API-based responses.
- [ ] **Tool Calling**: Native capability for Heeba to execute shell commands.
- [ ] **File Watching**: Real-time project monitoring for proactive assistance.
- [ ] **Plugin System**: Community-driven command and mascot extensions.

---

## ◈ License
MIT License. Created with ❤️ for terminal enthusiasts.
