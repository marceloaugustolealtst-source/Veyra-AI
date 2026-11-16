"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Clapperboard, Film, ImagePlus, LoaderCircle, Sparkles, Upload, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type VideoMode = "text_to_video" | "image_to_video" | "video_edit";

export default function VideoStudio({ onCreditsChange, onCreated }: { onCreditsChange: (credits: number) => void; onCreated: (creation: { id: string; generationId: string | null; createdAt: string; mediaType: "video"; mediaUrl: string }) => void }) {
  const [mode, setMode] = useState<VideoMode>("image_to_video");
  const [engine, setEngine] = useState<"cloud" | "local">("local");
  const [localReady, setLocalReady] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [ratio, setRatio] = useState("landscape");
  const [voiceStyle, setVoiceStyle] = useState("match_character");
  const [dialogue, setDialogue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [status, setStatus] = useState("");
  const monitorLock = useRef(false);

  useEffect(() => {
    if (!file || mode === "video_edit") { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, mode]);

  async function checkLocalEngine() {\n    try {\n      const response = await fetch("http://127.0.0.1:8765/health", { cache: "no-store" });\n      const health = await response.json() as { ok?: boolean; device?: string };\n      setLocalReady(Boolean(response.ok && health.ok && health.device !== "cpu"));\n      return Boolean(response.ok && health.ok && health.device !== "cpu");\n    } catch { setLocalReady(false); return false; }\n  }\n\n  function changeMode(next: VideoMode) {
    setMode(next);
    setFile(null);
    setPreview("");
    setVideoUrl("");
    setMessage("");
    setStatus("");
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setVideoUrl("");
    setMessage("");
    if (next && mode === "video_edit") {
      const objectUrl = URL.createObjectURL(next);
      try {
        const seconds = await new Promise<number>((resolve, reject) => {
          const element = document.createElement("video");
          element.preload = "metadata";
          element.onloadedmetadata = () => resolve(element.duration);
          element.onerror = () => reject(new Error("The source video duration could not be read."));
          element.src = objectUrl;
        });
        if (!Number.isFinite(seconds) || seconds < 3 || seconds > 30) {
          setMessage("Aleph editing currently accepts source videos from 3 to 30 seconds.");
          setFile(null);
          return;
        }
        setDuration(Math.ceil(seconds));
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : "Could not read the source video.");
        setFile(null);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  async function monitorGeneration(generationId: string) {
    if (monitorLock.current) return;
    monitorLock.current = true;
    window.localStorage.setItem("veyra-active-video-task", generationId);
    try {
      while (true) {
        await new Promise((resolve) => window.setTimeout(resolve, 5000));
        let poll: Response;
        try {
          poll = await fetch("/api/video/" + encodeURIComponent(generationId), { cache: "no-store" });
        } catch {
          setStatus("Connection interrupted. Veyra will keep checking this video automatically.");
          continue;
        }
        if (poll.status >= 500 || poll.status === 429) {
          setStatus("The video service is temporarily busy. Retrying automatically…");
          continue;
        }
        const result = await poll.json() as { status?: string; videoUrl?: string; creditsRemaining?: number; error?: string };
        if (!poll.ok) throw new Error(result.error || "Could not check your video progress.");
        if (result.status === "succeeded" && result.videoUrl) {
          window.localStorage.removeItem("veyra-active-video-task");
          setVideoUrl(result.videoUrl);
          onCreditsChange(Number(result.creditsRemaining ?? 0));
          onCreated({ id: generationId, generationId, createdAt: new Date().toISOString(), mediaType: "video", mediaUrl: result.videoUrl });
          setStatus("Your video is ready and saved to your private library.");
          setMessage("");
          return;
        }
        if (result.status === "failed" || result.status === "cancelled") {
          window.localStorage.removeItem("veyra-active-video-task");
          if (typeof result.creditsRemaining === "number") onCreditsChange(result.creditsRemaining);
          throw new Error(result.error || "Video generation failed. Reserved credits have been returned.");
        }
        setStatus("Your video is processing. Veyra will keep checking until it is ready.");
      }
    } finally {
      monitorLock.current = false;
    }
  }

  useEffect(() => {
    const savedTaskId = window.localStorage.getItem("veyra-active-video-task");
    if (!savedTaskId) return;
    setBusy(true);
    setStatus("Resuming your video generation…");
    void monitorGeneration(savedTaskId).catch((cause) => {
      window.localStorage.removeItem("veyra-active-video-task");
      setMessage(cause instanceof Error ? cause.message : "Video generation could not be resumed.");
      setStatus("");
    }).finally(() => setBusy(false));
  }, []);

  async function start() {
    setMessage("");
    setVideoUrl("");
    setStatus("");
    if (prompt.trim().length < 3) { setMessage("Describe the video or the edit you want."); return; }
    if (mode !== "text_to_video" && !file) { setMessage(mode === "video_edit" ? "Choose a source video first." : "Choose a starting image first."); return; }
    if (file && mode === "video_edit" && (!["video/mp4", "video/webm"].includes(file.type) || file.size > 100 * 1024 * 1024)) {
      setMessage("Choose an MP4 or WebM video up to 100 MB."); return;
    }
    if (file && mode === "image_to_video" && (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 20 * 1024 * 1024)) {
      setMessage("Choose a PNG, JPG or WebP image up to 20 MB."); return;
    }
    if (file && mode === "image_to_video") {
      try {
        const bitmap = await createImageBitmap(file);
        const aspect = bitmap.width / bitmap.height;
        const validDimensions = bitmap.width >= 300 && bitmap.height >= 300 && aspect >= 0.4 && aspect <= 2.5;
        bitmap.close();
        if (!validDimensions) {
          setMessage("For realistic image-to-video, use an image at least 300 × 300 pixels with an aspect ratio between 0.4 and 2.5.");
          return;
        }
      } catch {
        setMessage("The selected image could not be read. Please choose a valid PNG, JPG or WebP image.");
        return;
      }
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Sign in before creating a video.");
      let mediaPath: string | undefined;
      if (file) {
        const extension = file.name.split(".").pop()?.toLowerCase() || (mode === "video_edit" ? "mp4" : "png");
        mediaPath = `${user.id}/video-input-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("veyra-user-media").upload(mediaPath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error("Your source file could not be uploaded. Please try again.");
      }

      const response = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), mode, duration, ratio, mediaPath, voiceStyle, dialogue }),
      });
      const data = await response.json() as { error?: string; generationId?: string; creditsReserved?: number };
      if (!response.ok || !data.generationId) throw new Error(data.error || "The video task could not be started.");
      setStatus("Your video is processing. This can take several minutes.");
      setMessage(`${data.creditsReserved ?? 0} free credits reserved. They are returned automatically if the provider reports a failed generation.`);

      await monitorGeneration(data.generationId);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Video generation failed. Please try again.");
      setStatus("");
      try {
        const walletResponse = await fetch("/api/account", { cache: "no-store" });
        if (walletResponse.ok) {
          const wallet = await walletResponse.json() as { credits?: number };
          if (typeof wallet.credits === "number") onCreditsChange(wallet.credits);
        }
      } catch { /* Keep the last confirmed wallet balance visible. */ }
    } finally {
      setBusy(false);
    }
  }

  const editing = mode === "video_edit";
  const cost = Math.max(1, Math.ceil((duration * 10) / 30));
  return (
    <section className="video-studio" id="video-studio">
      <div className="section-head video-section-head">
        <div><h2>AI video studio</h2><p>Create cinematic clips from text and images, or transform an existing video.</p></div>
        <span className="editor-badge"><Film size={12}/> {engine === "local" ? "LOCAL GPU · FREE" : "RUNWAY AI"}</span>
      </div>
      <div className="video-mode-tabs" role="tablist" aria-label="Video creation mode">\n        <button type="button" className={engine === "local" ? "selected" : ""} onClick={() => { setEngine("local"); changeMode("image_to_video"); }}>Free local engine</button>\n        <button type="button" className={engine === "cloud" ? "selected" : ""} onClick={() => setEngine("cloud")}>Cloud generation</button>
        {engine === "cloud" && <button type="button" className={mode === "text_to_video" ? "selected" : ""} onClick={() => changeMode("text_to_video")}><Sparkles size={14}/> Text to video</button>}
        <button type="button" className={mode === "image_to_video" ? "selected" : ""} onClick={() => changeMode("image_to_video")}><ImagePlus size={14}/> Image to video</button>
        {engine === "cloud" && <button type="button" className={mode === "video_edit" ? "selected" : ""} onClick={() => changeMode("video_edit")}><Clapperboard size={14}/> Video editor</button>}
      </div>
      <div className="video-workspace">\n        {engine === "local" && <p className="generation-message">Free local preview: requires the VEYRA Local Engine and a supported GPU. First launch downloads the model. Local clips are currently 2–5 seconds, silent, and downloaded to your device.</p>}
        <div className="video-controls">
          <label className="editor-label" htmlFor="video-prompt">{editing ? "Describe your video edit" : "Describe your video"}</label>
          <textarea id="video-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1000} placeholder={editing ? "e.g. Change the scene to a golden-hour beach while keeping the subject and camera movement…" : "e.g. A cinematic tracking shot of a futuristic city at dusk, glowing reflections, atmospheric camera movement…"}/>
          {mode !== "text_to_video" && <label className="video-upload">
            {preview ? <img src={preview} alt="Video starting frame"/> : <span><Upload size={20}/><strong>{file ? file.name : editing ? "Upload a source video" : "Upload a starting image"}</strong><small>{editing ? "MP4 or WebM · up to 100 MB · max 30 seconds" : "PNG, JPG or WebP · up to 20 MB"}</small></span>}
            <input type="file" accept={editing ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp"} onChange={handleFile} hidden/>
          </label>}
          {!editing && <>
            {engine === "cloud" && <><label className="editor-label" htmlFor="video-dialogue">Spoken dialogue (optional)</label>
            <textarea id="video-dialogue" value={dialogue} onChange={(event) => setDialogue(event.target.value.slice(0, 500))} maxLength={500} placeholder="Write the exact words you want the person to say. Leave blank for natural scene audio."/>
            <label className="editor-label" htmlFor="video-voice">Voice style</label>
            <select id="video-voice" value={voiceStyle} onChange={(event) => setVoiceStyle(event.target.value)} style={{width:"100%",padding:"10px",border:"1px solid var(--line)",borderRadius:8,background:"#151720",color:"#dedce8",fontSize:11}}>
              <option value="match_character">Match the visible character</option>
              <option value="female">Female-sounding voice</option>
              <option value="male">Male-sounding voice</option>
              <option value="neutral">Gender-neutral voice</option>
            </select>
          </>}
          <div className="editor-selects">
            <label>{editing ? "Detected source length" : "Duration"}<select value={duration} disabled={editing && !!file} onChange={(event) => setDuration(Number(event.target.value))}>{Array.from({ length: 28 }, (_, index) => index + 3).map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
            <label>Aspect ratio<select value={ratio} onChange={(event) => setRatio(event.target.value)}><option value="landscape">Landscape · 16:9</option><option value="portrait">Portrait · 9:16</option><option value="square">Square · 1:1</option></select></label>
          </div>
          <button type="button" className="generate-btn video-generate" disabled={busy || prompt.trim().length < 3} onClick={start}><Video size={15}/>{busy ? "Processing video…" : engine === "local" ? "Generate free on this device" : `Create video · ${cost} free credits`}</button>
          {status && <p className="generation-message" role="status">{status}</p>}
          {message && <p className="generation-message" role="status">{message}</p>}
        </div>
        <div className="video-preview">
          {videoUrl ? <><video src={videoUrl} controls playsInline />{engine === "local" && <a className="generate-btn" href={videoUrl} download="veyra-local-video.mp4">Download MP4</a>}</> : <div className="video-preview-empty">{busy ? <LoaderCircle size={28} className="video-spinner"/> : <Clapperboard size={30}/>}<strong>{busy ? "Creating your video" : "Your video preview"}</strong><span>{busy ? "Veyra is working on your creative direction." : "Your finished video will appear here."}</span></div>}
        </div>
      </div>
      <p className="notice"><Video size={12} style={{display:"inline",verticalAlign:"-2px"}}/> {engine === "local" ? "Local generation uses your own computer. No paid provider API or Veyra credits are used." : "Powered by Runway Kling 4.0 with generated audio. Add dialogue and choose a voice style for synchronized speech. Video generation uses 10 Veyra credits per 30 seconds."}</p>
    </section>
  );
}
