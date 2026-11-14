import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
const ADMIN_EMAIL = "hoangthi3000@gmail.com";

async function requireAdmin() {
  const userClient = await createClient();
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user || !user.email || !user.email_confirmed_at || user.email.toLowerCase() !== ADMIN_EMAIL) {
    return { admin: null, response: NextResponse.json({ error: "Administrator access required." }, { status: 403 }) };
  }
  return { admin: createAdminClient(), response: null, email: user.email };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response || !auth.admin) return auth.response!;
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  if (query.length < 3) return NextResponse.json({ users: [] });
  try {
    const matches: Array<{ id: string; email: string; created_at: string | undefined }> = [];
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await auth.admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      for (const user of data.users) {
        if (user.email?.toLowerCase().includes(query)) {
          matches.push({ id: user.id, email: user.email!, created_at: user.created_at });
        }
      }
      if (data.users.length < 1000 || matches.length >= 20) break;
    }
    return NextResponse.json({ users: matches.slice(0, 20) });
  } catch {
    return NextResponse.json({ error: "Could not search accounts." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response || !auth.admin) return auth.response!;
  try {
    const body = await request.json() as { email?: string; amount?: number; description?: string };
    const email = String(body.email ?? "").trim().toLowerCase();
    const amount = Number(body.amount);
    const description = String(body.description ?? "").trim().slice(0, 160);
    if (!email || !Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 10000000) {
      return NextResponse.json({ error: "Enter an account email and a non-zero whole-number credit amount (maximum 10,000,000)." }, { status: 400 });
    }
    const { data, error } = await auth.admin.rpc("veyra_admin_adjust_credits", {
      p_user_email: email,
      p_amount: amount,
      p_admin_email: auth.email!,
      p_description: description || null,
    });
    if (error) return NextResponse.json({ error: error.message.includes("No verified") ? "No verified Veyra account was found for that email." : error.message }, { status: 400 });
    const result = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ success: true, balance: Number(result.new_balance), transactionId: result.transaction_id, email });
  } catch {
    return NextResponse.json({ error: "Credit adjustment could not be completed." }, { status: 500 });
  }
}
