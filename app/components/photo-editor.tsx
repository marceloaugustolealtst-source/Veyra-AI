"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { ImagePlus, Sparkles, Upload, X } from "lucide-react";

type EditedCreation = { id: string; generationId: string | null; createdAt: string; imageUrl: string };

export default function PhotoEditor({
  onCreated,
  onCreditsChange,
}: {
  onCreated: (creation: EditedCreation) => void;
  onCreditsChange: (credits: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [size, setSize] = useState("1024x1024");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState("");

  useEffect(() => {
    if (!file) { setPreview(""); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setResult("");
    setMessage("");
  }

  async function handleEdit() {
    setMessage("");
    setResult("");
    if (!file) { setMessage("Upload an image to start editing."); return; }
    if (prompt.trim().length < 3) { setMessage("Describe the changes you want to make."); return; }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("image", file);
      body.set("prompt", prompt.trim());
      body.set("quality", quality);
      body.set("size", size);
      const response = await fetch("/api/edit", { method: "POST", body });
      const data = await response.json() as { error?: string; imageUrl?: string; generationId?: string; creditsRemaining?: number };
      if (!response.ok) throw new Error(data.error || "Photo editing failed.");
      if (!data.imageUrl) throw new Error("The edited image was returned without a preview link.");
      setResult(data.imageUrl);
      onCreditsChange(Number(data.creditsRemaining ?? 0));
      onCreated({
        id: data.generationId ?? crypto.randomUUID(),
        generationId: data.generationId ?? null,
        createdAt: new Date().toISOString(),
        imageUrl: data.imageUrl,
      });
      setMessage("Your edited image is ready and saved privately in My creations.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Photo editing failed. Please try again.");
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

  const cost = quality === "low" ? 8 : quality === "high" ? 20 : 12;

  return (
    <section className="photo-editor" id="photo-editor">
      <div className="section-head editor-section-head">
        <div><h2>AI photo editor</h2><p>Upload a photo and describe exactly what you want Veyra to change.</p></div>
        <span className="editor-badge"><Sparkles size={12}/> AI EDITING</span>
      </div>
      <div className="editor-workspace">
        <label className="editor-upload">
          {preview ? <img src={preview} alt="Selected image to edit"/> : <span className="editor-upload-empty"><ImagePlus size={25}/><strong>Choose an image</strong><small>PNG, JPG or WebP · Max 4 MB</small></span>}
          <span className="editor-upload-action"><Upload size={14}/> {file ? "Change image" : "Upload image"}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={selectFile} hidden/>
        </label>
        <div className="editor-controls">
          <label className="editor-label" htmlFor="edit-prompt">What should change?</label>
          <textarea id="edit-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="e.g. Replace the background with a modern studio, keep the subject's face and clothing unchanged…" maxLength={32000}/>
          <div className="editor-selects">
            <label>Output size<select value={size} onChange={(event) => setSize(event.target.value)}><option value="1024x1024">Square · 1:1</option><option value="1536x1024">Landscape · 3:2</option><option value="1024x1536">Portrait · 2:3</option></select></label>
            <label>Quality<select value={quality} onChange={(event) => setQuality(event.target.value as "low" | "medium" | "high")}><option value="low">Draft · 8 credits</option><option value="medium">Standard · 12 credits</option><option value="high">High · 20 credits</option></select></label>
          </div>
          <button className="generate-btn editor-generate" type="button" onClick={handleEdit} disabled={busy || !file || prompt.trim().length < 3}><Sparkles size={14}/> {busy ? "Editing image…" : `Edit image · ${cost} credits`}</button>
          {message && <p className="generation-message" role="status">{message}</p>}
          {result && <a className="editor-result-link" href={result} target="_blank" rel="noreferrer">View edited image ↗</a>}
        </div>
      </div>
    </section>
  );
}
