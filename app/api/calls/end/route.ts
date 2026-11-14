import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in to end this call." }, { status: 401 });
    const body = await request.json() as { roomId?: string };
    if (!body.roomId) return NextResponse.json({ error: "Call room is required." }, { status: 400 });
    const admin = createAdminClient();
    const { data: room, error } = await admin.from("veyra_call_rooms").select("id,host_id,guest_id,status").eq("id", body.roomId).maybeSingle();
    if (error || !room) return NextResponse.json({ error: "Call room was not found." }, { status: 404 });
    if (room.host_id !== user.id && room.guest_id !== user.id) return NextResponse.json({ error: "You are not a participant in this call." }, { status: 403 });
    if (room.status !== "ended") {
      const { error: updateError } = await admin.from("veyra_call_rooms").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", room.id);
      if (updateError) return NextResponse.json({ error: "The call could not be marked as ended." }, { status: 500 });
    }
    return NextResponse.json({ ended: true });
  } catch { return NextResponse.json({ error: "Unable to end this call right now." }, { status: 500 }); }
}
