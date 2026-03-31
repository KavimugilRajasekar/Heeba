# Heeba Architecture

## Overview
Heeba is a terminal-based AI companion powered by local GGUF models via llama.cpp.

---

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      USER INTERFACE                         │
│                    (blessed library)                        │
│  - Boot animation  - Welcome card  - Output area            │
│  - Input box  - Mode indicator  - Footer                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      COMMAND LAYER                          │
│  - processCommand()  - Mode switching (Shift+Space)          │
│  - Command parsing  - History navigation (up/down)          │
│  - Help/info/clear/cancel/set-model commands                │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
┌─────────────▼─────────────┐  ┌─────────▼─────────────┐
│       TASK MODE          │  │       AUTO MODE      │
│      (Dino - Green)      │  │     (Cat - Yellow)   │
│  - Manual commands        │  │  - LLM-powered chat  │
│  - No LLM calls          │  │  - Conversation hist │
│  - heeba prefix cmds     │  │  - Context memory    │
└─────────────────────────┘  └──────────┬────────────┘
                                        │
┌───────────────────────────────────────▼────────────────────┐
│                     LLM ENGINE LAYER                        │
│                   (llama.cpp binary)                        │
│  - queryLLM() - Spawns llama-cli.exe process                │
│  - buildSystemPrompt() - Mode-specific prompts              │
│  - Conversation history management                          │
│  - Token limits: 2048 context, 512 output                    │
└──────────────────────────┬─────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────┐
│                      MODEL LAYER                            │
│                 (GGUF quantized models)                     │
│                                                              │
│  ./engine/models/granite4latest.gguf  (current default)     │
│                                                              │
│  Model config:                                               │
│  - Threads: 4                                                │
│  - Context: 2048 tokens                                      │
│  - Output: 512 tokens max                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## Mode Comparison

| Feature | Task Mode (Dino) | Auto Mode (Cat) |
|---------|------------------|-----------------|
| Icon | (DINO) | (CAT) |
| Color | Green | Yellow |
| LLM | No | Yes |
| Commands | Manual | Chat with AI |
| History | Command only | Full conversation |

---

## Key Files

```
Heeba/
├── main.js           # All application code
├── engine/
│   ├── models/
│   │   └── granite4latest.gguf   # Default model
│   ├── inference-engine/
│   │   ├── llama-cli.exe        # Main inference binary
│   │   ├── llama-server.exe     # Server mode (future API)
│   │   └── *.dll                # Runtime libraries
│   └── README.md                # Engine documentation
└── ARCHITECTURE.md              # This file
```

---

## LLM Integration Flow

```
User Input (auto mode)
       │
       ▼
┌──────────────────┐
│ processCommand()  │
│  checks: is auto? │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   queryLLM()     │
│  - build prompt  │
│  - spawn process │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ llama-cli.exe    │
│  -m model.gguf   │
│  -p prompt       │
│  -n 512 tokens   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Parse response   │
│ - clean output   │
│ - update UI      │
│ - save history   │
└──────────────────┘
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Shift+Space` | Switch mode (Dino ↔ Cat) |
| `↑` / `↓` | Navigate command history |
| `Escape` / `q` | Quit Heeba |
| Mouse scroll | Scroll output area |

---

## Commands

| Command | Description |
|---------|-------------|
| `mode task` | Switch to Dino mode |
| `mode auto` | Switch to Cat mode |
| `clear` | Clear output |
| `info` | System info |
| `cancel` | Cancel LLM request |
| `set-model <name>` | Change model |
| `help` | Show help |

---

## Future Layers (Planned)

1. **Server Mode** - Use `llama-server.exe` for HTTP API
2. **Tool Calling** - LLM can execute shell commands
3. **File Watching** - Auto mode monitors project files
4. **Plugins** - Extensible command system
