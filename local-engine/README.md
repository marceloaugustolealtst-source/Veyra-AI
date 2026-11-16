# VEYRA Local Video Engine (preview)

This is an opt-in local image-to-video worker. It runs on the user's own computer and exposes only a loopback HTTP service at `127.0.0.1:8765`. It does not use Runway, Remaker, a paid video API, or VEYRA server GPU time.

## Requirements

- Windows 10/11 with a compatible NVIDIA CUDA GPU, or Apple Silicon Mac with MPS.
- A current NVIDIA driver on Windows.
- Python 3.10.
- Several GB of free disk space for Python packages and model weights; the first run downloads the model from Hugging Face.
- A capable GPU and sufficient VRAM. If the model cannot fit, generation will stop with a memory message. CPU-only generation is deliberately disabled.

## Start

Windows: double-click `start-windows.bat`.

Apple Silicon Mac: run `start-macos.command` from Terminal. If macOS blocks it, run `chmod +x start-macos.command` once.

Keep the terminal open while generating. On first start, dependencies and model weights are downloaded. The model is loaded on the first request.

Check readiness at http://127.0.0.1:8765/health.

## API

POST `http://127.0.0.1:8765/generate` as multipart form data:
- `image`: JPG, PNG or WebP
- `prompt`: motion description
- `seconds`: 2, 3, 4 or 5
- `seed`: optional integer

The first preview build returns short silent MP4 clips. It does not yet provide speech synthesis, lip-sync, 30-second extension, background installers, or automatic VEYRA library sync.

## Privacy and safety

The service binds to localhost only. Uploaded images are processed locally by this computer. Generated MP4 files are written to `outputs/`. Do not expose port 8765 to the public internet.

## Model

Default model: `Lightricks/LTX-Video-0.9.8-distilled`. Review the model card and license at https://huggingface.co/Lightricks/LTX-Video-0.9.8-distilled before distributing weights or a bundled installer.
