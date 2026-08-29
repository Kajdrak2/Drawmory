'use client';

import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/components/language-provider';

export default function Home() {
  const { t } = useLanguage();
  return (
    <main className="landing-shell">
      <SiteHeader />

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>
            {t('taglineLead')} <span>{t('taglineAccent')}</span>
            <br />
            {t('taglineTail')}
          </h1>
          <p className="hero-lede">{t('homeLede')}</p>
        </div>

        <div className="action-grid" aria-label="Choose how to begin">
          <Link className="action-card action-card-create" href="/create">
            <span className="action-index">01</span>
            <span className="action-gesture action-gesture-draw" aria-hidden="true" />
            <span className="action-label">{t('create')}</span>
            <span className="action-subtitle">{t('createSubtitle')}</span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>

          <Link className="action-card action-card-receive" href="/receive">
            <span className="action-index">02</span>
            <span className="action-gesture action-gesture-receive" aria-hidden="true">
              <span />
            </span>
            <span className="action-label">{t('receive')}</span>
            <span className="action-subtitle">{t('receiveSubtitle')}</span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        </div>

        <footer className="landing-footer">
          <p>{t('privacyLine')}</p>
          <div className="footer-links">
            <Link href="/memories">{t('yourDevice')}</Link>
            <p className="footer-note">{t('privacyTail')}</p>
          </div>
        </footer>
      </section>
    </main>
  );
}
