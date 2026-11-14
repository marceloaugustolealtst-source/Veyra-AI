import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const RUNWAY = "https://api.dev.runwayml.com/v1";
const VERSION = "2024-11-06";
const BUCKET = "veyra-user-media";
const MODEL = "kling_4";
const EDIT_MODEL = "aleph2";
const RATIOS: Record<string, string> = {
  landscape: "1280:720",
  portrait: "720:1280",
  square: "960:960",
};

function creditsPerSecond(edit: boolean) {
  const raw = Number(edit ? process.env.VEYRA_VIDEO_EDIT_CREDITS_PER_SECOND : process.env.VEYRA_VIDEO_CREDITS_PER_SECOND);
  return Number.isFinite(raw) && raw >= 1 && raw <= 1000 ? Math.ceil(raw) : edit ? 36 : 20;
}

export async function POST(request: Request) {
  let userId: string | null = null;
  let generationId: string | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Sign in to create videos." }, { status: 401 });
    userId = user.id;

    const body = await request.json() as { prompt?: unknown; mode?: unknown; duration?: unknown; ratio?: unknown; mediaPath?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const mode = body.mode === "video_edit" ? "video_edit" : body.mode === "image_to_video" ? "image_to_video" : "text_to_video";
    const duration = Number(body.duration ?? 5);
    const ratio = typeof body.ratio === "string" ? body.ratio : "landscape";
    const mediaPath = typeof body.mediaPath === "string" ? body.mediaPath : "";

    if (prompt.length < 3 || prompt.length > 1000) return NextResponse.json({ error: "Describe your video in 3 to 1,000 characters." }, { status: 400 });
    if (!Number.isInteger(duration) || duration < 3 || duration > 30) return NextResponse.json({ error: "Choose a duration from 3 to 30 seconds." }, { status: 400 });
    if (!RATIOS[ratio]) return NextResponse.json({ error: "Choose landscape, portrait, or square format." }, { status: 400 });
    if (mode !== "text_to_video" && (!mediaPath || !mediaPath.startsWith(user.id + "/"))) {
      return NextResponse.json({ error: mode === "video_edit" ? "Upload a source video first." : "Upload a starting image first." }, { status: 400 });
    }
    if (!process.env.RUNWAYML_API_SECRET) return NextResponse.json({ error: "Video creation is not activated yet. Add RUNWAYML_API_SECRET in Vercel." }, { status: 503 });

    admin = createAdminClient();
    let mediaUrl: string | null = null;
    if (mediaPath) {
      const extension = mediaPath.toLowerCase().split(".").pop();
      const allowed = mode === "video_edit" ? ["mp4", "webm", "mov"] : ["png", "jpg", "jpeg", "webp"];
      if (!extension || !allowed.includes(extension)) return NextResponse.json({ error: "The uploaded file type is not supported for this operation." }, { status: 400 });
      const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUrl(mediaPath, 60 * 60 * 24);
      if (error || !signed?.signedUrl) return NextResponse.json({ error: "Could not access your uploaded media. Please upload it again." }, { status: 400 });
      mediaUrl = signed.signedUrl;
    }

    const edit = mode === "video_edit";
    const model = edit ? EDIT_MODEL : MODEL;
    const cost = creditsPerSecond(edit) * duration;
    const dbMode = edit ? "video_edit" : "video";
    const { data: reservedId, error: reserveError } = await admin.rpc("veyra_reserve_video_generation", {
      p_user_id: user.id, p_prompt: prompt, p_mode: dbMode, p_model: model, p_duration: duration, p_cost: cost,
    });
    if (reserveError) {
      if (reserveError.message.includes("insufficient_credits")) return NextResponse.json({ error: `Not enough credits. This video requires ${cost} credits.` }, { status: 402 });
      throw new Error("Could not reserve credits for this video.");
    }
    generationId = String(reservedId);

    const endpoint = edit ? "video_to_video" : mode === "image_to_video" ? "image_to_video" : "text_to_video";
    const payload: Record<string, unknown> = { model, promptText: prompt };
    if (edit) payload.videoUri = mediaUrl;
    else {
      payload.duration = duration;
      payload.ratio = RATIOS[ratio];
      if (mode === "image_to_video") payload.promptImage = mediaUrl;
    }

    const response = await fetch(`${RUNWAY}/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`, "Content-Type": "application/json", "X-Runway-Version": VERSION },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(50000),
    });
    const data = await response.json() as { id?: string; error?: string; message?: string; estimatedCost?: { credits?: number } };
    if (!response.ok || !data.id) throw new Error(data.message || data.error || `Runway returned status ${response.status}.`);

    const { error: updateError } = await admin.from("generations").update({
      provider_job_id: data.id,
      settings: { model, duration, ratio: RATIOS[ratio], mode, estimatedProviderCredits: data.estimatedCost?.credits ?? null, creditsPerSecond: creditsPerSecond(edit) },
    }).eq("id", generationId).eq("user_id", user.id);
    if (updateError) {
      await fetch(`${RUNWAY}/tasks/${data.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${process.env.RUNWAYML_API_SECRET}`, "X-Runway-Version": VERSION } }).catch(() => undefined);
      throw new Error("The video task started but could not be attached to your account.");
    }

    return NextResponse.json({ generationId, status: "processing", creditsReserved: cost, providerEstimatedCredits: data.estimatedCost?.credits ?? null });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Video generation could not be started.";
    if (admin && userId && generationId) await admin.rpc("veyra_refund_video_generation", { p_user_id: userId, p_generation_id: generationId, p_reason: message.slice(0, 240) });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
