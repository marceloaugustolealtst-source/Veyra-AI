"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, Copy, ImagePlus, Info, LockKeyhole, Mic, MicOff, MonitorUp, Radio, ScanFace, UserRound, Video, VideoOff, Volume2, Phone, PhoneOff, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AvatarMode = "full" | "half";
type FacePoint = { x: number; y: number; z?: number };
type FaceMeshResult = { multiFaceLandmarks?: FacePoint[][] };
type FaceMeshInstance = {
  setOptions(options: Record<string, unknown>): void;
  onResults(callback: (results: FaceMeshResult) => void): void;
  send(input: { image: HTMLVideoElement | HTMLImageElement }): Promise<void>;
  close(): void;
};
type FaceMeshConstructor = new (options: { locateFile: (file: string) => string }) => FaceMeshInstance;

declare global { interface Window { FaceMesh?: FaceMeshConstructor } }

let faceMeshLoader: Promise<void> | null = null;
function loadFaceMesh() {
  if (typeof window === "undefined") return Promise.reject(new Error("Face tracking requires a browser."));
  if (window.FaceMesh) return Promise.resolve();
  if (!faceMeshLoader) {
    faceMeshLoader = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js";
      script.async = true;
      script.onload = () => window.FaceMesh ? resolve() : reject(new Error("Face tracking library did not initialize."));
      script.onerror = () => reject(new Error("Could not load the face tracking model. Check your internet connection."));
      document.head.appendChild(script);
    });
  }
  return faceMeshLoader;
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
  const motionRef = useRef({ x: 0, y: 0, tilt: 0, scale: 1, mouth: 0 });
  const photoUrlRef = useRef("");
  const faceMeshRef = useRef<FaceMeshInstance | null>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const roomIdRef = useRef("");
  const hostRef = useRef(false);
  const inviteTokenRef = useRef("");
  const obsStreamRef = useRef<MediaStream | null>(null);
  const signalQueueRef = useRef<Array<{ kind: string; data?: RTCSessionDescriptionInit | RTCIceCandidateInit }>>([]);

  const sendSignal = useCallback(async (kind: string, data?: RTCSessionDescriptionInit | RTCIceCandidateInit) => {
    const channel = channelRef.current;
    if (channel) await channel.send({ type: "broadcast", event: "signal", payload: { kind, data } });
  }, []);

  const closeCall = useCallback(async () => {
    peerRef.current?.close();
    peerRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (channelRef.current) {
      const supabase = createClient();
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    roomIdRef.current = "";
    setInCall(false);
    setCallStatus("Call ended");
  }, []);

  const stopMedia = useCallback(() => {
    cancelAnimationFrame(drawFrameRef.current);
    cancelAnimationFrame(audioFrameRef.current);
    cancelAnimationFrame(faceFrameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    faceMeshRef.current?.close();
    faceMeshRef.current = null;
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
    void closeCall();
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
  }, [stopMedia, closeCall]);

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
      ctx.translate(width / 2 + motion.x, height / 2 + motion.y);
      ctx.rotate(motion.tilt);
      ctx.drawImage(image, -w / 2, -h / 2, w, h);
      const mouth = Math.max(motion.mouth, Math.min(1, levelRef.current * 2.4));
      if (mouth > 0.08) {
        const mouthY = h * (mode === "full" ? 0.245 : 0.315);
        ctx.fillStyle = "#35131c";
        ctx.beginPath();
        ctx.ellipse(0, -h / 2 + mouthY, Math.max(7, w * 0.018), 2 + mouth * 16, 0, 0, Math.PI * 2);
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
      setStage("preview");
      setCallError("");
      setCameraError("Loading face tracking model…");
      await loadFaceMesh();
      const FaceMesh = window.FaceMesh;
      if (!FaceMesh || !videoRef.current) throw new Error("Face tracking is unavailable.");
      const faceMesh = new FaceMesh({ locateFile: (file) => "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/" + file });
      faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.55, minTrackingConfidence: 0.55 });
      faceMesh.onResults((results) => {
        const points = results.multiFaceLandmarks?.[0];
        if (!points) { setTracking(false); return; }
        const leftEye = points[33], rightEye = points[263], nose = points[1], forehead = points[10], chin = points[152];
        const mouthTop = points[13], mouthBottom = points[14], mouthLeft = points[61], mouthRight = points[291];
        const faceWidth = Math.max(0.001, Math.abs(rightEye.x - leftEye.x));
        const eyeCenterX = (leftEye.x + rightEye.x) / 2;
        const eyeCenterY = (leftEye.y + rightEye.y) / 2;
        const tilt = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
        const faceHeight = Math.max(0.001, Math.abs(chin.y - forehead.y));
        const mouthRatio = Math.min(1, Math.max(0, Math.abs(mouthBottom.y - mouthTop.y) / Math.max(0.001, Math.abs(mouthRight.x - mouthLeft.x)) * 3.2));
        motionRef.current = {
          x: Math.max(-95, Math.min(95, (0.5 - eyeCenterX) * 190)),
          y: Math.max(-85, Math.min(85, (0.43 - eyeCenterY) * 150)),
          tilt: Math.max(-0.38, Math.min(0.38, tilt)),
          scale: Math.max(0.82, Math.min(1.2, 0.86 + faceHeight * 0.75)),
          mouth: mouthRatio,
        };
        void nose;
        setTracking(true);
      });
      faceMeshRef.current = faceMesh;
      const detect = async () => {
        const video = videoRef.current;
        if (video && video.readyState >= 2 && faceMeshRef.current) {
          try { await faceMeshRef.current.send({ image: video }); } catch { /* A dropped frame is harmless. */ }
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
    if (!streamRef.current) throw new Error("Enable your camera and microphone before connecting.");
    const supabase = createClient();
    roomIdRef.current = roomId;
    hostRef.current = host;
    const channel = supabase.channel("veyra-call:" + roomId, { config: { private: true, broadcast: { ack: true, self: false } } });
    channelRef.current = channel;
    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const signal = payload as { kind?: string; data?: RTCSessionDescriptionInit | RTCIceCandidateInit };
      const peer = peerRef.current;
      if (!signal.kind) return;
      if (signal.kind === "ready" && hostRef.current && peer && !peer.localDescription) {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await sendSignal("offer", offer);
        setCallStatus("Calling invitee…");
      } else if (signal.kind === "offer" && !hostRef.current && peer && signal.data) {
        await peer.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await sendSignal("answer", answer);
        setCallStatus("Connecting call…");
      } else if (signal.kind === "answer" && hostRef.current && peer && signal.data) {
        await peer.setRemoteDescription(signal.data as RTCSessionDescriptionInit);
        setCallStatus("Call connected");
      } else if (signal.kind === "ice" && peer && signal.data) {
        try { await peer.addIceCandidate(signal.data as RTCIceCandidateInit); } catch { /* Candidate may arrive before remote SDP. */ }
      } else if (signal.kind === "hangup") {
        await closeCall();
      }
    });
    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status, error) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(error ?? new Error("Could not connect to the call signalling channel."));
      });
    });
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }] });
    peerRef.current = peer;
    remoteStreamRef.current = new MediaStream();
    peer.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => remoteStreamRef.current?.addTrack(track));
      if (remoteVideoRef.current && remoteStreamRef.current) remoteVideoRef.current.srcObject = remoteStreamRef.current;
      setCallStatus("Call connected");
    };
    peer.onicecandidate = (event) => { if (event.candidate) void sendSignal("ice", event.candidate.toJSON()); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setCallStatus("Call connected");
      if (peer.connectionState === "failed") setCallStatus("Connection failed. A TURN relay may be required on this network.");
      if (peer.connectionState === "disconnected") setCallStatus("Call temporarily disconnected");
    };
    streamRef.current.getTracks().forEach((track) => peer.addTrack(track, streamRef.current as MediaStream));
    setInCall(true);
    setCallStatus(host ? "Waiting for invited participant…" : "Joining call…");
    await sendSignal("ready");
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
    await sendSignal("hangup");
    await closeCall();
  }

  const ready = Boolean(photo && permission && cameraOn && signedIn);
  const hasInvite = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("invite");

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
          <div className="live-call-block"><label className="live-call-label">3. Enable camera and microphone</label><div className="camera-permission-row"><span className="camera-icon"><Camera size={18}/></span><span><strong>Camera + microphone</strong><small>Face landmarks drive avatar movement and mouth opening.</small></span><button type="button" className={cameraOn ? "camera-toggle on" : "camera-toggle"} onClick={() => cameraOn ? stopMedia() : void startCamera()}>{cameraOn ? <><CameraOff size={13}/> Stop</> : <><Camera size={13}/> Enable</>}</button></div><label className="avatar-consent"><input type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)}/> I own this photo or have permission from the person pictured.</label>{cameraError && <p className="live-call-error" role="alert">{cameraError}</p>}</div>
          <button type="button" className="live-call-preview-btn" disabled={!photo || !permission || !cameraOn} onClick={() => setStage("preview")}>Open live avatar preview <Video size={15}/></button>
          {!signedIn && <p className="live-call-hint"><LockKeyhole size={13}/> Sign in to create or join calls.</p>}
          {signedIn && !ready && <p className="live-call-hint">Select a photo, confirm permission and enable your devices.</p>}
        </div>
        <div className="live-call-preview-column">
          <div className="live-call-preview-title"><strong>Live animated avatar</strong><span><i/> LOCAL PREVIEW</span></div>
          <div className="live-call-avatar-preview live-call-canvas-wrap"><canvas ref={canvasRef} width={640} height={640} aria-label="Live avatar canvas preview"/><div className="preview-type-label">{mode === "full" ? "FULL-BODY AVATAR" : "HALF-BODY AVATAR"}</div></div>
          <div className="live-call-camera-preview"><div className="camera-preview-heading"><span><Camera size={13}/> Camera source</span><b className={cameraOn ? "camera-live" : ""}>{cameraOn ? "CAMERA ON" : "CAMERA OFF"}</b></div><video ref={videoRef} muted playsInline autoPlay/>{!cameraOn && <div className="camera-preview-empty"><VideoOff size={22}/><span>Enable camera and microphone to begin</span></div>}</div>
          <div className="live-call-capabilities">
            <div><ScanFace size={15}/><span><strong>Face tracking</strong><small>{tracking ? "Face detected · head position, tilt and mouth opening are tracking." : cameraOn ? "Looking for a face in the camera." : "Waiting for camera permission."}</small></span></div>
            <div><Volume2 size={15}/><span><strong>Voice activity</strong><small>{micOn ? "Microphone active · level " + micLevel + "%." : "Enable your microphone to drive the talking cue."}</small></span></div>
            <div><MonitorUp size={15}/><span><strong>OBS stream</strong><small>{obsOn ? "Canvas capture stream active at 30 FPS." : "Start the canvas stream for OBS capture."}</small></span></div>
          </div>
          {stage === "preview" && <div className="live-call-notice" role="status"><CheckCircle2 size={16}/> Webcam landmarks now drive head movement, tilt, scale and mouth opening. This is a 2D photo puppet, not full 3D facial reenactment or phoneme-perfect lip sync.</div>}
          <div className="live-call-call-actions">
            {!inCall ? <button type="button" className="live-call-preview-btn" disabled={!ready} onClick={() => void createCall()}><Phone size={15}/> Create call + invite link</button> : <button type="button" className="live-call-preview-btn" onClick={() => void endCall()}><PhoneOff size={15}/> End call</button>}
            {hasInvite && !inCall && <button type="button" className="live-call-preview-btn" disabled={!ready} onClick={() => void joinCall()}><Link2 size={15}/> Join invited call</button>}
            {inviteUrl && <button type="button" className="live-call-preview-btn" onClick={() => void navigator.clipboard.writeText(inviteUrl)}><Copy size={15}/> Copy invite link</button>}
          </div>
          <div className="live-call-camera-preview"><div className="camera-preview-heading"><span><Video size={13}/> Other participant</span><b>{inCall ? callStatus.toUpperCase() : "NOT CONNECTED"}</b></div><video ref={remoteVideoRef} autoPlay playsInline/><div className="camera-preview-empty"><span>{inCall ? callStatus : "The other participant appears here after they join."}</span></div></div>
          {callError && <p className="live-call-error" role="alert">{callError}</p>}
          <div className="live-call-block"><label className="live-call-label">OBS / streaming output</label><div className="camera-permission-row"><span className="camera-icon"><MonitorUp size={18}/></span><span><strong>Canvas capture stream</strong><small>30 FPS browser stream for OBS capture.</small></span><button type="button" className={obsOn ? "camera-toggle on" : "camera-toggle"} onClick={() => obsOn ? stopMedia() : void startObsOutput()}>{obsOn ? "Stop" : "Start"}</button></div><video ref={obsVideoRef} muted playsInline autoPlay style={{width:"100%",maxHeight:100,background:"#080a10",borderRadius:8}}/><p className="live-call-hint">{obsMessage}</p></div>
        </div>
      </div>
      <div className="live-call-footnote">Calls use encrypted WebRTC media and private Supabase Realtime signalling. Invite links are single-guest bearer links that expire after 24 hours; both people must sign in. STUN is configured; some restrictive networks require a TURN relay, which has not been configured. OBS virtual-camera drivers cannot be installed by a website: use OBS Browser Source or Window Capture, then enable OBS Virtual Camera in the OBS desktop app.</div>
    </section>
  );
}
