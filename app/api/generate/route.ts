import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "gpt-image-2.5-flare";
const BUCKET = "veyra-user-media";
const COSTS = { low: 8, medium: 12, high: 20 } as const;
const SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;

type Quality = keyof typeof COSTS;

export async function POST(request: Request) {
  let generationId: string | null = null;
  let userId: string | null = null;
  let objectPath: string | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;

  try {
    const userClient = await createClient();
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Sign in to generate and save images." }, { status: 401 });
    }
    userId = user.id;

    const body = await request.json() as { prompt?: unknown; size?: unknown; quality?: unknown };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const size = typeof body.size === "string" ? body.size : "1024x1024";
    const quality = typeof body.quality === "string" ? body.quality : "medium";

    if (prompt.length < 3 || prompt.length > 20000) {
      return NextResponse.json({ error: "Your prompt must be between 3 and 20,000 characters." }, { status: 400 });
    }
    if (!SIZES.includes(size as (typeof SIZES)[number])) {
      return NextResponse.json({ error: "Choose a supported image size." }, { status: 400 });
    }
    if (!(quality in COSTS)) {
      return NextResponse.json({ error: "Choose low, medium, or high quality." }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Image generation is not activated yet. Add OPENAI_API_KEY in your Vercel server environment." }, { status: 503 });
    }

    admin = createAdminClient();
    const cost = COSTS[quality as Quality];
    const { data: reservedId, error: reserveError } = await admin.rpc("veyra_reserve_image_generation", {
      p_user_id: user.id,
      p_prompt: prompt,
      p_size: size,
      p_quality: quality,
      p_cost: cost,
    });
    if (reserveError) {
      if (reserveError.message.includes("insufficient_credits")) {
        return NextResponse.json({ error: `Not enough credits. This image requires ${cost} credits.` }, { status: 402 });
      }
      throw new Error("Could not reserve credits for this generation.");
    }
    generationId = String(reservedId);

    const providerResponse = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        prompt,
        n: 1,
        size,
        quality,
        output_format: "png",
      }),
      signal: AbortSignal.timeout(105000),
    });

    const providerData = await providerResponse.json() as {
      data?: Array<{ b64_json?: string }>;
      error?: { message?: string };
    };
    if (!providerResponse.ok) {
      throw new Error(providerData.error?.message || `Image provider returned status ${providerResponse.status}.`);
    }

    const encodedImage = providerData.data?.[0]?.b64_json;
    if (!encodedImage) throw new Error("The image provider returned no image data.");

    const imageBytes = Buffer.from(encodedImage, "base64");
    if (imageBytes.length === 0 || imageBytes.length > 25 * 1024 * 1024) {
      throw new Error("The generated image was empty or exceeded the 25 MB storage limit.");
    }

    objectPath = `${user.id}/${generationId}.png`;
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(objectPath, imageBytes, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw new Error("The generated image could not be saved to your private library.");

    const { data: signed, error: signedError } = await admin.storage.from(BUCKET).createSignedUrl(objectPath, 60 * 60);
    if (signedError || !signed?.signedUrl) throw new Error("The image was saved but a secure preview link could not be created.");

    const { data: remainingCredits, error: completeError } = await admin.rpc("veyra_complete_image_generation", {
      p_user_id: user.id,
      p_generation_id: generationId,
      p_object_path: objectPath,
      p_file_size: imageBytes.length,
      p_model: MODEL,
    });
    if (completeError) throw new Error("The image was generated but could not be finalized in your library.");

    return NextResponse.json({
      generationId,
      imageUrl: signed.signedUrl,
      creditsUsed: cost,
      creditsRemaining: Number(remainingCredits ?? 0),
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Image generation failed.";
    if (admin && userId && generationId) {
      if (objectPath) await admin.storage.from(BUCKET).remove([objectPath]).catch(() => undefined);
      await admin.rpc("veyra_refund_image_generation", {
        p_user_id: userId,
        p_generation_id: generationId,
        p_reason: message.slice(0, 240),
      });
    }
    const safeMessage = message.includes("SUPABASE_SECRET_KEY")
      ? "Image generation needs its secure Supabase server key. Add SUPABASE_SECRET_KEY in Vercel."
      : message.includes("OPENAI_API_KEY")
        ? "Image generation needs an OpenAI API key in the Vercel server environment."
        : message;
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}
