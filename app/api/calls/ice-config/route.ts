import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to configure call networking." }, { status: 401 });
    const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];
    const urls = (process.env.TURN_URLS || process.env.TURN_URL || "").split(",").map((value) => value.trim()).filter(Boolean);
    const username = process.env.TURN_USERNAME, credential = process.env.TURN_CREDENTIAL;
    if (urls.length && username && credential) iceServers.push({ urls, username, credential });
    return NextResponse.json({ iceServers, turnConfigured: iceServers.length > 2 }, { headers: { "Cache-Control": "no-store, private" } });
  } catch { return NextResponse.json({ error: "Call network configuration is unavailable." }, { status: 500 }); }
}
