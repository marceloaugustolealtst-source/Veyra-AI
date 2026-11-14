"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, ImagePlus, Info, LockKeyhole, Mic, MonitorUp, Radio, ScanFace, ShieldCheck, UserRound, Video, VideoOff } from "lucide-react";

type AvatarMode = "full" | "half";

export default function LiveCallStudio({ signedIn }: { signedIn: boolean }) {
  const [mode, setMode] = useState<AvatarMode>("full");
  const [photo, setPhoto] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [permission, setPermission] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [stage, setStage] = useState<"setup" | "preview">("setup");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access requires HTTPS and a supported browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError("Camera permission was denied or the camera is already in use. Check your browser permissions and try again.");
      setCameraOn(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  function choosePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setCameraError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setCameraError("Choose an image smaller than 12 MB.");
      return;
    }
    const next = URL.createObjectURL(file);
    setPhoto((old) => {
      if (old) URL.revokeObjectURL(old);
      return next;
    });
    setPhotoName(file.name);
    setStage("setup");
    setCameraError("");
  }

  const ready = Boolean(photo && permission && cameraOn && signedIn);

  return (
    <section className="live-call-studio" id="live-call-studio">
      <div className="live-call-head">
        <div>
          <div className="live-call-kicker"><Radio size={13} /> VEYRA LIVE</div>
          <h2>Live call avatar studio</h2>
          <p>Choose a photo avatar and prepare your camera for a live session.</p>
        </div>
        <span className="live-call-free"><LockKeyhole size={12} /> Free studio</span>
      </div>

      <div className="live-call-steps">
        <span className={stage === "setup" ? "current" : "complete"}><b>01</b> Avatar setup</span>
        <i />
        <span className={stage === "preview" ? "current" : ""}><b>02</b> Preview</span>
        <i />
        <span><b>03</b> Join call</span>
      </div>

      <div className="live-call-layout">
        <div className="live-call-controls">
          <div className="live-call-block">
            <label className="live-call-label">1. Choose your avatar shape</label>
            <div className="avatar-mode-options">
              <button type="button" className={mode === "full" ? "chosen" : ""} onClick={() => setMode("full")}>
                <span className="avatar-mode-art full-art"><UserRound size={35} /></span>
                <strong>Full body</strong>
                <small>Head to toe · arms and legs</small>
              </button>
              <button type="button" className={mode === "half" ? "chosen" : ""} onClick={() => setMode("half")}>
                <span className="avatar-mode-art half-art"><ScanFace size={35} /></span>
                <strong>Half body</strong>
                <small>Face, shoulders and upper torso</small>
              </button>
            </div>
            <p className="live-call-hint"><Info size={13} /> Use a clear, front-facing photo. Select full body for a head-to-toe image, or half body for a face-and-shoulders portrait.</p>
          </div>

          <div className="live-call-block">
            <label className="live-call-label">2. Upload the photo you want on camera</label>
            <button type="button" className="avatar-upload" onClick={() => fileRef.current?.click()}>
              {photo ? <img src={photo} alt="Selected avatar" /> : <span className="avatar-upload-empty"><ImagePlus size={25} /><strong>Choose an avatar photo</strong><small>JPG, PNG or WebP · up to 12 MB</small></span>}
              {photo && <span className="avatar-upload-overlay">Change photo</span>}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => choosePhoto(event.target.files?.[0])} />
            {photoName && <div className="avatar-file-name">{photoName}</div>}
          </div>

          <div className="live-call-block">
            <label className="live-call-label">3. Connect your camera for motion tracking</label>
            <div className="camera-permission-row">
              <span className="camera-icon"><Camera size={18} /></span>
              <span><strong>Webcam input</strong><small>Used to read your movement. Your selected photo is the avatar preview.</small></span>
              <button type="button" className={cameraOn ? "camera-toggle on" : "camera-toggle"} onClick={() => cameraOn ? stopCamera() : void startCamera()}>{cameraOn ? <><CameraOff size={13}/> Stop</> : <><Camera size={13}/> Enable</>}</button>
            </div>
            <label className="avatar-consent"><input type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)} /> I own this photo or have permission from the person pictured to use it as a live avatar.</label>
            {cameraError && <p className="live-call-error" role="alert">{cameraError}</p>}
          </div>
          <button type="button" className="live-call-preview-btn" disabled={!photo || !permission || !cameraOn} onClick={() => setStage("preview")}>Preview avatar setup <Video size={15}/></button>
          {!signedIn && <p className="live-call-hint"><LockKeyhole size={13}/> Sign in to save your avatar setup and access live-call features.</p>}
        </div>

        <div className="live-call-preview-column">
          <div className="live-call-preview-title"><strong>Studio preview</strong><span><i /> LOCAL PREVIEW</span></div>
          <div className="live-call-avatar-preview">
            {photo ? <img className={mode === "full" ? "preview-full" : "preview-half"} src={photo} alt="Your selected avatar preview" /> : <div className="live-call-empty"><UserRound size={34}/><strong>Your avatar appears here</strong><small>Upload a photo to begin</small></div>}
            <div className="preview-type-label">{mode === "full" ? "FULL-BODY AVATAR" : "HALF-BODY AVATAR"}</div>
          </div>
          <div className="live-call-camera-preview">
            <div className="camera-preview-heading"><span><Camera size={13}/> Motion camera</span><b className={cameraOn ? "camera-live" : ""}>{cameraOn ? "CAMERA ON" : "CAMERA OFF"}</b></div>
            <video ref={videoRef} muted playsInline autoPlay />
            {!cameraOn && <div className="camera-preview-empty"><VideoOff size={22}/><span>Enable your camera to see the tracking source</span></div>}
          </div>
          <div className="live-call-capabilities">
            <div><ShieldCheck size={15}/><span><strong>Private by design</strong><small>Photo preview stays in this browser session.</small></span></div>
            <div><MonitorUp size={15}/><span><strong>OBS workflow planned</strong><small>Browser-source output will be added with avatar rendering.</small></span></div>
            <div><Mic size={15}/><span><strong>Call audio</strong><small>Microphone controls will be available in the call room.</small></span></div>
          </div>
          {stage === "preview" && <div className="live-call-notice" role="status"><CheckCircle2 size={16}/> Your photo and camera are ready for the next setup stage. Live avatar animation and cross-platform calling are not connected yet.</div>}
        </div>
      </div>
      <div className="live-call-footnote">This setup currently provides photo selection and a local webcam preview. Real-time body/face animation, invite links, WebRTC calling and OBS virtual-camera output are the next integration stage; a still photo does not animate itself.</div>
    </section>
  );
}
