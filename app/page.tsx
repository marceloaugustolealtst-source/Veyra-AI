"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Aperture, Bell, Clapperboard, Compass, Film, ImagePlus, LayoutDashboard, LockKeyhole, LogOut, Settings2, Sparkles, Upload, WandSparkles, Zap, Video } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
const StudioLoader = () => <div className="studio-lazy-placeholder" aria-label="Loading creative studio"><span className="loading-orb" />Loading studio tools…</div>;
const PhotoEditor = dynamic(() => import("@/app/components/photo-editor"), { loading: StudioLoader });
const VideoStudio = dynamic(() => import("@/app/components/video-studio"), { loading: StudioLoader });
const LiveCallStudio = dynamic(() => import("@/app/components/live-call-studio"), { loading: StudioLoader });

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
  type Notification = { id: string; notification_type: string; title: string; message: string; related_id: string | null; read_at: string | null; created_at: string };
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationShake, setNotificationShake] = useState(false);
  const latestNotificationId = useRef<string | null>(null);

  async function refreshNotifications(animateNew = false) {
    const response = await fetch("/api/notifications", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json() as { notifications?: Notification[] };
    const next = data.notifications ?? [];
    const newestId = next[0]?.id ?? null;
    if (animateNew && latestNotificationId.current && newestId && newestId !== latestNotificationId.current) setNotificationShake(true);
    latestNotificationId.current = newestId;
    setNotifications(next);
  }

  async function markNotificationRead(id?: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : { all: true }),
    });
    await refreshNotifications();
  }

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return;
    const supabase = createClient();
    let active = true;
    const loadAccount = async (user: { id: string; email?: string; user_metadata?: { full_name?: string } } | null) => {
      if (!user) { if (active) setAccount(null); return; }
      const accountResponse = await fetch("/api/account", { cache: "no-store" });
      if (!accountResponse.ok) {
        if (active) setAccount({ email: user.email ?? "", name: String(user.user_metadata?.full_name ?? user.email ?? "Your account"), credits: 0 });
        return;
      }
      const accountData = await accountResponse.json() as { email?: string; name?: string; credits?: number };
      if (!active) return;
      setAccount({ email: accountData.email ?? user.email ?? "", name: accountData.name ?? user.email ?? "Your account", credits: Number(accountData.credits ?? 0) });
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

  useEffect(() => {
    if (!account) {
      setNotifications([]);
      latestNotificationId.current = null;
      return;
    }
    void refreshNotifications();
    const timer = window.setInterval(() => { void refreshNotifications(true); }, 20000);
    return () => window.clearInterval(timer);
  }, [account?.email]);

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
      try {
        const walletResponse = await fetch("/api/account", { cache: "no-store" });
        if (walletResponse.ok) {
          const wallet = await walletResponse.json() as { email?: string; name?: string; credits?: number };
          setAccount((current) => current ? {
            ...current,
            email: wallet.email ?? current.email,
            name: wallet.name ?? current.name,
            credits: Number(wallet.credits ?? 0),
          } : current);
        }
      } catch { /* Keep the last confirmed wallet balance visible. */ }
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
        <nav className="nav"><a className="active" href="#"><LayoutDashboard size={17}/><span>Overview</span></a><a href="#create"><ImagePlus size={17}/><span>Image generator</span></a><a href="#photo-editor"><WandSparkles size={17}/><span>AI photo editor</span></a><a href="#video-studio"><Film size={17}/><span>Video generator</span></a><a href="#video-studio"><Clapperboard size={17}/><span>Video editor</span></a><a href="#live-call-studio"><Video size={17}/><span>Live call avatars</span></a><a href="#creations"><Compass size={17}/><span>Explore creations</span></a></nav>
        <div className="nav-label">YOUR LIBRARY</div>
        <nav className="nav"><a href="#creations"><Aperture size={17}/><span>My creations</span></a><a href="#plans"><Zap size={17}/><span>Free credits</span></a><a href="#settings"><Settings2 size={17}/><span>Account settings</span></a></nav>
        <div className="side-bottom"><div className="user"><span className="avatar">{account ? account.name.slice(0,1).toUpperCase() : "G"}</span><span>{account ? account.name : "Guest workspace"}<small>{account ? account.email : <a href="/auth">Create an account to save your work</a>}</small></span></div></div>
      </aside>
      <main className="main">
        <nav className="mobile-dock" aria-label="Mobile app navigation">
          <a href="#create"><ImagePlus size={19}/><span>Create</span></a>
          <a href="#photo-editor"><WandSparkles size={19}/><span>Edit</span></a>
          <a href="#video-studio"><Film size={19}/><span>Video</span></a>
          <a href="#creations"><Aperture size={19}/><span>Library</span></a>
          <a href="#settings"><Settings2 size={19}/><span>Account</span></a>
        </nav>
        <header className="topbar"><div className="crumb">Workspace <span style={{color:"#55596a"}}>/</span> Overview</div><div className="top-actions">{account?.email.toLowerCase() === "hoangthi3000@gmail.com" && <a className="account-link" href="/admin">Admin credits</a>}{account ? <button className="account-link" type="button" onClick={handleSignOut}><LogOut size={13} style={{display:"inline",verticalAlign:"-2px"}}/> Sign out</button> : <a className="account-link" href="/auth">Sign in / Create account</a>}<span className="credit-pill"><Zap size={13} style={{display:"inline",verticalAlign:"-2px",color:"#c5aaff"}}/> <b>{account ? account.credits.toLocaleString() : 0} credits</b></span><div className="notification-wrap">
            <button className={"icon-btn notification-button " + (notificationShake ? "notification-shake" : "")} aria-label={"Notifications, " + notifications.filter(item => !item.read_at).length + " unread"} aria-expanded={notificationsOpen} type="button" onClick={() => { setNotificationsOpen(open => !open); setNotificationShake(false); }}>
              <Bell size={16}/>{notifications.some(item => !item.read_at) && <span className="notification-dot" />}
            </button>
            {notificationsOpen && <div className="notification-panel" role="dialog" aria-label="Notifications">
              <div className="notification-panel-head"><strong>Notifications</strong><button type="button" onClick={() => void markNotificationRead()}>Mark all read</button></div>
              <div className="notification-list">
                {notifications.length ? notifications.map(item => <button type="button" className={"notification-item " + (item.read_at ? "" : "unread")} key={item.id} onClick={() => { if (!item.read_at) void markNotificationRead(item.id); }}>
                  <span className="notification-item-icon">{item.notification_type === "credits" ? <Zap size={14}/> : <Sparkles size={14}/>}</span>
                  <span><strong>{item.title}</strong><small>{item.message}</small><time>{new Date(item.created_at).toLocaleString()}</time></span>
                  {!item.read_at && <i />}
                </button>) : <p className="notification-empty">You're all caught up. New updates will appear here.</p>}
              </div>
            </div>}
          </div></div></header>
        <section className="welcome"><div><div className="eyebrow">YOUR CREATIVE SPACE</div><h1>Make something extraordinary.</h1><p>Bring your ideas to life with image and video creation powered by AI.</p></div><span className="status"><Sparkles size={12} style={{display:"inline",verticalAlign:"-2px",color:"#b79aff"}}/> Image studio</span></section>
        <section className="studio" id="create">
          <div className="studio-head"><div><h2>What would you like to create?</h2><p>Write a prompt, choose your image quality and generate.</p></div><div className="mode-tabs" role="tablist" aria-label="Creation type"><button className={mode === "image" ? "selected" : ""} onClick={() => setMode("image")} role="tab" aria-selected={mode === "image"} type="button">✦ Image</button><button className={mode === "video" ? "selected" : ""} onClick={() => setMode("video")} role="tab" aria-selected={mode === "video"} type="button">▶ Video</button></div></div>
          <div className="prompt-wrap"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the image you imagine… e.g. A cinematic editorial portrait in warm golden-hour light, shot on an 85mm lens." aria-label="Creative prompt"/>
            <div className="prompt-footer"><div className="prompt-tools"><span className="soft-btn" style={{display:"inline-flex",alignItems:"center",gap:7,opacity:.55}}><Upload size={13}/> Edit a reference image below</span><select className="soft-btn" aria-label="Image size" value={size} onChange={(event) => setSize(event.target.value)}><option value="1024x1024">Square · 1:1</option><option value="1536x1024">Landscape · 3:2</option><option value="1024x1536">Portrait · 2:3</option></select><select className="soft-btn" aria-label="Image quality" value={quality} onChange={(event) => setQuality(event.target.value as "low" | "medium" | "high")}><option value="low">Draft · 8 credits</option><option value="medium">Standard · 12 credits</option><option value="high">High · 20 credits</option></select></div><button className="generate-btn" type="button" onClick={handleGenerate} disabled={busy || (mode === "image" && !prompt.trim())} style={{cursor:busy ? "wait" : "pointer",opacity:busy ? 0.65 : 1}}><Sparkles size={14} style={{display:"inline",verticalAlign:"-2px"}}/> {busy ? "Creating image…" : mode === "image" ? `Generate · ${cost} credits` : "Open video studio"}</button></div>
          </div>
          <p className="notice"><LockKeyhole size={11} style={{display:"inline",verticalAlign:"-2px"}}/> Images are generated on the server and saved to your private Veyra library. Free credits are used only after a successful generation; failed generations are refunded automatically.</p>
          {message && <p className="generation-message" role="status">{message}</p>}
          {generatedImage && <div className="generated-result"><img src={generatedImage} alt="Your AI-generated image"/><div><strong>Image created successfully</strong><span>Saved privately · Preview link expires in one hour</span><a href={generatedImage} target="_blank" rel="noreferrer">Open full image ↗</a></div></div>}
        </section>
        <PhotoEditor onCreated={(creation) => setCreations((current) => [creation, ...current].slice(0, 18))} onCreditsChange={(credits) => setAccount((current) => current ? { ...current, credits } : current)} />
        <VideoStudio onCreditsChange={(credits) => setAccount((current) => current ? { ...current, credits } : current)} onCreated={(creation) => setCreations((current) => [creation, ...current].slice(0, 30))} />
        <LiveCallStudio signedIn={Boolean(account)} />
        <section id="tools"><div className="section-head"><h2>Creative tools</h2><a href="#create">Explore workspace ↗</a></div><div className="tool-grid"><a className="tool-card" href="#create"><span className="tool-symbol"><ImagePlus size={18}/></span><strong>Image generation</strong><p>Turn a text description into a visual creation.</p></a><a className="tool-card" href="#create"><span className="tool-symbol"><WandSparkles size={18}/></span><strong>Photo editing</strong><p>Transform, refine and enhance your images.</p></a><a className="tool-card" href="#video-studio"><span className="tool-symbol"><Film size={18}/></span><strong>Video generation</strong><p>Bring a prompt or still image into motion.</p></a><a className="tool-card" href="#video-studio"><span className="tool-symbol"><Clapperboard size={18}/></span><strong>Video editing</strong><p>Shape clips and build cinematic sequences.</p></a></div></section>
        <section id="creations"><div className="section-head"><h2>My creations</h2><a href="#create">Create another ↗</a></div>
          {creations.length > 0 ? <div className="saved-creations">{creations.map((creation) => <a className="saved-creation" href={creation.mediaUrl ?? creation.imageUrl ?? "#"} target="_blank" rel="noreferrer" key={creation.id}>{creation.mediaType === "video" ? <video src={creation.mediaUrl} muted playsInline preload="metadata"/> : <img src={creation.mediaUrl ?? creation.imageUrl} alt="Saved AI creation"/>}<span>{creation.mediaType === "video" ? "VIDEO · " : ""}{new Date(creation.createdAt).toLocaleDateString()}</span></a>)}</div> : <div className="empty-creations"><Sparkles size={18}/><strong>Your creative library is ready</strong><span>Images and videos you create will appear here and stay saved to your private account.</span></div>}
        </section>
        <section id="plans" className="account-info-section">
          <div className="section-head"><h2>Free credits</h2></div>
          <div className="account-info-card"><strong>{account ? account.credits.toLocaleString() : "Sign in"} credits available</strong><p>Veyra is free to use. Every new account starts with 500 free credits. Credits are free usage units for image generation, photo editing and video creation. A 30-second video uses 10 credits. No subscriptions, purchases or payment details are required.</p></div>
        </section>
        <section id="settings" className="account-info-section">
          <div className="section-head"><h2>Account settings</h2></div>
          <div className="account-info-card"><strong>{account?.name ?? "Guest workspace"}</strong><p>{account ? account.email : "Sign in to view your account details."}</p><a href="/auth">{account ? "Manage sign-in and account access" : "Sign in or create an account"}</a></div>
        </section>
        <footer className="footer-note"><span>© 2026 Veyra AI. Imagine it. Bring it to life.</span><span>Image and video studio · Secure provider connections</span></footer>
      </main>
    </div>
  );
}
