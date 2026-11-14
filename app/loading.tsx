export default function Loading() {
  return <main className="app-loading" role="status" aria-live="polite">
    <div className="app-loading-inner">
      <span className="brand-mark">V</span>
      <span className="loading-orb" />
      <span>Preparing your Veyra studio…</span>
    </div>
  </main>;
}
