import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

async function getUser() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  return error || !user ? null : user;
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to view notifications." }, { status: 401 });
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("notifications")
      .select("id,notification_type,title,message,related_id,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return NextResponse.json({ notifications: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Notifications could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to update notifications." }, { status: 401 });
  try {
    const body = await request.json() as { id?: string; all?: boolean };
    const admin = createAdminClient();
    let query = admin.from("notifications").update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id).is("read_at", null);
    if (!body.all) {
      if (!body.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) {
        return NextResponse.json({ error: "Choose a valid notification." }, { status: 400 });
      }
      query = query.eq("id", body.id);
    }
    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Notification could not be updated." }, { status: 500 });
  }
}
