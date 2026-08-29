import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';

export default function NotFound() {
  return (
    <main className="app-shell">
      <SiteHeader compact />
      <section className="center-card">
        <span className="result-icon">404</span>
        <h1>This memory drifted away.</h1>
        <p>The page or secret link could not be found.</p>
        <Link className="primary-button" href="/">Back home</Link>
      </section>
    </main>
  );
}
