from __future__ import annotations

import io
import os
import secrets
import subprocess
import tempfile
import threading
from pathlib import Path

import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image
from diffusers import LTXImageToVideoPipeline
from diffusers.utils import export_to_video

APP_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = APP_DIR / "outputs"
OUTPUT_DIR.mkdir(exist_ok=True)
MODEL_ID = os.getenv("VEYRA_VIDEO_MODEL", "Lightricks/LTX-Video-0.9.8-distilled")
DEVICE = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
DTYPE = torch.bfloat16 if DEVICE == "cuda" and torch.cuda.is_bf16_supported() else (torch.float16 if DEVICE != "cpu" else torch.float32)

app = FastAPI(title="VEYRA Local Video Engine", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://veyra-ai-financedigital.vercel.app", "http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

pipe = None
model_lock = threading.Lock()
job_lock = threading.Lock()


def load_pipeline():
    global pipe
    if pipe is None:
        with model_lock:
            if pipe is None:
                kwargs = {"torch_dtype": DTYPE}
                if DEVICE == "cuda":
                    kwargs["variant"] = "fp16" if DTYPE == torch.float16 else None
                    kwargs = {k: v for k, v in kwargs.items() if v is not None}
                pipe = LTXImageToVideoPipeline.from_pretrained(MODEL_ID, **kwargs)
                pipe.to(DEVICE)
                if hasattr(pipe, "vae") and hasattr(pipe.vae, "enable_tiling"):
                    pipe.vae.enable_tiling()
    return pipe


@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "VEYRA Local Video Engine",
        "device": DEVICE,
        "cuda": torch.cuda.is_available(),
        "modelLoaded": pipe is not None,
        "model": MODEL_ID,
    }


@app.post("/generate")
async def generate(
    image: UploadFile = File(...),
    prompt: str = Form(...),
    seconds: int = Form(3),
    seed: int = Form(0),
):
    if not prompt.strip() or len(prompt) > 1500:
        raise HTTPException(400, "Enter a prompt between 1 and 1,500 characters.")
    if seconds not in (2, 3, 4, 5):
        raise HTTPException(400, "Local generation currently supports 2–5 second clips.")
    if DEVICE == "cpu":
        raise HTTPException(503, "A supported GPU is required for local video generation. This computer has no CUDA or Apple MPS device.")
    raw = await image.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, "Image must be 20 MB or smaller.")
    try:
        source = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(400, "Upload a valid JPG, PNG, or WebP image.") from exc
    width, height = source.size
    if min(width, height) < 256 or width / height < 0.4 or width / height > 2.5:
        raise HTTPException(400, "Image must be at least 256 pixels on each side and have a sensible aspect ratio.")

    # Keep the first local build conservative to reduce memory pressure.
    target_w = 640
    target_h = max(384, int(target_w * height / width))
    target_h = min(768, target_h)
    target_w = max(384, int(target_h * width / height))
    target_w = (target_w // 32) * 32
    target_h = (target_h // 32) * 32
    source.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    frames = max(17, min(41, seconds * 8 + 1))
    output = OUTPUT_DIR / (secrets.token_hex(16) + ".mp4")

    if not job_lock.acquire(blocking=False):
        raise HTTPException(409, "The local engine is already generating a video. Please wait for it to finish.")
    try:
        generator = torch.Generator(device=DEVICE).manual_seed(seed if seed > 0 else secrets.randbelow(2**31))
        model = load_pipeline()
        with torch.inference_mode():
            result = model(
                image=source,
                prompt=prompt.strip(),
                width=target_w,
                height=target_h,
                num_frames=frames,
                num_inference_steps=8,
                guidance_scale=1.0,
                generator=generator,
            )
        export_to_video(result.frames[0], str(output), fps=24)
        return FileResponse(output, media_type="video/mp4", filename="veyra-local-video.mp4")
    except torch.cuda.OutOfMemoryError as exc:
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        raise HTTPException(507, "Not enough GPU memory. Close other GPU applications or use a smaller image / more capable GPU.") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Local generation failed: {type(exc).__name__}. Check the engine terminal for details.") from exc
    finally:
        job_lock.release()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
