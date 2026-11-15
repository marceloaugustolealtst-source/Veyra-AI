"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Landmark = { x: number; y: number; z?: number };
type Props = { photo: string; sourceFace?: Landmark[] | null; face?: Landmark[] | null; leftHand?: Landmark[] | null; rightHand?: Landmark[] | null; mouthOpen?: number; onCanvasReady?: (canvas: HTMLCanvasElement | null) => void };

export default function PhotoDepthAvatar({ photo, sourceFace, face, leftHand, rightHand, mouthOpen = 0, onCanvasReady }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const handsRef = useRef<{ left: Landmark[] | null; right: Landmark[] | null }>({ left: null, right: null });
  const handVisualsRef = useRef<{ left: THREE.Group; right: THREE.Group } | null>(null);
  const [status, setStatus] = useState("Waiting for photo");
  const [progress, setProgress] = useState(0);
  const [modelReady, setModelReady] = useState(false);
  const expressionRef = useRef({ mouth: 0, blink: 0, hand: 0, lean: 0 });

  useEffect(() => {
    expressionRef.current.mouth = Math.max(0, Math.min(1, mouthOpen));
    handsRef.current = { left: leftHand ?? null, right: rightHand ?? null };
    const hands = [leftHand, rightHand].filter(Boolean) as Landmark[][];
    expressionRef.current.hand = hands.length ? hands.reduce((sum, hand) => sum + Math.max(0, 0.5 - hand[0].y), 0) / hands.length : 0;
    if (face?.length) {
      const leftEye = face[159], leftLow = face[145], rightEye = face[386], rightLow = face[374];
      if (leftEye && leftLow && rightEye && rightLow) {
        expressionRef.current.blink = Math.max(0, Math.min(1, 1 - (Math.abs(leftLow.y-leftEye.y) + Math.abs(rightLow.y-rightEye.y)) * 18));
      }
      const left = face[33], right = face[263];
      if (left && right) expressionRef.current.lean = Math.atan2(right.y-left.y,right.x-left.x);
    }
  }, [face, leftHand, rightHand, mouthOpen]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color("#0b0d15");
    const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 100);
    camera.position.set(0, 0, 3.4);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    onCanvasReady?.(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.075; controls.minDistance = 1.7; controls.maxDistance = 6;
    controlsRef.current = controls;
    scene.add(new THREE.AmbientLight(0xffffff, 1.65));
    const makeHand = (color: number) => {
      const group = new THREE.Group();
      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const jointMaterial = new THREE.MeshBasicMaterial({ color });
      const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
      for (const [a,b] of edges) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute([0,0,0,0,0,0],3));
        group.add(new THREE.Line(geometry, material));
      }
      for (let i=0;i<21;i++) { const joint = new THREE.Mesh(new THREE.SphereGeometry(0.009,6,6),jointMaterial); group.add(joint); }
      scene.add(group); return group;
    };
    handVisualsRef.current = { left: makeHand(0x80d8ff), right: makeHand(0xc4a7ff) };
    const key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(-1, 2, 3); scene.add(key);
    const animate = () => {
      const handVisuals = handVisualsRef.current;
      if (handVisuals) {
        for (const side of ["left","right"] as const) {
          const points = handsRef.current[side]; const group = handVisuals[side]; group.visible = Boolean(points?.length === 21);
          if (points?.length === 21) {
            const aspect = 1.0;
            for (let i=0;i<21;i++) { const point=points[i]; const joint=group.children[21+i] as THREE.Mesh; joint.position.set((0.5-point.x)*aspect,0.5-point.y,0.28); }
            let edgeIndex=0;
            const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
            for (const [a,b] of edges) { const line=group.children[edgeIndex++] as THREE.Line; const pa=points[a],pb=points[b]; const attr=line.geometry.getAttribute("position") as THREE.BufferAttribute; attr.setXYZ(0,(0.5-pa.x)*aspect,0.5-pa.y,0.28); attr.setXYZ(1,(0.5-pb.x)*aspect,0.5-pb.y,0.28); attr.needsUpdate=true; line.geometry.computeBoundingSphere(); }
          }
        }
      }
      const mesh = meshRef.current;
      if (mesh) {
        const e = expressionRef.current;
        mesh.rotation.z += (e.lean * 0.18 - mesh.rotation.z) * 0.08;
        mesh.rotation.y += ((e.hand * 0.18) - mesh.rotation.y) * 0.035;
        const mat = mesh.material as THREE.ShaderMaterial;
        if (mat.uniforms) {
          mat.uniforms.uMouth.value += (e.mouth - mat.uniforms.uMouth.value) * 0.18;
          mat.uniforms.uBlink.value += (e.blink - mat.uniforms.uBlink.value) * 0.18;
        }
      }
      controls.update(); renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    let frame = requestAnimationFrame(animate);
    const resize = () => {
      const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      if (handVisualsRef.current) { for (const group of [handVisualsRef.current.left, handVisualsRef.current.right]) { scene.remove(group); group.children.forEach((child) => { const object=child as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material }; object.geometry?.dispose(); }); } handVisualsRef.current=null; }
      meshRef.current?.geometry.dispose();
      const material = meshRef.current?.material as THREE.Material | undefined; material?.dispose();
      renderer.dispose(); renderer.domElement.remove(); rendererRef.current = null; sceneRef.current = null; meshRef.current = null; onCanvasReady?.(null);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let created: THREE.Mesh | null = null;
    async function build() {
      if (!photo || !rendererRef.current) return;
      setStatus("Loading local depth model…"); setProgress(5); setModelReady(false);
      try {
        const { pipeline, env } = await import("@huggingface/transformers");
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        const depthEstimator = await pipeline("depth-estimation", "onnx-community/depth-anything-v2-small", {
          device: typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm",
          dtype: "fp16",
          progress_callback: (event: { progress?: number; status?: string }) => {
            if (!cancelled && typeof event.progress === "number") setProgress(Math.max(5, Math.min(85, Math.round(event.progress * 0.85))));
          },
        } as never);
        if (cancelled) return;
        setStatus("Estimating photo depth on this device…"); setProgress(88);
        const result = await depthEstimator(photo) as unknown as Array<{ depth?: { data: ArrayLike<number>; width: number; height: number } }>;
        const depth = result[0]?.depth;
        if (!depth?.data || !depth.width || !depth.height) throw new Error("Depth model returned no depth map.");
        const image = new Image(); image.crossOrigin = "anonymous";
        await new Promise<void>((resolve,reject) => { image.onload=()=>resolve(); image.onerror=()=>reject(new Error("Could not load the selected photo.")); image.src=photo; });
        if (cancelled) return;
        const width = Math.min(240, depth.width), height = Math.max(2, Math.round(width * depth.height / depth.width));
        const geometry = new THREE.PlaneGeometry(image.naturalWidth / image.naturalHeight, 1, width - 1, height - 1);
        const positions = geometry.attributes.position as THREE.BufferAttribute;
        const values = Array.from(depth.data, Number);
        let min = Infinity, max = -Infinity;
        for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
        const sample = (u: number, v: number) => {
          const x = Math.min(depth.width - 1, Math.max(0, Math.round(u * (depth.width - 1))));
          const y = Math.min(depth.height - 1, Math.max(0, Math.round((1-v) * (depth.height - 1))));
          return values[y * depth.width + x] ?? min;
        };
        for (let i=0;i<positions.count;i++) {
          const x = positions.getX(i), y = positions.getY(i);
          const u = x / (image.naturalWidth / image.naturalHeight) + 0.5;
          const v = y + 0.5;
          const raw = sample(u,v);
          const normalized = (raw-min) / Math.max(0.0001,max-min);
          positions.setZ(i, (normalized - 0.5) * 0.24);
        }
        positions.needsUpdate = true; geometry.computeVertexNormals();
        const texture = await new THREE.TextureLoader().loadAsync(photo);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.ShaderMaterial({
          uniforms: { map: { value: texture }, uMouth: { value: 0 }, uBlink: { value: 0 }, uMouthCenter: { value: new THREE.Vector2(sourceFace?.[13]?.x ?? 0.5, 1-(sourceFace?.[13]?.y ?? 0.66)) }, uEyeLeft: { value: new THREE.Vector2(sourceFace?.[33]?.x ?? 0.4, 1-(sourceFace?.[33]?.y ?? 0.42)) }, uEyeRight: { value: new THREE.Vector2(sourceFace?.[263]?.x ?? 0.6, 1-(sourceFace?.[263]?.y ?? 0.42)) } },
          vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
          fragmentShader: `uniform sampler2D map; uniform float uMouth; uniform float uBlink; uniform vec2 uMouthCenter; uniform vec2 uEyeLeft; uniform vec2 uEyeRight; varying vec2 vUv; void main(){ vec2 uv=vUv; float mouth=distance(uv,uMouthCenter); float mouthMask=1.0-smoothstep(0.008,0.045,mouth); uv.y += mouthMask*uMouth*0.012; float eyeL=distance(uv,uEyeLeft); float eyeR=distance(uv,uEyeRight); float eyes=1.0-smoothstep(0.012,0.04,min(eyeL,eyeR)); uv.y -= eyes*uBlink*0.006; gl_FragColor=texture2D(map,clamp(uv,0.0,1.0)); }`,
        });
        created = new THREE.Mesh(geometry, material);
        if (cancelled) { geometry.dispose(); material.dispose(); texture.dispose(); return; }
        const scene = sceneRef.current;
        if (!scene) return;
        if (meshRef.current) { scene.remove(meshRef.current); meshRef.current.geometry.dispose(); (meshRef.current.material as THREE.Material).dispose(); }
        meshRef.current = created;
        scene.add(created);
        setProgress(100); setStatus("3D depth surface ready · drag to rotate, scroll to zoom."); setModelReady(true);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : "On-device depth estimation failed. Try a newer browser or GPU-enabled device.");
      }
    }
    void build();
    return () => { cancelled = true; if (created) { created.geometry.dispose(); (created.material as THREE.Material).dispose(); } };
  }, [photo]);

  return <div className="photo3d-panel">
    <div className="photo3d-heading"><strong>Single-photo 3D reconstruction</strong><span>{modelReady ? "3D READY" : "ON-DEVICE"}</span></div>
    <div ref={hostRef} className="photo3d-view" aria-label="Interactive rotatable depth avatar preview" />
    <div className="photo3d-status">{status}</div>
    {!modelReady && <div className="photo3d-progress"><i style={{ width: progress + "%" }} /></div>}
    <p className="photo3d-help">Drag to orbit · scroll to zoom · right-click drag to pan. The photo and depth map stay on this device. This is a single-view depth surface, not a complete hidden-side body model.</p>
    <div className="photo3d-tracking"><span>Face: {face?.length ? "tracked" : "waiting"}</span><span>Left hand: {leftHand?.length ? "tracked" : "waiting"}</span><span>Right hand: {rightHand?.length ? "tracked" : "waiting"}</span></div>
  </div>;
}
