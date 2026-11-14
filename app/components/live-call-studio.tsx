"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, ImagePlus, Info, LockKeyhole, Mic, MicOff, MonitorUp, Radio, ScanFace, ShieldCheck, UserRound, Video, VideoOff, Volume2 } from "lucide-react";

type AvatarMode = "full" | "half";

export default function LiveCallStudio({ signedIn }: { signedIn: boolean }) {
  const [mode, setMode] = useState<AvatarMode>("half");
  const [photo, setPhoto] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [permission, setPermission] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [motionReady, setMotionReady] = useState(false);
  const [stage, setStage] = useState<"setup" | "preview">("setup");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const drawFrameRef = useRef<number>(0);\n  const audioFrameRef = useRef<number>(0);
  const levelRef = useRef(0);
  const motionRef = useRef({ x: 0, y: 0, tilt: 0, scale: 1 });
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const photoUrlRef = useRef("");

  const stopMedia = useCallback(() => {
    cancelAnimationFrame(drawFrameRef.current);\n    cancelAnimationFrame(audioFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
    setMicOn(false);
    setMicLevel(0);
    setMotionReady(false);
  }, []);

  useEffect(() => () => {
    stopMedia();
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
  }, [stopMedia]);

  useEffect(() => {
    if (!photo) { imageRef.current = null; return; }
    const image = new Image();
    image.onload = () => { imageRef.current = image; };
    image.src = photo;
  }, [photo]);

  const drawAvatar = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b0d15";
    ctx.fillRect(0, 0, width, height);
    if (image) {
      const motion = motionRef.current;
      const scale = motion.scale;
      const ratio = Math.min(width / image.width, height / image.height) * (mode === "full" ? 0.92 : 1.12) * scale;
      const w = image.width * ratio;
      const h = image.height * ratio;
      ctx.save();
      ctx.translate(width / 2 + motion.x, height / 2 + motion.y);
      ctx.rotate(motion.tilt);
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      ctx.restore();

      // A simple microphone-driven mouth cue, not phoneme-accurate facial animation.
      const level = levelRef.current;
      if (level > 0.035) {
        const mouthX = width / 2 + motion.x;
        const mouthY = height * (mode === "full" ? 0.245 : 0.315) + motion.y;
        const opening = Math.min(19, 3 + level * 190);
        ctx.save();
        ctx.translate(mouthX, mouthY);
        ctx.rotate(motion.tilt);
        ctx.fillStyle = "#35131c";
        ctx.beginPath();
        ctx.ellipse(0, 0, 8 + opening * 0.18, opening, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    } else {
      ctx.fillStyle = "#a78bfa";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Upload a photo to create your avatar preview", width / 2, height / 2);
    }
    drawFrameRef.current = requestAnimationFrame(drawAvatar);
  }, [mode]);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(drawAvatar);
    return () => cancelAnimationFrame(drawFrameRef.current);
  }, [drawAvatar, photo]);

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera and microphone access requires HTTPS and a supported browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        audioContext.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.fftSize);
        const analyse = () => {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) {
            const value = (sample - 128) / 128;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / samples.length);
          const level = Math.max(0, (rms - 0.012) * 4.2);
          levelRef.current = level;
          setMicLevel(Math.min(100, Math.round(level * 100)));
          audioFrameRef.current = requestAnimationFrame(analyse);
        };
        void audioContext.resume();
        audioFrameRef.current = requestAnimationFrame(analyse);
        setMicOn(true);
      }
      setCameraOn(true);
      setMotionReady(true);
      setStage("preview");
    } catch {
      setCameraError("Camera or microphone permission was denied, or a device is unavailable. Check browser permissions and try again.");
      setCameraOn(false);
    }
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
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const next = URL.createObjectURL(file);
    photoUrlRef.current = next;
    setPhoto(next);
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
          <p>Turn your selected photo into a live local avatar preview using your camera and microphone.</p>
        </div>
        <span className="live-call-free"><LockKeyhole size={12} /> Free studio</span>
      </div>

      <div className="live-call-steps">
        <span className={stage === "setup" ? "current" : "complete"}><b>01</b> Avatar setup</span>
        <i />
        <span className={stage === "preview" ? "current" : ""}><b>02</b> Live preview</span>
        <i />
        <span><b>03</b> Call room · coming next</span>
      </div>

      <div className="live-call-layout">
        <div className="live-call-controls">
          <div className="live-call-block">
            <label className="live-call-label">1. Choose your avatar shape</label>
            <div className="avatar-mode-options">
              <button type="button" className={mode === "full" ? "chosen" : ""} onClick={() => setMode("full")}>
                <span className="avatar-mode-art full-art"><UserRound size={35} /></span>
                <strong>Full body</strong><small>Head to toe · portrait framing</small>
              </button>
              <button type="button" className={mode === "half" ? "chosen" : ""} onClick={() => setMode("half")}>
                <span className="avatar-mode-art half-art"><ScanFace size={35} /></span>
                <strong>Half body</strong><small>Face, shoulders and upper torso</small>
              </button>
            </div>
            <p className="live-call-hint"><Info size={13} /> Use a clear, front-facing photo with the face visible.</p>
          </div>

          <div className="live-call-block">
            <label className="live-call-label">2. Upload your avatar photo</label>
            <button type="button" className="avatar-upload" onClick={() => fileRef.current?.click()}>
              {photo ? <img src={photo} alt="Selected avatar" /> : <span className="avatar-upload-empty"><ImagePlus size={25} /><strong>Choose an avatar photo</strong><small>JPG, PNG or WebP · up to 12 MB</small></span>}
              {photo && <span className="avatar-upload-overlay">Change photo</span>}
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => choosePhoto(event.target.files?.[0])} />
            {photoName && <div className="avatar-file-name">{photoName}</div>}
          </div>

          <div className="live-call-block">
            <label className="live-call-label">3. Enable camera and microphone</label>
            <div className="camera-permission-row">
              <span className="camera-icon"><Camera size={18} /></span>
              <span><strong>Camera + microphone</strong><small>Camera preview and microphone level drive this local avatar demo.</small></span>
              <button type="button" className={cameraOn ? "camera-toggle on" : "camera-toggle"} onClick={() => cameraOn ? stopMedia() : void startCamera()}>{cameraOn ? <><CameraOff size={13}/> Stop</> : <><Camera size={13}/> Enable</>}</button>
            </div>
            <label className="avatar-consent"><input type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)} /> I own this photo or have permission from the person pictured to use it as an avatar.</label>
            {cameraError && <p className="live-call-error" role="alert">{cameraError}</p>}
          </div>
          <button type="button" className="live-call-preview-btn" disabled={!photo || !permission || !cameraOn} onClick={() => setStage("preview")}>Open live avatar preview <Video size={15}/></button>
          {!signedIn && <p className="live-call-hint"><LockKeyhole size={13}/> Sign in to access saved avatar and calling features.</p>}
          {signedIn && !ready && <p className="live-call-hint">Select a photo, confirm permission and enable your devices to start.</p>}
        </div>

        <div className="live-call-preview-column">
          <div className="live-call-preview-title"><strong>Animated avatar preview</strong><span><i /> LOCAL ONLY</span></div>
          <div className="live-call-avatar-preview live-call-canvas-wrap">
            <canvas ref={canvasRef} width={640} height={640} aria-label="Live avatar canvas preview" />
            <div className="preview-type-label">{mode === "full" ? "FULL-BODY AVATAR" : "HALF-BODY AVATAR"}</div>
          </div>
          <div className="live-call-camera-preview">
            <div className="camera-preview-heading"><span><Camera size={13}/> Camera source</span><b className={cameraOn ? "camera-live" : ""}>{cameraOn ? "CAMERA ON" : "CAMERA OFF"}</b></div>
            <video ref={videoRef} muted playsInline autoPlay />
            {!cameraOn && <div className="camera-preview-empty"><VideoOff size={22}/><span>Enable camera and microphone to begin</span></div>}
          </div>
          <div className="live-call-capabilities">
            <div><ScanFace size={15}/><span><strong>Camera input</strong><small>{motionReady ? "Camera connected. Landmark-based facial tracking is not yet enabled." : "Waiting for camera permission."}</small></span></div>
            <div><Volume2 size={15}/><span><strong>Voice activity</strong><small>{micOn ? `Microphone level: ${micLevel}% · mouth cue responds to voice volume.` : "Enable your microphone to animate the mouth cue."}</small></span></div>
            <div><MonitorUp size={15}/><span><strong>OBS output</strong><small>Canvas stream output and OBS setup are the next integration step.</small></span></div>
          </div>
          {stage === "preview" && <div className="live-call-notice" role="status"><CheckCircle2 size={16}/> Your photo is rendered on a live canvas. Microphone volume drives a basic mouth-opening cue; this is not yet realistic facial reenactment or a connected call.</div>}
          <div className="live-call-call-actions">
            <button type="button" disabled className="live-call-preview-btn"><Radio size={15}/> Start a call · coming next</button>
            <button type="button" disabled className="live-call-preview-btn"><MicOff size={15}/> Invite link · coming next</button>
          </div>
        </div>
      </div>
      <div className="live-call-footnote">This milestone renders your uploaded photo on a canvas and uses microphone volume for a basic mouth cue. Webcam-based face landmark tracking, secure invite links, WebRTC calling and OBS virtual-camera routing still need to be integrated and tested. No remote call is connected yet.</div>
    </section>
  );
}
