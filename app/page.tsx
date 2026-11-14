"use client";

import { useEffect, useState } from "react";
import { Aperture, Bell, Clapperboard, Compass, CreditCard, Film, ImagePlus, LayoutDashboard, LockKeyhole, LogOut, Settings2, Sparkles, Upload, WandSparkles, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import PhotoEditor from "@/app/components/photo-editor";
import VideoStudio from "@/app/components/video-studio";

type Mode = "image" | "video";
type Creation = { id: string; generationId: string | null; createdAt: string; imageUrl?: string; mediaUrl?: string; mediaType?: "image" | "video" };

export default function Home() {
  const [mode, setMode] = useState<Mode>("image");
  const [prompt, setPrompt] = useState("");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [size, setSize] = useState("1024x1024");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [generatedImage, setGeneratedImage] = useState("");
  const [creations, setCreations] = useState<Creation[]>([]);
  const [account, setAccount] = useState<{ email: string; name: string; credits: number } | null>(null);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;
    const supabase = createClient();
    let active = true;
    const loadAccount = async (user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null) => {
      if (!user) { if (active) setAccount(null); return; }
      const [{ data: profile }, { data: wallet }] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        supabase.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
      ]);
      if (!active) return;
      setAccount({ email: user.email ?? "", name: String(profile?.full_name ?? user.user_metadata?.full_name ?? user.email ?? "Your account"), credits: Number(wallet?.balance ?? 0) });
      const historyResponse = await fetch("/api/creations");
      if (historyResponse.ok) {
        const history = await historyResponse.json() as { creations?: Array<{ id: string; generationId: string | null; createdAt: string; mediaType: "image" | "video"; mediaUrl: string }> };
        if (active) setCreations((history.creations ?? []).map((item) => ({ id: item.id, generationId: item.generationId, createdAt: item.createdAt, mediaType: item.mediaType, mediaUrl: item.mediaUrl, imageUrl: item.mediaType === "image" ? item.mediaUrl : undefined })));
      }
    };
    void supabase.auth.getUser().then(({ data }) => loadAccount(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { void loadAccount(session?.user ?? null); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  async function handleSignOut() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    setAccount(null);
  }

  async function handleGenerate() {
    setMessage("");
    setGeneratedImage("");
    if (mode !== "image") { document.getElementById("video-studio")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (!account) { setMessage("Please sign in or create an account before generating."); return; }
    if (prompt.trim().length < 3) { setMessage("Describe the image you want to create first."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt.trim(), quality, size }) });
      const result = await response.json() as { error?: string; imageUrl?: string; generationId?: string; creditsRemaining?: number };
      if (!response.ok) throw new Error(result.error || "Image generation failed.");
      if (!result.imageUrl) throw new Error("The image was generated but no preview link was returned.");
      setGeneratedImage(result.imageUrl);
      setCreations((current) => [{ id: result.generationId ?? crypto.randomUUID(), generationId: result.generationId ?? null, createdAt: new Date().toISOString(), imageUrl: result.imageUrl! }, ...current].slice(0, 18));
      setAccount((current) => current ? { ...current, credits: Number(result.creditsRemaining ?? current.credits) } : current);
      setMessage("Your image is ready and saved privately in My creations.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Image generation failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const cost = quality === "low" ? 8 : quality === "high" ? 20 : 12;
  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Veyra AI home"><span className="brand-mark">V</span><span><span className="brand-name">VEYRA AI</span><span className="brand-sub">CREATIVE STUDIO</span></span></a>
        <div className="nav-label">WORKSPACE</div>
        <nav className="nav"><a className="active" href="#"><LayoutDashboard size={17}/><span>Overview</span></a><a href="#create"><ImagePlus size={17}/><span>Image generator</span></a><a href="#photo-editor"><WandSparkles size={17}/><span>AI photo editor</span></a><a href="#video-studio"><Film size={17}/><span>Video generator</span></a><a href="#video-studio"><Clapperboard size={17}/><span>Video editor</span></a><a href="#creations"><Compass size={17}/><span>Explore creations</span></a></nav>
        <div className="nav-label">YOUR LIBRARY</div>
        <nav className="nav"><a href="#creations"><Aperture size={17}/><span>My creations</span></a><a href="#plans"><CreditCard size={17}/><span>Plans & credits</span></a><a href="#settings"><Settings2 size={17}/><span>Settings</span></a></nav>
        <div className="side-bottom"><div className="upgrade"><strong>Make more with Veyra</strong><p>Unlock more creative possibilities with a Creator plan.</p><button type="button" disabled>Explore plans · Coming soon</button></div><div className="user"><span className="avatar">{account ? account.name.slice(0,1).toUpperCase() : "G"}</span><span>{account ? account.name : "Guest workspace"}<small>{account ? account.email : <a href="/auth">Create an account to save your work</a>}</small></span></div></div>
      </aside>
      <main className="main">
        <header className="topbar"><div className="crumb">Workspace <span style={{color:"#55596a"}}>/</span> Overview</div><div className="top-actions">{account ? <button className="account-link" type="button" onClick={handleSignOut}><LogOut size={13} style={{display:"inline",verticalAlign:"-2px"}}/> Sign out</button> : <a className="account-link" href="/auth">Sign in / Create account</a>}<span className="credit-pill"><Zap size={13} style={{display:"inline",verticalAlign:"-2px",color:"#c5aaff"}}/> <b>{account ? account.credits.toLocaleString() : 0} credits</b></span><button className="icon-btn" aria-label="Notifications" type="button"><Bell size={16}/></button></div></header>
        <section className="welcome"><div><div className="eyebrow">YOUR CREATIVE SPACE</div><h1>Make something extraordinary.</h1><p>Bring your ideas to life with image and video creation powered by AI.</p></div><span className="status"><Sparkles size={12} style={{display:"inline",verticalAlign:"-2px",color:"#b79aff"}}/> Image studio</span></section>
        <section className="studio" id="create">
          <div className="studio-head"><div><h2>What would you like to create?</h2><p>Write a prompt, choose your image quality and generate.</p></div><div className="mode-tabs" role="tablist" aria-label="Creation type"><button className={mode === "image" ? "selected" : ""} onClick={() => setMode("image")} role="tab" aria-selected={mode === "image"} type="button">✦ Image</button><button className={mode === "video" ? "selected" : ""} onClick={() => setMode("video")} role="tab" aria-selected={mode === "video"} type="button">▶ Video</button></div></div>
          <div className="prompt-wrap"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the image you imagine… e.g. A cinematic editorial portrait in warm golden-hour light, shot on an 85mm lens." aria-label="Creative prompt"/>
            <div className="prompt-footer"><div className="prompt-tools"><span className="soft-btn" style={{display:"inline-flex",alignItems:"center",gap:7,opacity:.55}}><Upload size={13}/> Reference editing · Soon</span><select className="soft-btn" aria-label="Image size" value={size} onChange={(event) => setSize(event.target.value)}><option value="1024x1024">Square · 1:1</option><option value="1536x1024">Landscape · 3:2</option><option value="1024x1536">Portrait · 2:3</option></select><select className="soft-btn" aria-label="Image quality" value={quality} onChange={(event) => setQuality(event.target.value as "low" | "medium" | "high")}><option value="low">Draft · 8 credits</option><option value="medium">Standard · 12 credits</option><option value="high">High · 20 credits</option></select></div><button className="generate-btn" type="button" onClick={handleGenerate} disabled={busy || (mode === "image" && !prompt.trim())} style={{cursor:busy ? "wait" : "pointer",opacity:busy ? 0.65 : 1}}><Sparkles size={14} style={{display:"inline",verticalAlign:"-2px"}}/> {busy ? "Creating image…" : mode === "image" ? `Generate · ${cost} credits` : "Video · Coming soon"}</button></div>
          </div>
          <p className="notice"><LockKeyhole size={11} style={{display:"inline",verticalAlign:"-2px"}}/> Images are generated on the server, stored in your private Veyra library, and charged after a successful credit reservation. Failed generations are refunded automatically.</p>
          {message && <p className="generation-message" role="status">{message}</p>}
          {generatedImage && <div className="generated-result"><img src={generatedImage} alt="Your AI-generated image"/><div><strong>Image created successfully</strong><span>Saved privately · Preview link expires in one hour</span><a href={generatedImage} target="_blank" rel="noreferrer">Open full image ↗</a></div></div>}
        </section>
        <PhotoEditor onCreated={(creation) => setCreations((current) => [creation, ...current].slice(0, 18))} onCreditsChange={(credits) => setAccount((current) => current ? { ...current, credits } : current)} />
        <VideoStudio onCreditsChange={(credits) => setAccount((current) => current ? { ...current, credits } : current)} onCreated={(creation) => setCreations((current) => [creation, ...current].slice(0, 30))} />
        <section id="tools"><div className="section-head"><h2>Creative tools</h2><a href="#create">Explore workspace ↗</a></div><div className="tool-grid"><a className="tool-card" href="#create"><span className="tool-symbol"><ImagePlus size={18}/></span><strong>Image generation</strong><p>Turn a text description into a visual creation.</p></a><a className="tool-card" href="#create"><span className="tool-symbol"><WandSparkles size={18}/></span><strong>Photo editing</strong><p>Transform, refine and enhance your images.</p></a><a className="tool-card" href="#video-studio"><span className="tool-symbol"><Film size={18}/></span><strong>Video generation</strong><p>Bring a prompt or still image into motion.</p></a><a className="tool-card" href="#video-studio"><span className="tool-symbol"><Clapperboard size={18}/></span><strong>Video editing</strong><p>Shape clips and build cinematic sequences.</p></a></div></section>
        <section id="creations"><div className="section-head"><h2>My creations</h2><a href="#create">Create another ↗</a></div>
          {creations.length > 0 ? <div className="saved-creations">{creations.map((creation) => <a className="saved-creation" href={creation.mediaUrl ?? creation.imageUrl ?? "#"} target="_blank" rel="noreferrer" key={creation.id}>{creation.mediaType === "video" ? <video src={creation.mediaUrl} muted playsInline preload="metadata"/> : <img src={creation.mediaUrl ?? creation.imageUrl} alt="Saved AI creation"/>}<span>{creation.mediaType === "video" ? "VIDEO · " : ""}{new Date(creation.createdAt).toLocaleDateString()}</span></a>)}</div> : <div className="empty-creations"><Sparkles size={18}/><strong>Your creative library is ready</strong><span>Images and videos you create will appear here and stay saved to your private account.</span></div>}
        </section>
        <footer className="footer-note"><span>© 2026 Veyra AI. Imagine it. Bring it to life.</span><span>Image and video studio · Secure provider connections</span></footer>
      </main>
    </div>
  );
}
