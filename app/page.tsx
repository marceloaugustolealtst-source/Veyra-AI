"use client";

import { useState } from "react";
import { Aperture, Bell, Clapperboard, Compass, CreditCard, Film, ImagePlus, LayoutDashboard, LifeBuoy, LockKeyhole, Plus, Settings2, Sparkles, Upload, WandSparkles, Zap } from "lucide-react";

type Mode = "image" | "video";

export default function Home() {
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [fileName, setFileName] = useState("");

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Veyra AI home">
          <span className="brand-mark">V</span>
          <span><span className="brand-name">VEYRA AI</span><span className="brand-sub">CREATIVE STUDIO</span></span>
        </a>
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav">
          <a className="active" href="#"><LayoutDashboard size={17}/><span>Overview</span></a>
          <a href="#create"><ImagePlus size={17}/><span>Image generator</span></a>
          <a href="#create"><WandSparkles size={17}/><span>AI photo editor</span></a>
          <a href="#create"><Film size={17}/><span>Video generator</span></a>
          <a href="#create"><Clapperboard size={17}/><span>Video editor</span></a>
          <a href="#creations"><Compass size={17}/><span>Explore creations</span></a>
        </nav>
        <div className="nav-label">YOUR LIBRARY</div>
        <nav className="nav">
          <a href="#creations"><Aperture size={17}/><span>My creations</span></a>
          <a href="#plans"><CreditCard size={17}/><span>Plans & credits</span></a>
          <a href="#settings"><Settings2 size={17}/><span>Settings</span></a>
        </nav>
        <div className="side-bottom">
          <div className="upgrade"><strong>Make more with Veyra</strong><p>Unlock more creative possibilities with a Creator plan.</p><button type="button" disabled>Explore plans · Coming soon</button></div>
          <div className="user"><span className="avatar">G</span><span>Guest workspace<small>Sign in to save your work</small></span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="crumb">Workspace <span style={{color:"#55596a"}}>/</span> Overview</div>
          <div className="top-actions"><span className="credit-pill"><Zap size={13} style={{display:"inline",verticalAlign:"-2px",color:"#c5aaff"}}/> <b>0 credits</b></span><button className="icon-btn" aria-label="Notifications" type="button"><Bell size={16}/></button></div>
        </header>

        <section className="welcome">
          <div><div className="eyebrow">YOUR CREATIVE SPACE</div><h1>Make something extraordinary.</h1><p>Bring your ideas to life with image and video creation powered by AI.</p></div>
          <span className="status"><Sparkles size={12} style={{display:"inline",verticalAlign:"-2px",color:"#b79aff"}}/> Studio preview</span>
        </section>

        <section className="studio" id="create">
          <div className="studio-head"><div><h2>What would you like to create?</h2><p>Start with a prompt. Your imagination sets the limit.</p></div>
            <div className="mode-tabs" role="tablist" aria-label="Creation type"><button className={mode === "image" ? "selected" : ""} onClick={() => setMode("image")} role="tab" aria-selected={mode === "image"} type="button">✦ Image</button><button className={mode === "video" ? "selected" : ""} onClick={() => setMode("video")} role="tab" aria-selected={mode === "video"} type="button">▶ Video</button></div>
          </div>
          <div className="prompt-wrap">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === "image" ? "Describe the image you imagine… e.g. A cinematic editorial portrait in warm golden-hour light, shot on an 85mm lens." : "Describe the video you imagine… e.g. A slow cinematic camera push through a misty mountain valley at sunrise."} aria-label="Creative prompt"/>
            <div className="prompt-footer"><div className="prompt-tools"><label className="soft-btn" style={{display:"inline-flex",alignItems:"center",gap:7,cursor:"pointer"}}><Upload size={13}/> {fileName ? fileName : "Upload reference"}<input type="file" accept="image/*,video/*" hidden onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}/></label><button className="soft-btn" type="button" disabled style={{opacity:.5}}>Settings · Soon</button></div><button className="generate-btn" type="button" disabled><Sparkles size={14} style={{display:"inline",verticalAlign:"-2px"}}/> Generate · Coming soon</button></div>
          </div>
          <p className="notice"><LockKeyhole size={11} style={{display:"inline",verticalAlign:"-2px"}}/> Generation is not connected yet. We’ll activate this workspace after secure AI provider setup.</p>
        </section>

        <section id="tools">
          <div className="section-head"><h2>Creative tools</h2><a href="#create">Explore workspace ↗</a></div>
          <div className="tool-grid">
            <a className="tool-card" href="#create"><span className="tool-symbol"><ImagePlus size={18}/></span><strong>Image generation</strong><p>Turn a text description into a visual creation.</p></a>
            <a className="tool-card" href="#create"><span className="tool-symbol"><WandSparkles size={18}/></span><strong>Photo editing</strong><p>Transform, refine and enhance your images.</p></a>
            <a className="tool-card" href="#create"><span className="tool-symbol"><Film size={18}/></span><strong>Video generation</strong><p>Bring a prompt or still image into motion.</p></a>
            <a className="tool-card" href="#create"><span className="tool-symbol"><Clapperboard size={18}/></span><strong>Video editing</strong><p>Shape clips and build cinematic sequences.</p></a>
          </div>
        </section>

        <section id="creations">
          <div className="section-head"><h2>Discover what’s possible</h2><a href="#create">Start creating ↗</a></div>
          <div className="gallery">
            <div className="gallery-card"><div className="gallery-art"/><div className="gallery-label">Cinematic portrait<small>Editorial · Photorealistic</small></div></div>
            <div className="gallery-card"><div className="gallery-art"/><div className="gallery-label">Dreamlike fashion<small>Studio lighting · Creative</small></div></div>
            <div className="gallery-card"><div className="gallery-art"/><div className="gallery-label">Beyond the horizon<small>Atmospheric · Cinematic</small></div></div>
          </div>
        </section>
        <footer className="footer-note"><span>© 2026 Veyra AI. Imagine it. Bring it to life.</span><span>Creative tools are in preview · AI generation coming soon</span></footer>
      </main>
    </div>
  );
}
