# Heeba : Terminal AI Companion

**Heeba** is a high-performance, visually rich terminal-based AI companion. Powered by Node.js and local LLM inference via `llama.cpp`, Heeba brings an interactive "Cat-vs-Dino" experience directly to your CLI.

![Heeba Boot Animation](https://via.placeholder.com/800x400.png?text=Professional+Terminal+Boot+Animation) *<-- Replace with real screenshot if possible*

## Key Features

-   **Celestial Boot Sequence**: A professional, character-by-character ASCII reveal with twinkling stars and a dynamic progress bar.
-   **Dual Modes**:
    -   **Task Mode (DINO)**: Lightweight, focused mode for system operations and manual commands.
    -   **Auto Mode (CAT)**: Full-featured LLM chat with memory and persistent context.
-   **Instant Inference**: Uses **Persistent Server Mode** (`llama-server.exe`) to keep models loaded in RAM, eliminating the "cold start" delay for every message.
-   **Animations**: Pulse-mascot heartbeat, frame-by-frame loading indicators, and smooth UI transitions.

## Getting Started

### 1. Prerequisites
-   **Node.js**: v18.0.0 or higher.
-   **llama.cpp**: Binaries should be placed in `engine/inference-engine/`.

### 2. Setup
Clone the repository and install dependencies:
```bash
git clone https://github.com/USER/Heeba.git
cd Heeba
npm install
```

### 3. Engine & Models
Heeba requires a local GGUF model to function in **Auto Mode**:
1.  Download a model (e.g., `granite-3.0-2b-instruct-GGUF`).
2.  Place it in `engine/models/`.
3.  Ensure `llama-server.exe` and its DLLs are in `engine/inference-engine/`.

## Usage

Run Heeba using the start script:
```bash
npm start
```

### Keyboard Shortcuts
| Key | Action |
| --- | --- |
| `Shift + Space` | Switch between **Task** (Dino) and **Auto** (Cat) modes |
| `↑` / `↓` | Navigate command history |
| `Escape` / `q` | Safe exit (kills background LLM server) |
| `Mouse Scroll` | Scroll the output terminal |

## Configuration
You can adjust system settings in `src/core/config.js`:
-   **Threads**: Defaults to 4.
-   **Context Length**: 2048 tokens.
-   **Port**: Server runs on `127.0.0.1:8080`.

## Troubleshooting
### "The LLM feels stuck!"
If the AI is taking too long to respond:
-   The first message in **Auto Mode** triggers the server to load the model into your RAM. Depending on your hard drive (HDD vs SSD), this might take 15–60 seconds.
-   Subsequent responses will be nearly instantaneous.
-   Ensure no other instances of `llama-server.exe` are running in your Task Manager.

## License
MIT License. Created with ❤️ for terminal enthusiasts.
