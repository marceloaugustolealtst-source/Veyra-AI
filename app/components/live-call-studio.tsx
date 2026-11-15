"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Copy, ImagePlus, Info, LockKeyhole, MonitorUp, Radio, ScanFace, UserRound, Video, VideoOff, Volume2, Phone, PhoneOff, Link2 } from "lucide-react";
import { MeteredPeer } from "@metered-ca/realtime";

type AvatarMode = "full" | "half";
type FacePoint = { x: number; y: number; z?: number };
type HolisticResult = {
  faceLandmarks?: FacePoint[];
  poseLandmarks?: FacePoint[];
  leftHandLandmarks?: FacePoint[];
  rightHandLandmarks?: FacePoint[];
};
type HolisticInstance = {
  setOptions(options: Record<string, unknown>): void;
  onResults(callback: (results: HolisticResult) => void): void;
  send(input: { image: HTMLVideoElement | HTMLImageElement }): Promise<void>;
  close(): void;
};
type HolisticConstructor = new (options: { locateFile: (file: string) => string }) => HolisticInstance;
type SpeechRecognitionInstance = { continuous: boolean; interimResults: boolean; lang: string; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void; };

declare global { interface Window { Holistic?: HolisticConstructor; SpeechRecognition?: new () => SpeechRecognitionInstance; webkitSpeechRecognition?: new () => SpeechRecognitionInstance } }

let holisticLoader: Promise<void> | null = null;
function loadHolistic() {
  if (typeof window === "undefined") return Promise.reject(new Error("Body tracking requires a browser."));
  if (window.Holistic) return Promise.resolve();
  if (!holisticLoader) {
    holisticLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js";
      script.async = true;
      script.onload = () => window.Holistic ? resolve() : reject(new Error("Holistic tracking library did not initialize."));
      script.onerror = () => reject(new Error("Could not load the face and body tracking model. Check your internet connection."));
      document.head.appendChild(script);
    });
  }
  return holisticLoader;
}

