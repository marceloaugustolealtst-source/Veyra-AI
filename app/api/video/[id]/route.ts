import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const RUNWAY = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";
const BUCKET = "veyra-user-media";
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to view your video." }, { status: 401 });
    const { id } = await context.params;
    const admin = createAdminClient();
    const { data: generation, error } = await admin.from("generations")
      .select("id,user_id,status,provider_job_id,settings,error_message")
      .eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error || !generation) return NextResponse.json({ error: "Video generation not found." }, { status: 404 });

    if (generation.status === "succeeded") {
      const { data: asset } = await admin.from("media_assets").select("object_path").eq("generation_id", id).eq("user_id", user.id).maybeSingle();
      if (!asset) return NextResponse.json({ error: "Your video record is complete, but its saved file could not be found." }, { status: 500 });
      const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(asset.object_path, 60 * 60);
      const { data: wallet } = await admin.from("credit_wallets").select("balance").eq("user_id", user.id).maybeSingle();
      return NextResponse.json({ status: "succeeded", videoUrl: signed?.signedUrl, creditsRemaining: Number(wallet?.balance ?? 0) });
    }
    if (generation.status === "failed" || generation.status === "cancelled") {
      return NextResponse.json({ status: generation.status, error: generation.error_message || "Video generation failed." });
    }
    if (!generation.provider_job_id || !process.env.RUNWAYML_API_SECRET) return NextResponse.json({ error: "Video task is not ready to check." }, { status: 409 });

    const response = await fetch(`${RUNWAY}/tasks/${encodeURIComponent(generation.provider_job_id)}`, {
      headers: { Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`, "X-Runway-Version": VERSION },
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    const task = await response.json() as { status?: string; output?: string[]; failure?: string; error?: string };
    if (!response.ok) throw new Error(task.error || `Runway task lookup returned status ${response.status}.`);
    const status = String(task.status ?? "PENDING").toUpperCase();
    if (status === "PENDING" || status === "THROTTLED" || status === "RUNNING") return NextResponse.json({ status: "processing" });
    if (status === "FAILED" || status === "CANCELED" || status === "CANCELLED") {
      const reason = task.failure || task.error || "The video provider could not complete this generation.";
      await admin.rpc("veyra_refund_video_generation", { p_user_id: user.id, p_generation_id: id, p_reason: reason.slice(0, 240) });
      return NextResponse.json({ status: "failed", error: "Video generation failed. Your reserved credits have been returned." });
    }
    if (status !== "SUCCEEDED" || !task.output?.[0]) return NextResponse.json({ status: "processing" });

    const outputUrl = task.output[0];
    const parsedUrl = new URL(outputUrl);
    if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith("cloudfront.net")) throw new Error("The video provider returned an unexpected output location.");
    const videoResponse = await fetch(outputUrl, { signal: AbortSignal.timeout(90000), cache: "no-store" });
    if (!videoResponse.ok) throw new Error("The completed video could not be downloaded from the provider.");
    const contentLength = Number(videoResponse.headers.get("content-length") ?? 0);
    if (contentLength > MAX_VIDEO_BYTES) throw new Error("The generated video is larger than the 100 MB library limit.");
    const bytes = Buffer.from(await videoResponse.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_VIDEO_BYTES) throw new Error("The generated video is empty or exceeds the 100 MB library limit.");

    const objectPath = `${user.id}/${id}.mp4`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(objectPath, bytes, { contentType: "video/mp4", cacheControl: "3600", upsert: true });
    if (uploadError) throw new Error("The generated video could not be saved to your private library.");
    const model = String((generation.settings as Record<string, unknown> | null)?.model ?? "kling_4");
    const { data: credits, error: completeError } = await admin.rpc("veyra_complete_video_generation", {
      p_user_id: user.id, p_generation_id: id, p_object_path: objectPath, p_file_size: bytes.length, p_model: model,
    });
    if (completeError) throw new Error("The video was created but could not be finalized in your library.");
    const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(objectPath, 60 * 60);
    if (signedError || !signed?.signedUrl) throw new Error("The video was saved but a secure preview link could not be created.");
    return NextResponse.json({ status: "succeeded", videoUrl: signed.signedUrl, creditsRemaining: Number(credits ?? 0) });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Could not check the video task." }, { status: 500 });
  }
}
