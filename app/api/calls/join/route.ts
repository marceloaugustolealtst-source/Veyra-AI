import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to join this call." }, { status: 401 });
    const body = await request.json() as { roomId?: string; inviteToken?: string };
    if (!body.roomId || !body.inviteToken || body.inviteToken.length > 128) {
      return NextResponse.json({ error: "This invite link is incomplete." }, { status: 400 });
    }
    const tokenHash = createHash("sha256").update(body.inviteToken).digest("hex");
    const admin = createAdminClient();
    const { data: room, error } = await admin.from("veyra_call_rooms")
      .select("id,host_id,invite_token_hash,guest_id,status,expires_at")
      .eq("id", body.roomId).maybeSingle();
    if (error || !room) return NextResponse.json({ error: "This call invite is invalid or has expired." }, { status: 404 });
    const supplied = Buffer.from(tokenHash, "hex");
    const expected = Buffer.from(room.invite_token_hash, "hex");
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return NextResponse.json({ error: "This call invite is invalid or has expired." }, { status: 403 });
    }
    if (new Date(room.expires_at).getTime() < Date.now() || room.status === "ended") {
      return NextResponse.json({ error: "This call invite has expired." }, { status: 410 });
    }
    if (room.host_id === user.id) return NextResponse.json({ error: "You created this call. Open the host session instead." }, { status: 400 });
    if (room.guest_id && room.guest_id !== user.id) return NextResponse.json({ error: "This invite has already been used by another participant." }, { status: 409 });

    const { error: updateError } = await admin.from("veyra_call_rooms").update({ guest_id: user.id, status: "active" }).eq("id", room.id);
    if (updateError) return NextResponse.json({ error: "This call could not be joined." }, { status: 500 });
    const { error: memberError } = await admin.from("veyra_call_participants").upsert({ room_id: room.id, user_id: user.id }, { onConflict: "room_id,user_id" });
    if (memberError) return NextResponse.json({ error: "Call access could not be granted." }, { status: 500 });
    return NextResponse.json({ roomId: room.id, joined: true });
  } catch {
    return NextResponse.json({ error: "Unable to join this call right now." }, { status: 500 });
  }
}
