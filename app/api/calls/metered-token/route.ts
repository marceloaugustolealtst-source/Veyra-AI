import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to connect to this call." }, { status: 401 });

    const body = await request.json() as { roomId?: string };
    const roomId = body.roomId?.trim();
    if (!roomId || roomId.length > 80) {
      return NextResponse.json({ error: "A valid call room is required." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: membership, error: membershipError } = await admin
      .from("veyra_call_participants")
      .select("room_id")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError || !membership) {
      return NextResponse.json({ error: "You are not a participant in this call." }, { status: 403 });
    }

    const keyId = process.env.METERED_REALTIME_KEY_ID;
    const signingSecret = process.env.METERED_REALTIME_SIGNING_SECRET;
    if (!keyId || !signingSecret) {
      return NextResponse.json({ error: "Metered Realtime credentials are not configured on the server." }, { status: 503 });
    }

    const displayName = typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name.slice(0, 80)
      : "VEYRA user";
    const response = await fetch("https://rms.metered.ca/v1/tokens", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + keyId + ":" + signingSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        peerId: user.id,
        channels: ["veyra-call-" + roomId],
        permissions: ["publish", "subscribe", "presence", "send"],
        expiresInSec: 3600,
        peerMetadata: { username: displayName },
      }),
      cache: "no-store",
    });
    const result = await response.json() as { token?: string; error?: string };
    if (!response.ok || !result.token) {
      return NextResponse.json({ error: "Metered could not authorize this call connection." }, { status: 502 });
    }
    return NextResponse.json({ token: result.token }, {
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch {
    return NextResponse.json({ error: "Unable to authorize the call connection." }, { status: 500 });
  }
}
