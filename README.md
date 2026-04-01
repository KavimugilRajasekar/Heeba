# Heeba — Humanized Efficient Engine Bridging Automation

**Heeba** is a config-driven AI terminal companion powered by local GGUF models and llama.cpp. It features a rich visual UI with animated boot sequence, mascot animations, and intelligent intent routing.

![Heeba Boot Animation](https://via.placeholder.com/800x400.png?text=Heeba+Boot+Animation) *<-- Replace with real screenshot*

## What is HEEBA?

**HEEBA** is an acronym representing its core principles:

- **H**umanized — Natural interaction via local LLM
- **E**fficient — Runs lightweight GGUF models locally
- **E**ngine — Powered by GGUF + llama.cpp
- **B**ridge — Connects user commands to system actions
- **A**utomation — Executes real workflows in terminal

## Key Features

- **Config-Driven AI**: All behavior is controlled via `heeba.json` — personality, tone, routing rules, and more
- **Intent Routing**: Automatically detects user intent and routes to appropriate actions
- **Structured Commands**: Task requests are translated into JSON commands for BackendLogic
- **Visual Boot Sequence**: Professional ASCII reveal with twinkling stars and progress bar
- **Mascot Animations**: Dynamic character animations during interactions
- **Dual Modes**:
  - **Auto Mode (Cat)**: Full AI chat with conversation memory *(default)*
  - **Task Mode (Dino)**: Focused mode for system operations

## Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **llama.cpp**: Binaries in `engine/inference-engine/`

### 2. Setup
```bash
git clone https://github.com/USER/Heeba.git
cd Heeba
npm install
```

### 3. Engine & Models
Heeba requires a local GGUF model for Auto Mode:
1. Download a GGUF model (e.g., Granite, Llama)
2. Place it in `engine/models/`
3. Ensure `llama-server.exe` and DLLs are in `engine/inference-engine/`

## Configuration

### heeba.json
All AI behavior is configured in `heeba.json`:

```json
{
  "heeba_identity": {
    "name": "Heeba",
    "full_name": "HEEBA — Humanized Efficient Engine Bridging Automation"
  },
  "user_profile": {
    "name": "User",
    "how_to_address": "User",
    "communication_style": "friendly, concise, helpful"
  },
  "assistant_behavior": {
    "tone": "friendly",
    "allowed_actions": ["answer_questions", "generate_code", "debug_code"]
  },
  "intent_routing_rules": {
    "profile_update": {
      "patterns": ["change my name to", "rename me"],
      "action": "update_user_profile"
    }
  }
}
```

### System Settings
Edit `src/core/config.js`:
- **Threads**: Default 4
- **Context Length**: 2048 tokens
- **Port**: Server runs on `127.0.0.1:5786`

## Usage

```bash
npm start
```

### Keyboard Shortcuts
| Key | Action |
| --- | --- |
| `Shift + Space` | Switch between Auto (Cat) and Task (Dino) modes |
| `↑` / `↓` | Navigate command history |
| `Escape` / `q` | Safe exit |

### Example Commands
- "Hello" → Greeting response
- "Change my name to Kavimugil" → Updates config, refreshes UI
- "Who are you?" → Explains HEEBA identity
- "Write a function to sort arrays" → Outputs code generation command

## Architecture

```
User Interface ←→ LLM (with heeba.json system prompt) ←→ BackendLogic
                     ↓
              Intent Routing
                     ↓
        Structured JSON Commands
```

## Troubleshooting

### "First response is slow!"
The first message in Auto Mode loads the model into RAM (15-60s depending on hardware). Subsequent responses are instant.

### "Config not loading?"
Ensure `heeba.json` exists at project root and is valid JSON.

## License
MIT License. Created with ❤️ for terminal enthusiasts.
