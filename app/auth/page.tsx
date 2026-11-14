"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "signin" | "signup";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const supabase = createClient();

      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (authError) throw authError;

        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setNotice("Your account has been created. Check your email for the confirmation link, then return here to sign in.");
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        router.replace("/");
        router.refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-glow auth-glow-one" />
      <div className="auth-glow auth-glow-two" />
      <Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to studio</Link>
      <section className="auth-card">
        <Link href="/" className="auth-brand">
          <span className="brand-mark">V</span>
          <span><strong>VEYRA AI</strong><small>CREATIVE STUDIO</small></span>
        </Link>
        <div className="auth-kicker"><Sparkles size={13} /> YOUR CREATIVE SPACE</div>
        <h1>{mode === "signup" ? "Create your account." : "Welcome back."}</h1>
        <p className="auth-intro">{mode === "signup" ? "Join Veyra and keep your creative work in one place." : "Sign in to continue to your Veyra workspace."}</p>

        <div className="auth-switch" role="tablist" aria-label="Account access">
          <button type="button" className={mode === "signup" ? "current" : ""} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create account</button>
          <button type="button" className={mode === "signin" ? "current" : ""} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Sign in</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              <span>Full name</span>
              <input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" required maxLength={80} />
            </label>
          )}
          <label>
            <span>Email address</span>
            <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          </label>
          <label>
            <span>Password</span>
            <div className="password-field">
              <input type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required />
              <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
          </label>
          {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-feedback auth-success" role="status">{notice}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"} <span>↗</span></button>
        </form>
        <p className="auth-legal">By continuing, you agree to use Veyra responsibly and respect the rights and consent of others.</p>
      </section>
      <p className="auth-foot">© 2026 Veyra AI · Imagine it. Bring it to life.</p>
    </main>
  );
}
