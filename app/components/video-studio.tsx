"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Clapperboard, Film, ImagePlus, LoaderCircle, Sparkles, Upload, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type VideoMode = "text_to_video" | "image_to_video" | "video_edit";

export default function VideoStudio({ onCreditsChange, onCreated }: { onCreditsChange: (credits: number) => void; onCreated: (creation: { id: string; generationId: string | null; createdAt: string; mediaType: "video"; mediaUrl: string }) => void }) {
  const [mode, setMode] = useState<VideoMode>("text_to_video");
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [ratio, setRatio] = useState("landscape");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!file || mode === "video_edit") { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file, mode]);

  function changeMode(next: VideoMode) {
    setMode(next);
    setFile(null);
    setPreview("");
    setVideoUrl("");
    setMessage("");
    setStatus("");
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setVideoUrl("");
    setMessage("");
  }

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
        body: JSON.stringify({ prompt: prompt.trim(), mode, duration, ratio, mediaPath }),
      });
      const data = await response.json() as { error?: string; generationId?: string; creditsReserved?: number };
      if (!response.ok || !data.generationId) throw new Error(data.error || "The video task could not be started.");
      setStatus("Your video is processing. This can take several minutes.");
      setMessage(`${data.creditsReserved ?? 0} credits reserved. They are returned automatically if the provider reports a failed generation.`);

      for (let attempt = 0; attempt < 90; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const poll = await fetch(`/api/video/${data.generationId}`, { cache: "no-store" });
        const result = await poll.json() as { status?: string; videoUrl?: string; creditsRemaining?: number; error?: string };
        if (!poll.ok) throw new Error(result.error || "Could not check your video progress.");
        if (result.status === "succeeded" && result.videoUrl) {
          setVideoUrl(result.videoUrl);
          onCreditsChange(Number(result.creditsRemaining ?? 0));
          onCreated({ id: data.generationId, generationId: data.generationId, createdAt: new Date().toISOString(), mediaType: "video", mediaUrl: result.videoUrl });
          setStatus("Your video is ready and saved to your private library.");
          setMessage("");
          return;
        }
        if (result.status === "failed" || result.status === "cancelled") throw new Error(result.error || "Video generation failed. Reserved credits have been returned.");
      }
      setStatus("Your video is still processing. Keep this page open and check again shortly; the video is still processing.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Video generation failed. Please try again.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  const editing = mode === "video_edit";
  const cost = duration * (editing ? 36 : 20);
  return (
    <section className="video-studio" id="video-studio">
      <div className="section-head video-section-head">
        <div><h2>AI video studio</h2><p>Create cinematic clips from text and images, or transform an existing video.</p></div>
        <span className="editor-badge"><Film size={12}/> RUNWAY AI</span>
      </div>
      <div className="video-mode-tabs" role="tablist" aria-label="Video creation mode">
        <button type="button" className={mode === "text_to_video" ? "selected" : ""} onClick={() => changeMode("text_to_video")}><Sparkles size={14}/> Text to video</button>
        <button type="button" className={mode === "image_to_video" ? "selected" : ""} onClick={() => changeMode("image_to_video")}><ImagePlus size={14}/> Image to video</button>
        <button type="button" className={mode === "video_edit" ? "selected" : ""} onClick={() => changeMode("video_edit")}><Clapperboard size={14}/> Video editor</button>
      </div>
      <div className="video-workspace">
        <div className="video-controls">
          <label className="editor-label" htmlFor="video-prompt">{editing ? "Describe your video edit" : "Describe your video"}</label>
          <textarea id="video-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1000} placeholder={editing ? "e.g. Change the scene to a golden-hour beach while keeping the subject and camera movement…" : "e.g. A cinematic tracking shot of a futuristic city at dusk, glowing reflections, atmospheric camera movement…"}/>
          {mode !== "text_to_video" && <label className="video-upload">
            {preview ? <img src={preview} alt="Video starting frame"/> : <span><Upload size={20}/><strong>{file ? file.name : editing ? "Upload a source video" : "Upload a starting image"}</strong><small>{editing ? "MP4 or WebM · up to 100 MB · max 30 seconds" : "PNG, JPG or WebP · up to 20 MB"}</small></span>}
            <input type="file" accept={editing ? "video/mp4,video/webm,video/quicktime" : "image/png,image/jpeg,image/webp"} onChange={handleFile} hidden/>
          </label>}
          <div className="editor-selects">
            <label>Duration<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}>{[5,10,15,20,25,30].map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
            <label>Aspect ratio<select value={ratio} onChange={(event) => setRatio(event.target.value)}><option value="landscape">Landscape · 16:9</option><option value="portrait">Portrait · 9:16</option><option value="square">Square · 1:1</option></select></label>
          </div>
          <button type="button" className="generate-btn video-generate" disabled={busy || prompt.trim().length < 3} onClick={start}><Video size={15}/>{busy ? "Processing video…" : `Create video · ${cost} credits`}</button>
          {status && <p className="generation-message" role="status">{status}</p>}
          {message && <p className="generation-message" role="status">{message}</p>}
        </div>
        <div className="video-preview">
          {videoUrl ? <video src={videoUrl} controls playsInline /> : <div className="video-preview-empty">{busy ? <LoaderCircle size={28} className="video-spinner"/> : <Clapperboard size={30}/>}<strong>{busy ? "Creating your video" : "Your video preview"}</strong><span>{busy ? "Veyra is working on your creative direction." : "Your finished video will appear here."}</span></div>}
        </div>
      </div>
      <p className="notice"><Video size={12} style={{display:"inline",verticalAlign:"-2px"}}/> Powered by Runway. Initial models: Kling 4.0 for creation and Aleph 2.0 for video editing. Video credits are configurable in Vercel.</p>
    </section>
  );
}
