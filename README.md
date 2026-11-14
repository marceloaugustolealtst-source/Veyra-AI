# Veyra AI

A premium creative studio for AI image generation, photo editing, and cinematic video creation.

## Stack

- Next.js App Router and TypeScript
- React and a responsive dark studio CSS design system
- Supabase Auth, Postgres, private Storage and row-level security
- OpenAI Images API for server-side image generation

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

Add all four variables to the Vercel project settings and redeploy. Image generation uses the OpenAI Images API with `gpt-image-2.5-flare`. Your OpenAI organization may need image-model access or organization verification.

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

Apply migrations to the Veyra project only. Do not apply them to Globalvest, International Banco, or UPC Tracker.

## Email verification codes

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

Text-to-image generation is connected once the required Vercel secrets are supplied. AI photo editing is now connected through the authenticated `/api/edit` route and uses the same secure credit reservation, private storage, and refund flow as image generation. Reference editing accepts PNG/JPG/WebP uploads up to 4 MB through the Vercel function. Video generation/editing, subscriptions, payment processing, and admin tooling are not implemented yet.
