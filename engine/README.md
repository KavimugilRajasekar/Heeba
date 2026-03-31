# LLM Local Inference Engine

This folder contains the core local inference engine for Heeba, powered by **llama.cpp**.

## [!] Important: Engine & Models Not Included

The `inference-engine/` and `models/` directories are **excluded from git** (see `.gitignore`). You must set these up yourself based on your system.

---

## [DIR] Directory Structure (After Setup)

```
engine/
├── README.md                    # This file
├── inference-engine/            # ← YOU MUST SETUP
│   ├── llama-cli.exe           #    Download pre-built or compile
│   ├── llama-server.exe        #    from llama.cpp
│   └── *.dll                   #    Required runtime libraries
└── models/                     # ← YOU MUST SETUP
    └── granite4350m.gguf     #    Download a GGUF model
```

---

## Setup Instructions

### Step 1: Get llama.cpp Binaries

**Option A: Download Pre-built (Easiest)**

1. Go to [llama.cpp Releases](https://github.com/ggerganov/llama.cpp/releases)
2. Download the latest release for your platform:
   - **Windows**: `llama-b*.-bin-win-*x64.zip`
   - Extract the zip
3. Copy these files to `engine/inference-engine/`:
   - `llama-cli.exe` (required)
   - `llama-server.exe` (optional, for API mode)
   - All `.dll` files

**Option B: Build from Source (Maximum Performance)**

```bash
# Clone llama.cpp
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp

# Configure for your hardware
# Standard CPU:
cmake -B build

# With NVIDIA GPU (CUDA):
cmake -B build -DGGML_CUDA=ON

# With Vulkan (AMD/Intel GPU):
cmake -B build -DGGML_VULKAN=ON

# Build
cmake --build build --config Release -j

# Copy binaries to engine folder
cp build/bin/Release/*.exe engine/inference-engine/
cp build/bin/Release/*.dll engine/inference-engine/  # Windows only
```

### Step 2: Get a Model

1. Download a GGUF model from:
   - [TheBloke/Mistral-7B-GGUF](https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF)
   - [TheBloke/Llama-2-7B-GGUF](https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF)
   - [TheBloke/Granite-3-8B-GGUF](https://huggingface.co/TheBloke/granite-3-8b-instruct-GGUF)
   - [Hugging Face GGUF Collection](https://huggingface.co/models?filter=gguf)

2. Recommended models for your system:
   - **Low RAM (<8GB)**: Q4_K_M quantization, 7B parameters
   - **Medium RAM (8-16GB)**: Q4_K_M quantization, 13B parameters
   - **High RAM (16GB+)**: Q5_K_M quantization, 13B+ parameters

3. Place the `.gguf` file in `engine/models/`
   - Example: `engine/models/granite4350m.gguf`

### Step 3: Configure Heeba

Edit `CONFIG` in `main.js` to match your setup:

```javascript
const CONFIG = {
  model: 'granite4350m.gguf',           // Your model filename
  engine: './engine/inference-engine/llama-cli.exe',
  enginePath: './engine/inference-engine',
  modelPath: './engine/models/granite4350m.gguf',  // Full path to model
  contextLength: 2048,                      // Adjust based on your RAM
  threads: 4,                               // CPU threads to use
};
```

---

## [TEST] Quick Test

Test your setup from project root:

```powershell
# Windows
.\engine\inference-engine\llama-cli.exe -m .\engine\models\granite4latest.gguf -p "Hello, how are you?" -n 32
```

```bash
# Linux/Mac
./engine/inference-engine/llama-cli -m ./engine/models/granite4latest.gguf -p "Hello, how are you?" -n 32
```

You should see the LLM generate a response.

---

## Troubleshooting

### "llama-cli.exe not found"
- Make sure you downloaded the binaries to `engine/inference-engine/`
- Check that the path in `CONFIG.modelPath` is correct

### "Model file not found"
- Verify the model exists in `engine/models/`
- Check the filename matches exactly (case-sensitive)

### "Out of memory"
- Reduce `contextLength` in CONFIG (try 1024)
- Use a smaller model or higher quantization (Q4 instead of Q5)

### "Slow inference"
- Increase `threads` in CONFIG (match your CPU cores)
- Enable GPU acceleration (see Build from Source above)

---

## Verification Status

| Component | Status | Action Required |
|-----------|--------|-----------------|
| llama-cli.exe | [ERR] Missing | Download or build |
| llama-server.exe | [ERR] Missing | Optional |
| Model (.gguf) | [ERR] Missing | Download |
| DLLs | [ERR] Missing | Copy from llama.cpp release |

---

## Performance Tips

1. **GPU Acceleration**: Build with `-DGGML_CUDA=ON` for NVIDIA or `-DGGML_VULKAN=ON` for AMD/Intel GPUs
2. **CPU Threads**: Set to your physical CPU cores (not logical)
3. **Context Length**: Higher = more memory, but longer conversations
4. **Quantization**: Q4_K_M offers best balance of speed/quality for most users
