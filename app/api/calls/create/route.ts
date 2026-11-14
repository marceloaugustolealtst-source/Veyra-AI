import { NextResponse } from "next/server";
import { randomBytes, createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in before starting a call." }, { status: 401 });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const admin = createAdminClient();
    const { data: room, error } = await admin.from("veyra_call_rooms").insert({
      host_id: user.id,
      invite_token_hash: tokenHash,
      status: "waiting",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }).select("id").single();
    if (error || !room) return NextResponse.json({ error: "A call room could not be created." }, { status: 500 });

    const { error: participantError } = await admin.from("veyra_call_participants").insert({ room_id: room.id, user_id: user.id });
    if (participantError) {
      await admin.from("veyra_call_rooms").delete().eq("id", room.id);
      return NextResponse.json({ error: "Call access could not be initialized." }, { status: 500 });
    }
    const origin = new URL(request.url).origin;
    const inviteUrl = origin + "/?call=" + room.id + "&invite=" + token;
    return NextResponse.json({ roomId: room.id, inviteUrl });
  } catch {
    return NextResponse.json({ error: "Call setup failed. Please try again." }, { status: 500 });
  }
}
