import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET() {
  const userClient = await createClient();
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return NextResponse.json({ error: "Sign in to view your creations." }, { status: 401 });

  try {
    const admin = createAdminClient();
    const { data: assets, error } = await admin
      .from("media_assets")
      .select("id, generation_id, object_path, created_at, metadata")
      .eq("user_id", user.id)
      .eq("media_type", "image")
      .order("created_at", { ascending: false })
      .limit(18);
    if (error) throw error;

    const items = await Promise.all((assets ?? []).map(async (asset) => {
      const { data } = await admin.storage.from("veyra-user-media").createSignedUrl(asset.object_path, 60 * 60);
      return {
        id: asset.id,
        generationId: asset.generation_id,
        createdAt: asset.created_at,
        imageUrl: data?.signedUrl ?? null,
      };
    }));
    return NextResponse.json({ creations: items.filter((item) => item.imageUrl) });
  } catch {
    return NextResponse.json({ error: "Your saved creations could not be loaded." }, { status: 500 });
  }
}
