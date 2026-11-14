# Veyra AI

A premium creative studio for AI image generation, photo editing, and cinematic video creation.

## Stack

- Next.js App Router and TypeScript
- React
- CSS design system with a responsive dark studio interface
- Planned integrations: Supabase Auth/Database/Storage and external image/video generation providers

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Current status

The initial responsive workspace UI is in place. AI generation, authentication, billing, and persistence are not connected yet; generation controls are intentionally marked as coming soon until provider credentials and secure backend workflows are configured.


## Supabase setup

Authentication is wired through Supabase Auth using cookie-based sessions with the official `@supabase/ssr` integration.

1. Copy `.env.example` to `.env.local`.
2. In the Veyra AI Supabase project, copy the Project URL and **publishable key** into the two environment variables.
3. In Supabase Authentication URL Configuration, add your local URL (for example `http://localhost:3000/**`) and your deployed Veyra domain to the allowed redirect URLs.
4. Enable email confirmation in Supabase Auth if you want new users to verify their email before signing in.

Never place a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable or in browser code.

The account screens and session refresh are implemented. User profiles, credits, generation history, AI provider connections, and billing still need their database schema and server-side workflows.
