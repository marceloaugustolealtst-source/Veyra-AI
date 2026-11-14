import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userClient = await createClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Sign in to view your account." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const admin = createAdminClient();
    const [{ data: profile, error: profileError }, { data: wallet, error: walletError }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      admin.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);
    if (profileError || walletError) {
      return NextResponse.json({ error: "Your account balance could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({
      email: user.email ?? "",
      name: profile?.full_name || user.user_metadata?.full_name || user.email || "Your account",
      credits: Number(wallet?.balance ?? 0),
      emailVerified: Boolean(user.email_confirmed_at),
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "Your account details could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