export default function LiveCallStudio({ signedIn }: { signedIn: boolean }) {
  const [mode, setMode] = useState<AvatarMode>("half");
  const [photo, setPhoto] = useState("");
  const [photoName, setPhotoName] = useState("");
  const [permission, setPermission] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [micLevel, setMicLevel] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [stage, setStage] = useState<"setup" | "preview">("setup");
  const [inviteUrl, setInviteUrl] = useState("");
  const [callStatus, setCallStatus] = useState("No call connected");
  const [callError, setCallError] = useState("");
  const [inCall, setInCall] = useState(false);
  const [obsOn, setObsOn] = useState(false);
  const [obsMessage, setObsMessage] = useState("OBS output is not active.");
  const [hasInvite, setHasInvite] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const obsVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const drawFrameRef = useRef<number>(0);
  const audioFrameRef = useRef<number>(0);
  const faceFrameRef = useRef<number>(0);
  const levelRef = useRef(0);
  const motionRef = useRef({ x: 0, y: 0, tilt: 0, scale: 1, mouth: 0, lean: 0, handLift: 0 });
  const photoUrlRef = useRef("");
  const holisticRef = useRef<HolisticInstance | null>(null);
  const meteredPeerRef = useRef<MeteredPeer | null>(null);
  const roomIdRef = useRef("");
  const obsStreamRef = useRef<MediaStream | null>(null);
  const faceBusyRef = useRef(false);
  const lastFaceAtRef = useRef(0);
  const speechRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const speechActiveRef = useRef(false);
  const speechMouthRef = useRef({ open: 0, width: 1 });

  const closeCall = useCallback(async (markEnded = false) => {
    const roomId = roomIdRef.current;
    if (markEnded && roomId) {
      try { await fetch("/api/calls/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId }) }); } catch { /* Always complete local teardown. */ }
    }
    const meteredPeer = meteredPeerRef.current;
    meteredPeerRef.current = null;
    if (meteredPeer) {
      try { await meteredPeer.close("call ended"); } catch { /* The SDK may already be closed. */ }
    }
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    roomIdRef.current = "";
    setInCall(false);
    setCallStatus("Call ended");
  }, []);

  const stopMedia = useCallback(() => {
    cancelAnimationFrame(drawFrameRef.current);
    cancelAnimationFrame(audioFrameRef.current);
    cancelAnimationFrame(faceFrameRef.current);
    speechActiveRef.current = false;
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    holisticRef.current?.close();
    holisticRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    obsStreamRef.current?.getTracks().forEach((track) => track.stop());
    obsStreamRef.current = null;
    if (obsVideoRef.current) obsVideoRef.current.srcObject = null;
    setCameraOn(false);
    setMicOn(false);
    setMicLevel(0);
    setTracking(false);
    setObsOn(false);
    setObsMessage("OBS output is not active.");
  }, []);

  useEffect(() => () => {
    stopMedia();
    void closeCall(true);
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
  }, [stopMedia, closeCall]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setHasInvite(Boolean(params.get("call") && params.get("invite")));
  }, []);

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
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0b0d15";
    ctx.fillRect(0, 0, width, height);
    if (image) {
      const motion = motionRef.current;
      const ratio = Math.min(width / image.width, height / image.height) * (mode === "full" ? 0.92 : 1.12) * motion.scale;
      const w = image.width * ratio, h = image.height * ratio;
      ctx.save();
      ctx.translate(width / 2 + motion.x + motion.lean * 7, height / 2 + motion.y - motion.handLift * 5);
      ctx.rotate(motion.tilt + motion.lean * 0.012);
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      const speech = speechMouthRef.current;
      const mouth = Math.max(motion.mouth * 0.72, Math.min(1, levelRef.current * 1.8), speech.open);
      if (mouth > 0.07) {
        const mouthY = h * (mode === "full" ? 0.245 : 0.315);
        ctx.fillStyle = "#35131c";
        ctx.beginPath();
        ctx.ellipse(0, -h / 2 + mouthY, Math.max(6, w * 0.018) * speech.width, 1.5 + mouth * 13, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = "#a78bfa";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Upload a photo to create your avatar preview", width / 2, height / 2);
    }
    drawFrameRef.current = requestAnimationFrame(drawAvatar);
  }, [mode]);

  useEffect(() => {
    drawFrameRef.current = requestAnimationFrame(drawAvatar);
    return () => cancelAnimationFrame(drawFrameRef.current);
  }, [drawAvatar, photo]);

  async function startCamera() {
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access requires HTTPS and a supported browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true },
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
          for (const sample of samples) { const value = (sample - 128) / 128; sum += value * value; }
          const rms = Math.sqrt(sum / samples.length);
          const level = Math.max(0, (rms - 0.018) * 3.2);
          levelRef.current = level;
          if (level < 0.035) speechMouthRef.current.open *= 0.86;
          setMicLevel(Math.min(100, Math.round(level * 100)));
          audioFrameRef.current = requestAnimationFrame(analyse);
        };
        void audioContext.resume();
        audioFrameRef.current = requestAnimationFrame(analyse);
        setMicOn(true);
      }
      setCameraOn(true);
      setStage("preview");
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (Recognition) {
        const recognition = new Recognition();
        recognition.continuous = true; recognition.interimResults = true; recognition.lang = navigator.language || "en-US";
        recognition.onresult = (event) => {
          const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.toLowerCase() ?? "";
          const vowel = transcript.match(/[aeiouy]/g)?.slice(-1)[0];
          speechMouthRef.current = vowel === "a" ? { open: 0.9, width: 1.18 }
            : vowel === "o" || vowel === "u" ? { open: 0.68, width: 0.72 }
            : vowel === "e" || vowel === "i" || vowel === "y" ? { open: 0.36, width: 0.9 }
            : { open: 0.16, width: 1 };
        };
        recognition.onerror = () => { speechMouthRef.current = { open: 0, width: 1 }; };
        recognition.onend = () => { if (speechActiveRef.current && streamRef.current) { try { recognition.start(); } catch { /* Already restarting. */ } } };
        speechRecognitionRef.current = recognition; speechActiveRef.current = true;
        try { recognition.start(); } catch { /* Speech recognition is optional. */ }
      }
      setCallError("");
      setCameraError("Loading face, body and hand tracking…");
      await loadHolistic();
      const Holistic = window.Holistic;
      if (!Holistic || !videoRef.current) throw new Error("Face and body tracking is unavailable.");
      const holistic = new Holistic({ locateFile: (file) => "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/" + file });
      holistic.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: true,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.6,
      });
      holistic.onResults((results) => {
        const points = results.faceLandmarks;
        const pose = results.poseLandmarks;
        if (!points) { setTracking(false); return; }
        const leftEye = points[33], rightEye = points[263], forehead = points[10], chin = points[152];
        const mouthTop = points[13], mouthBottom = points[14], mouthLeft = points[61], mouthRight = points[291];
        const eyeCenterX = (leftEye.x + rightEye.x) / 2;
        const eyeCenterY = (leftEye.y + rightEye.y) / 2;
        const tilt = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
        const faceHeight = Math.max(0.001, Math.abs(chin.y - forehead.y));
        const mouthRatio = Math.min(1, Math.max(0, Math.abs(mouthBottom.y - mouthTop.y) / Math.max(0.001, Math.abs(mouthRight.x - mouthLeft.x)) * 3.2));
        const leftShoulder = pose?.[11], rightShoulder = pose?.[12];
        const leftWrist = pose?.[15], rightWrist = pose?.[16];
        const shoulderY = leftShoulder && rightShoulder ? (leftShoulder.y + rightShoulder.y) / 2 : eyeCenterY + faceHeight * 1.8;
        const shoulderX = leftShoulder && rightShoulder ? (leftShoulder.x + rightShoulder.x) / 2 : eyeCenterX;
        const wristsRaised = Number(Boolean(leftWrist && leftShoulder && leftWrist.y < leftShoulder.y - 0.06)) +
          Number(Boolean(rightWrist && rightShoulder && rightWrist.y < rightShoulder.y - 0.06));
        const handsVisible = Boolean(results.leftHandLandmarks || results.rightHandLandmarks);
        const torsoLean = Math.max(-1, Math.min(1, (eyeCenterX - shoulderX) * 5));
        const target = {
          x: Math.max(-58, Math.min(58, (0.5 - eyeCenterX) * 118 + torsoLean * 13)),
          y: Math.max(-46, Math.min(46, (0.43 - eyeCenterY) * 76 + (0.48 - shoulderY) * 18 - wristsRaised * 3)),
          tilt: Math.max(-0.24, Math.min(0.24, tilt + torsoLean * 0.035)),
          scale: Math.max(0.93, Math.min(1.08, 0.99 + (faceHeight - 0.36) * 0.3)),
          mouth: mouthRatio,
          lean: torsoLean,
          handLift: wristsRaised / 2,
        };
        const current = motionRef.current;
        const smooth = (from: number, to: number, factor: number, maxStep = 999) => {
          const delta = Math.max(-maxStep, Math.min(maxStep, to - from));
          return from + delta * factor;
        };
        // Faster, bounded response avoids the large jumps that made the old preview shake.
        motionRef.current = {
          x: smooth(current.x, target.x, 0.32, 12),
          y: smooth(current.y, target.y, 0.30, 10),
          tilt: smooth(current.tilt, target.tilt, 0.28, 0.045),
          scale: smooth(current.scale, target.scale, 0.22, 0.018),
          mouth: smooth(current.mouth, target.mouth, 0.48, 0.18),
          lean: smooth(current.lean, target.lean, 0.28, 0.2),
          handLift: smooth(current.handLift, target.handLift, 0.38, 0.3),
        };
        lastFaceAtRef.current = performance.now();
        setTracking(true);
        // Hand landmarks are deliberately detected separately from face landmarks.
        void handsVisible;
      });
      holisticRef.current = holistic;
      let lastInferenceAt = 0;
      const detect = async () => {
        const now = performance.now();
        const video = videoRef.current;
        if (!faceBusyRef.current && now - lastInferenceAt >= 33 && video && video.readyState >= 2 && holisticRef.current) {
          faceBusyRef.current = true;
          lastInferenceAt = now;
          try { await holisticRef.current.send({ image: video }); } catch { /* A dropped frame is harmless. */ }
          finally { faceBusyRef.current = false; }
        } else if (now - lastFaceAtRef.current > 350) {
          const current = motionRef.current;
          current.x *= 0.9; current.y *= 0.9; current.tilt *= 0.9;
          current.scale += (1 - current.scale) * 0.1; current.mouth *= 0.72;
          current.lean *= 0.85; current.handLift *= 0.85;
          setTracking(false);
        }
        faceFrameRef.current = requestAnimationFrame(detect);
      };
      faceFrameRef.current = requestAnimationFrame(detect);
      setCameraError("");
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Camera or microphone could not be started.");
      if (!streamRef.current) setCameraOn(false);
    }
  }

  function choosePhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setCameraError("Choose a JPG, PNG, or WebP image."); return; }
    if (file.size > 12 * 1024 * 1024) { setCameraError("Choose an image smaller than 12 MB."); return; }
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const next = URL.createObjectURL(file);
    photoUrlRef.current = next;
    setPhoto(next);
    setPhotoName(file.name);
    setStage("setup");
    setCameraError("");
  }

  function stopObsOutput() {
    obsStreamRef.current?.getTracks().forEach((track) => track.stop());
    obsStreamRef.current = null;
    if (obsVideoRef.current) obsVideoRef.current.srcObject = null;
    setObsOn(false);
    setObsMessage("OBS output is not active.");
  }

  async function startObsOutput() {
    const canvas = canvasRef.current;
    if (!canvas || typeof canvas.captureStream !== "function") {
      setObsMessage("Canvas streaming is not supported by this browser.");
      return;
    }
    obsStreamRef.current?.getTracks().forEach((track) => track.stop());
    const stream = canvas.captureStream(30);
    obsStreamRef.current = stream;
    if (obsVideoRef.current) {
      obsVideoRef.current.srcObject = stream;
      await obsVideoRef.current.play().catch(() => undefined);
    }
    setObsOn(true);
    setObsMessage("Avatar canvas is streaming at 30 FPS in this browser tab. In OBS, add a Window Capture or Browser Source for this page. Browser media streams cannot install or switch on the operating-system OBS Virtual Camera driver.");
  }

  async function connectRoom(roomId: string, host: boolean) {
    const localStream = streamRef.current;
    if (!localStream) throw new Error("Enable your camera and microphone before connecting.");
    roomIdRef.current = roomId;
    setCallStatus(host ? "Connecting to secure call…" : "Joining secure call…");
    const meteredPeer = new MeteredPeer({
      tokenProvider: async () => {
        const response = await fetch("/api/calls/metered-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ roomId }),
        });
        const data = await response.json() as { token?: string; error?: string };
        if (!response.ok || !data.token) throw new Error(data.error ?? "Could not authorize the call connection.");
        return data.token;
      },
    });
    meteredPeerRef.current = meteredPeer;
    meteredPeer.on("peer-joined", ({ peer: remote }) => {
      remote.on("stream-added", ({ stream }) => {
        remoteStreamRef.current = stream;
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          void remoteVideoRef.current.play().catch(() => undefined);
        }
        setCallStatus("Call connected");
      });
      remote.on("stream-removed", ({ stream }) => {
        if (remoteStreamRef.current?.id === stream.id) {
          remoteStreamRef.current = null;
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        }
      });
      remote.on("state-change", ({ to }) => {
        if (to === "connected") setCallStatus("Call connected");
        else if (to === "connecting") setCallStatus("Connecting media…");
      });
    });
    meteredPeer.on("peer-left", () => {
      remoteStreamRef.current = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setCallStatus("The other participant left the call.");
    });
    meteredPeer.on("state-change", ({ to }) => {
      if (to === "reconnecting") setCallStatus("Reconnecting call…");
      else if (to === "joined" && !remoteStreamRef.current) setCallStatus(host ? "Waiting for invited participant…" : "Waiting for host media…");
    });
    meteredPeer.on("error", ({ err }) => {
      setCallError(err.message || "The secure call connection encountered an error.");
      setCallStatus("Call connection error");
    });
    // Add the local webcam stream before joining so the SDK can negotiate it
    // during initial peer discovery, and automatically recover it after reconnects.
    meteredPeer.addStream(localStream, { role: "camera", label: "VEYRA live avatar" });
    setInCall(true);
    await meteredPeer.join("veyra-call-" + roomId);
  }

  async function createCall() {
    setCallError("");
    try {
      const response = await fetch("/api/calls/create", { method: "POST" });
      const data = await response.json() as { roomId?: string; inviteUrl?: string; error?: string };
      if (!response.ok || !data.roomId || !data.inviteUrl) throw new Error(data.error ?? "Could not create call.");
      setInviteUrl(data.inviteUrl);
      const url = new URL(data.inviteUrl);
      await connectRoom(data.roomId, true);
      window.history.replaceState({}, "", url.pathname + "?call=" + data.roomId + "&invite=" + url.searchParams.get("invite"));
    } catch (error) { setCallError(error instanceof Error ? error.message : "Call could not be started."); }
  }

  async function joinCall() {
    setCallError("");
    try {
      const params = new URLSearchParams(window.location.search);
      const roomId = params.get("call") ?? "";
      const inviteToken = params.get("invite") ?? "";
      if (!roomId || !inviteToken) throw new Error("Open the full invite link to join a call.");
      const response = await fetch("/api/calls/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, inviteToken }),
      });
      const data = await response.json() as { roomId?: string; error?: string };
      if (!response.ok || !data.roomId) throw new Error(data.error ?? "Could not join call.");
      await connectRoom(data.roomId, false);
    } catch (error) { setCallError(error instanceof Error ? error.message : "Unable to join this call."); }
  }

  async function endCall() {
    await closeCall(true);
  }

  const ready = Boolean(photo && permission && cameraOn && signedIn);

  return (
    <section className="live-call-studio" id="live-call-studio">
      <div className="live-call-head"><div><div className="live-call-kicker"><Radio size={13} /> VEYRA LIVE</div><h2>Live call avatar studio</h2><p>Track your face, animate your avatar and connect with another Veyra user.</p></div><span className="live-call-free"><LockKeyhole size={12} /> Included free</span></div>
      <div className="live-call-steps"><span className={stage === "setup" ? "current" : "complete"}><b>01</b> Avatar setup</span><i/><span className={stage === "preview" ? "current" : ""}><b>02</b> Live preview</span><i/><span className={inCall ? "complete" : ""}><b>03</b> Live call</span></div>
      <div className="live-call-layout">
        <div className="live-call-controls">
          <div className="live-call-block"><label className="live-call-label">1. Choose avatar framing</label><div className="avatar-mode-options">
            <button type="button" className={mode === "full" ? "chosen" : ""} onClick={() => setMode("full")}><span className="avatar-mode-art full-art"><UserRound size={35}/></span><strong>Full body</strong><small>Portrait framing</small></button>
            <button type="button" className={mode === "half" ? "chosen" : ""} onClick={() => setMode("half")}><span className="avatar-mode-art half-art"><ScanFace size={35}/></span><strong>Half body</strong><small>Face and shoulders</small></button>
          </div><p className="live-call-hint"><Info size={13}/> A clear front-facing portrait works best.</p></div>
          <div className="live-call-block"><label className="live-call-label">2. Upload your avatar photo</label><button type="button" className="avatar-upload" onClick={() => fileRef.current?.click()}>{photo ? <img src={photo} alt="Selected avatar"/> : <span className="avatar-upload-empty"><ImagePlus size={25}/><strong>Choose an avatar photo</strong><small>JPG, PNG or WebP · up to 12 MB</small></span>}{photo && <span className="avatar-upload-overlay">Change photo</span>}</button><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => choosePhoto(event.target.files?.[0])}/>{photoName && <div className="avatar-file-name">{photoName}</div>}</div>
          <div className="live-call-block"><label className="live-call-label">3. Enable camera and microphone</label><div className="camera-permission-row"><span className="camera-icon"><Camera size={18}/></span><span><strong>Camera + microphone</strong><small>Face, upper-body pose and raised-hand landmarks drive live avatar response.</small></span><button type="button" className={cameraOn ? "camera-toggle on" : "camera-toggle"} onClick={() => cameraOn ? stopMedia() : void startCamera()}>{cameraOn ? <><CameraOff size={13}/> Stop</> : <><Camera size={13}/> Enable</>}</button></div><label className="avatar-consent"><input type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)}/> I own this photo or have permission from the person pictured.</label>{cameraError && <p className="live-call-error" role="alert">{cameraError}</p>}</div>
          <button type="button" className="live-call-preview-btn" disabled={!photo || !permission || !cameraOn} onClick={() => setStage("preview")}>Open live avatar preview <Video size={15}/></button>
          {!signedIn && <p className="live-call-hint"><LockKeyhole size={13}/> Sign in to create or join calls.</p>}
          {signedIn && !ready && <p className="live-call-hint">Select a photo, confirm permission and enable your devices.</p>}
        </div>
        <div className="live-call-preview-column">
          <div className="live-call-preview-title"><strong>Live animated avatar</strong><span><i/> LOCAL PREVIEW</span></div>
          <div className="live-call-avatar-preview live-call-canvas-wrap"><canvas ref={canvasRef} width={640} height={640} aria-label="Live avatar canvas preview"/><div className="preview-type-label">{mode === "full" ? "FULL-BODY AVATAR" : "HALF-BODY AVATAR"}</div></div>
          <div className="live-call-camera-preview"><div className="camera-preview-heading"><span><Camera size={13}/> Camera source</span><b className={cameraOn ? "camera-live" : ""}>{cameraOn ? "CAMERA ON" : "CAMERA OFF"}</b></div><video ref={videoRef} muted playsInline autoPlay/>{!cameraOn && <div className="camera-preview-empty"><VideoOff size={22}/><span>Enable camera and microphone to begin</span></div>}</div>
          <div className="live-call-capabilities">
            <div><ScanFace size={15}/><span><strong>Face + body tracking</strong><small>{tracking ? "Face detected · head, shoulders, torso lean and raised-hand gestures are tracking." : cameraOn ? "Looking for your face and upper-body pose." : "Waiting for camera permission."}</small></span></div>
            <div><Volume2 size={15}/><span><strong>Voice activity</strong><small>{micOn ? "Microphone active · level " + micLevel + "%." : "Enable your microphone to drive the talking cue."}</small></span></div>
            <div><MonitorUp size={15}/><span><strong>OBS stream</strong><small>{obsOn ? "Canvas capture stream active at 30 FPS." : "Start the canvas stream for OBS capture."}</small></span></div>
          </div>
          {stage === "preview" && <div className="live-call-notice" role="status"><CheckCircle2 size={16}/> Webcam face and upper-body landmarks now drive head position, tilt, scale, mouth opening, torso lean and raised-hand gesture response. A single flat photo still cannot independently articulate hidden arms or reproduce every expression; that requires a segmented, rigged avatar.</div>}
          <div className="live-call-call-actions">
            {!inCall ? <button type="button" className="live-call-preview-btn" disabled={!ready} onClick={() => void createCall()}><Phone size={15}/> Create call + invite link</button> : <button type="button" className="live-call-preview-btn" onClick={() => void endCall()}><PhoneOff size={15}/> End call</button>}
            {hasInvite && !inCall && <button type="button" className="live-call-preview-btn" disabled={!ready} onClick={() => void joinCall()}><Link2 size={15}/> Join invited call</button>}
            {inviteUrl && <button type="button" className="live-call-preview-btn" onClick={() => void navigator.clipboard.writeText(inviteUrl)}><Copy size={15}/> Copy invite link</button>}
          </div>
          <div className="live-call-camera-preview"><div className="camera-preview-heading"><span><Video size={13}/> Other participant</span><b>{inCall ? callStatus.toUpperCase() : "NOT CONNECTED"}</b></div><video ref={remoteVideoRef} autoPlay playsInline/><div className="camera-preview-empty"><span>{inCall ? callStatus : "The other participant appears here after they join."}</span></div></div>
          {callError && <p className="live-call-error" role="alert">{callError}</p>}
          <div className="live-call-block"><label className="live-call-label">OBS / streaming output</label><div className="camera-permission-row"><span className="camera-icon"><MonitorUp size={18}/></span><span><strong>Canvas capture stream</strong><small>30 FPS browser stream for OBS capture.</small></span><button type="button" className={obsOn ? "camera-toggle on" : "camera-toggle"} onClick={() => obsOn ? stopObsOutput() : void startObsOutput()}>{obsOn ? "Stop" : "Start"}</button></div><video ref={obsVideoRef} muted playsInline autoPlay style={{width:"100%",maxHeight:100,background:"#080a10",borderRadius:8}}/><p className="live-call-hint">{obsMessage}</p></div>
        </div>
      </div>
      <div className="live-call-footnote">Calls use encrypted WebRTC media with Metered Realtime Messaging for private, room-scoped signalling and Metered TURN relay credentials when Auto-inject TURN is enabled. Invite links are single-guest bearer links that expire after 24 hours; both people must sign in. OBS virtual-camera drivers cannot be installed by a website: use OBS Browser Source or Window Capture, then enable OBS Virtual Camera in the OBS desktop app.</div>
    </section>
  );
}
