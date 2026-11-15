import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  try {
    const userClient = await createClient();
    const { data: { user }, error: authError } = await userClient.auth.getUser();

    if (authError || !user) {
      if (authError) console.error("[account] Supabase session validation failed:", authError.message);
      return NextResponse.json(
        { error: "Your sign-in session could not be verified. Please sign in again." },
        { status: 401, headers: noStore },
      );
    }

    const admin = createAdminClient();
    const [{ data: profile, error: profileError }, { data: wallet, error: walletError }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      admin.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle(),
    ]);

    if (profileError || walletError) {
      console.error("[account] Supabase account query failed:", {
        profileError: profileError?.message ?? null,
        walletError: walletError?.message ?? null,
        userId: user.id,
      });
      return NextResponse.json(
        { error: "Your account balance could not be loaded. Please try again shortly." },
        { status: 500, headers: noStore },
      );
    }

    if (!wallet) {
      console.error("[account] No credit wallet row found for authenticated user:", user.id);
      return NextResponse.json(
        { error: "Your credit wallet has not been initialized. Please contact support." },
        { status: 404, headers: noStore },
      );
    }

    return NextResponse.json({
      email: user.email ?? "",
      name: profile?.full_name || user.user_metadata?.full_name || user.email || "Your account",
      credits: Number(wallet.balance ?? 0),
      emailVerified: Boolean(user.email_confirmed_at),
    }, { headers: noStore });
  } catch (error) {
    console.error("[account] Unexpected account endpoint failure:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "Your account details could not be loaded. Please try again shortly." },
      { status: 500, headers: noStore },
    );
  }
}
