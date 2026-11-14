"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
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
  const [verificationCode, setVerificationCode] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
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
      if (awaitingCode) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: verificationCode.trim(), type: "signup" });
        if (verifyError) throw verifyError;
        router.replace("/");
        router.refresh();
        return;
      }
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (authError) throw authError;
        if (data.session) {
          router.replace("/");
          router.refresh();
        } else {
          setAwaitingCode(true);
          setNotice(`We sent a verification code to ${email.trim()}. Enter the code from that email to activate your account.`);
        }
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
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
      <div className="auth-glow auth-glow-one" /><div className="auth-glow auth-glow-two" />
      <Link href="/" className="auth-back"><ArrowLeft size={15} /> Back to studio</Link>
      <section className="auth-card">
        <Link href="/" className="auth-brand"><span className="brand-mark">V</span><span><strong>VEYRA AI</strong><small>CREATIVE STUDIO</small></span></Link>
        <div className="auth-kicker"><Sparkles size={13} /> YOUR CREATIVE SPACE</div>
        <h1>{awaitingCode ? "Check your inbox." : mode === "signup" ? "Create your account." : "Welcome back."}</h1>
        <p className="auth-intro">{awaitingCode ? `Enter the one-time verification code sent to ${email}.` : mode === "signup" ? "Join Veyra and keep your creative work in one place." : "Sign in to continue to your Veyra workspace."}</p>
        {!awaitingCode && <div className="auth-switch" role="tablist" aria-label="Account access">
          <button type="button" className={mode === "signup" ? "current" : ""} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Create account</button>
          <button type="button" className={mode === "signin" ? "current" : ""} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Sign in</button>
        </div>}
        <form className="auth-form" onSubmit={handleSubmit}>
          {awaitingCode ? <label><span>Email verification code</span><input inputMode="numeric" autoComplete="one-time-code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Enter the code from your email" minLength={6} maxLength={8} required /></label> : <>
            {mode === "signup" && <label><span>Full name</span><input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" required maxLength={80} /></label>}
            <label><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            <label><span>Password</span><div className="password-field"><input type={showPassword ? "text" : "password"} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
          </>}
          {error && <p className="auth-feedback auth-error" role="alert">{error}</p>}
          {notice && <p className="auth-feedback auth-success" role="status">{notice}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : awaitingCode ? "Verify email" : mode === "signup" ? "Create account" : "Sign in"} <span>↗</span></button>
          {awaitingCode && <button className="soft-btn" type="button" onClick={() => { setAwaitingCode(false); setVerificationCode(""); setNotice(""); setError(""); }}>Use a different email</button>}
        </form>
        <p className="auth-legal">By continuing, you agree to use Veyra responsibly and respect the rights and consent of others.</p>
      </section>
      <p className="auth-foot">© 2026 Veyra AI · Imagine it. Bring it to life.</p>
    </main>
  );
}
