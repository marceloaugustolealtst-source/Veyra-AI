# Veyra AI

A premium creative studio for AI image generation, photo editing, and cinematic video creation.

## Stack

- Next.js App Router and TypeScript
- React and a responsive dark studio CSS design system
- Supabase Auth, Postgres, private Storage and row-level security
- OpenAI Images API for server-side image generation and editing
- Runway Dev API for text-to-video, image-to-video, and video-to-video editing

## Local setup

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`. Never commit real environment values.

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`: Veyra Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: Supabase publishable key; safe for browser use.
- `SUPABASE_SECRET_KEY`: Supabase secret/service-role key; server only. Never prefix it with `NEXT_PUBLIC_`, expose it in client code, or commit it.
- `OPENAI_API_KEY`: OpenAI API key; server only. Never expose it to the browser or commit it.
- `RUNWAYML_API_SECRET`: Runway Dev API key; server only. Never expose it to the browser or commit it.
- `VEYRA_VIDEO_CREDITS_PER_SECOND`: optional Veyra credit price per generated second (defaults to 20).
- `VEYRA_VIDEO_EDIT_CREDITS_PER_SECOND`: optional Veyra credit price per edited second (defaults to 36).

Add the four required variables plus the Runway key to the Vercel project settings and redeploy. The two video credit settings are optional. Image generation uses the OpenAI Images API with `gpt-image-2.5-flare`. Your OpenAI organization may need image-model access or organization verification.

## Image generation and credits

The authenticated `POST /api/generate` route validates the request, reserves credits through a privileged database RPC, calls OpenAI from the server, stores the PNG in the private `veyra-user-media` bucket, records the media asset, and returns a one-hour signed preview URL. The provider key is never sent to the browser.

Credit prices are fixed in both the API and database:
- Draft / low: 8 credits
- Standard / medium: 12 credits
- High: 20 credits

The database reserves credits atomically before calling the provider. Provider, upload, or finalization failures trigger an idempotent refund and a failed generation record. Users cannot directly change wallet balances or ledger rows.

## Supabase migrations

- `20261114153615_veyra_user_profiles_credits_media_foundation.sql`: user profiles, wallets, immutable credit ledger, generation history, private media bucket, subscriptions and RLS.
- `20261114163118_veyra_secure_image_generation_credit_pipeline.sql`: service-role-only atomic reserve, complete and refund RPCs for image generation.
- `20261114180000_veyra_video_generation_credit_pipeline.sql`: service-role-only atomic reserve, complete and refund RPCs for video generation and editing.

Apply migrations to the Veyra project only. Do not apply them to Globalvest, International Banco, or UPC Tracker.

## Video generation and editing\n\nThe authenticated `POST /api/video` route submits text-to-video and image-to-video jobs to Runway Kling 4.0, or source-video edits to Aleph 2.0. Jobs are asynchronous; `GET /api/video/:id` checks provider status, downloads completed output, saves the MP4 in the private Supabase bucket, settles the credit reservation, and returns a one-hour signed preview URL. The dashboard supports text prompts, image references, video edits, aspect ratios, and 3–30 second durations. Video-edit duration is read from the uploaded clip and clips must be 3–30 seconds. Uploads are limited to MP4/WebM video up to 100 MB and PNG/JPG/WebP images up to 20 MB.\n\nDefault Veyra credit rates are 20 credits per generated second and 36 credits per edited second. Configure them with the optional environment variables above. These are Veyra app credit prices, not Runway's provider charges; maintain enough Runway API balance separately. Runway's output URLs are temporary, so Veyra copies finished MP4 files into private storage before presenting them.\n\n## Email verification codes

The registration page verifies email OTPs with `verifyOtp({ type: "signup" })`. In Supabase Dashboard → Authentication → Email Templates → Confirm signup, use the `{{ .Token }}` template variable in the email body (not only `{{ .ConfirmationURL }}`). Suggested subject: `Your Veyra AI verification code`. Example body:

```html
<h2>Welcome to Veyra AI</h2>
<p>Use this one-time code to verify your email address:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>If you did not create a Veyra AI account, you can ignore this email.</p>
```

For production delivery, configure a trusted custom SMTP provider in Supabase Auth → SMTP Settings, set the Veyra site URL and allowed redirect URLs, and test delivery to an inbox you control. Supabase's default mail service is rate-limited.

## Security notes

- Supabase secret and OpenAI API keys are server-only environment variables.
- The generation credit RPCs revoke execution from anon/authenticated and grant it only to `service_role`.
- Media is stored in a private bucket; preview URLs expire after one hour.
- Do not grant users direct wallet or credit-ledger write permissions.
- Generation prompts are subject to the provider's safety policies.

## Current scope

Text-to-image generation, AI photo editing, Runway text/image-to-video generation, and Runway source-video editing are implemented. They require the respective server-side API keys and a redeployment. Subscriptions, payment processing, and admin tooling are not implemented yet.
