'use client';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-shell error-page">
      <section className="center-card">
        <span className="result-icon">!</span>
        <h1>The memory slipped.</h1>
        <p>Drawmory hit a temporary problem. Your saved memory links are still on this device.</p>
        <button className="primary-button" type="button" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
