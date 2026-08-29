'use client';

import { BRAND } from '@/lib/brand';
import { DocumentLink } from './document-link';
import { useLanguage } from './language-provider';

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { t, toggleLanguage } = useLanguage();
  return (
    <header className={`site-header${compact ? ' site-header-compact' : ''}`}>
      <DocumentLink className="brand-lockup" href="/" aria-label="Drawmory home">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        <span>{BRAND.name}</span>
      </DocumentLink>
      <nav className="header-actions" aria-label="Utility navigation">
        <DocumentLink className="quiet-link" href="/how-it-works">
          {t('howItWorks')}
        </DocumentLink>
        <button className="language-pill" type="button" onClick={toggleLanguage}>
          {t('language')}
        </button>
      </nav>
    </header>
  );
}
