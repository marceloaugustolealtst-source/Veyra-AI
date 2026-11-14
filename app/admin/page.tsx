"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Search, ShieldCheck, Zap } from "lucide-react";

type UserMatch = { id: string; email: string; created_at?: string };

export default function AdminCreditsPage() {
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserMatch[]>([]);
  const [amount, setAmount] = useState("100");
  const [description, setDescription] = useState("Admin credit grant");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 3) { setUsers([]); return; }
      try {
        const response = await fetch(`/api/admin/credits?q=${encodeURIComponent(query.trim())}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Account search failed.");
        setUsers(data.users ?? []);
      } catch (cause) {
        setError(true);
        setMessage(cause instanceof Error ? cause.message : "Account search failed.");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError(false); setBalance(null);
    try {
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, amount: Number(amount), description }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Credit adjustment failed.");
      setBalance(data.balance);
      setMessage(`Successfully adjusted credits for ${data.email}.`);
      setError(false);
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : "Credit adjustment failed.");
    } finally { setBusy(false); }
  }

  return <main className="admin-page">
    <div className="admin-top"><a href="/"><ArrowLeft size={16}/> Back to Veyra</a><span><ShieldCheck size={15}/> ADMIN CONSOLE</span></div>
    <section className="admin-card">
      <div className="admin-kicker">VE YRA AI · ACCOUNT MANAGEMENT</div>
      <h1>Manage user credits</h1>
      <p className="admin-intro">Find a registered account, then grant or deduct credits. Every adjustment is recorded in the user's transaction history.</p>
      <label className="admin-label" htmlFor="account-search">Find user by email</label>
      <div className="admin-search"><Search size={16}/><input id="account-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search registered email address"/></div>
      {users.length > 0 && <div className="admin-results">{users.map(user => <button type="button" key={user.id} onClick={() => { setEmail(user.email); setQuery(user.email); setUsers([]); }}><span>{user.email}</span><small>Select account</small></button>)}</div>}
      <form onSubmit={submit} className="admin-form">
        <label className="admin-label" htmlFor="target-email">Selected account email</label>
        <input id="target-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com"/>
        <label className="admin-label" htmlFor="credit-amount">Credit adjustment</label>
        <input id="credit-amount" type="number" step="1" min="-10000000" max="10000000" required value={amount} onChange={e => setAmount(e.target.value)} />
        <small className="admin-hint">Use a positive number to add credits or a negative number to deduct credits.</small>
        <label className="admin-label" htmlFor="credit-note">Reason / note</label>
        <input id="credit-note" value={description} maxLength={160} onChange={e => setDescription(e.target.value)} placeholder="Reason for this adjustment"/>
        <button className="admin-submit" type="submit" disabled={busy}>{busy ? "Processing securely…" : <><Zap size={15}/> Apply credit adjustment</>}</button>
      </form>
      {message && <div className={`admin-feedback ${error ? "is-error" : "is-success"}`}>{message}{balance !== null && <strong>New balance: {balance.toLocaleString()} credits</strong>}</div>}
      <div className="admin-security"><ShieldCheck size={16}/><span>Restricted to the verified administrator account <b>hoangthi3000@gmail.com</b>. Credit changes are processed server-side and audited.</span></div>
    </section>
  </main>;
}
