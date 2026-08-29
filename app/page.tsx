'use client';

import { SiteHeader } from '@/components/site-header';
import { useLanguage } from '@/components/language-provider';
import { DocumentLink } from '@/components/document-link';

export default function Home() {
  const { t } = useLanguage();
  return (
    <main className="landing-shell">
      <SiteHeader />

      <section className="home-start">
        <div className="home-intro">
          <h1>
            {t('taglineLead')} <span>{t('taglineAccent')}</span> {t('taglineTail')}
          </h1>
          <p>{t('homeLede')}</p>
        </div>

        <div className="action-grid" aria-label={t('startPrompt')}>
          <DocumentLink className="action-card action-card-create" href="/create">
            <span className="action-index">01</span>
            <span className="action-gesture action-gesture-draw" aria-hidden="true" />
            <span className="action-label">{t('create')}</span>
            <span className="action-subtitle">{t('createSubtitle')}</span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </DocumentLink>

          <DocumentLink className="action-card action-card-receive" href="/receive">
            <span className="action-index">02</span>
            <span className="action-gesture action-gesture-receive" aria-hidden="true">
              <span />
            </span>
            <span className="action-label">{t('receive')}</span>
            <span className="action-subtitle">{t('receiveSubtitle')}</span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </DocumentLink>
        </div>

        <DocumentLink className="how-shortcut" href="/how-it-works">
          <span className="shortcut-symbol" aria-hidden="true">?</span>
          <span>
            <strong>{t('howItWorks')}</strong>
            <small>{t('howSubtitle')}</small>
          </span>
          <span className="shortcut-arrow" aria-hidden="true">→</span>
        </DocumentLink>

        <footer className="landing-footer">
          <p>{t('privacyLine')}</p>
          <div className="footer-links">
            <DocumentLink href="/memories">{t('yourDevice')}</DocumentLink>
            <p className="footer-note">{t('privacyTail')}</p>
          </div>
        </footer>
      </section>
    </main>
  );
}
