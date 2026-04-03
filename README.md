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

## ◈ Architecture

Heeba uses a layered architecture to separate UI rendering from inference logic:

```text
┌────────────────────────────────┐
│      Terminal UI (Blessed)     │ <── Mascot, Stats, Input
└───────────────┬────────────────┘
                ▼
┌────────────────────────────────┐
│      Command Layer (main.js)   │ <── Routing, History, Sessions
└───────────────┬────────────────┘
                ▼
┌───────────────┴────────────────┐
│         Inference Layer        │
│    (llama.cpp + llama-cli)     │ <── Local LLM Execution
└────────────────────────────────┘
```

---

## ◈ Roadmap

- [ ] **HTTP Server Mode**: Integration with `llama-server.exe` for faster API-based responses.
- [ ] **Tool Calling**: Native capability for Heeba to execute shell commands.
- [ ] **File Watching**: Real-time project monitoring for proactive assistance.
- [ ] **Plugin System**: Community-driven command and mascot extensions.

---

## ◈ License
MIT License. Created with ❤️ for terminal enthusiasts.
