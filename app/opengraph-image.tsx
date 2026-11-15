import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Veyra AI — Imagine it. Bring it to life.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "88px", color: "#f7f4ff", background: "radial-gradient(circle at 82% 18%, #49377b 0%, transparent 38%), linear-gradient(135deg, #090a11 0%, #171322 58%, #0b111d 100%)", fontFamily: "Arial" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "18px", marginBottom: "58px" }}>
        <div style={{ width: "62px", height: "62px", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#c2a8ff,#5142b3)", fontSize: "40px", fontWeight: 800 }}>V</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: "26px", fontWeight: 800, letterSpacing: "5px" }}>VEYRA AI<span style={{ color: "#b7a0ff", fontSize: "12px", letterSpacing: "4px", marginTop: "5px" }}>CREATIVE STUDIO</span></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: "64px", lineHeight: 1.08, fontWeight: 700, maxWidth: "900px", letterSpacing: "-2px" }}><span>Imagine it.</span><span>Bring it to life.</span></div>
      <div style={{ display: "flex", marginTop: "34px", fontSize: "22px", color: "#b9b4c9" }}>AI images · Photo editing · Cinematic video</div>
      <div style={{ display: "flex", position: "absolute", right: "88px", bottom: "60px", color: "#9f8bda", fontSize: "16px" }}>VEYRA AI</div>
    </div>,
    size
  );
}
