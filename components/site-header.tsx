'use client';

import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { useLanguage } from './language-provider';

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { t, toggleLanguage } = useLanguage();
  return (
    <header className={`site-header${compact ? ' site-header-compact' : ''}`}>
      <Link className="brand-lockup" href="/" aria-label="Drawmory home">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        <span>{BRAND.name}</span>
      </Link>
      <nav className="header-actions" aria-label="Utility navigation">
        <Link className="quiet-link" href="/how-it-works">
          {t('howItWorks')}
        </Link>
        <button className="language-pill" type="button" onClick={toggleLanguage}>
          {t('language')}
        </button>
      </nav>
    </header>
  );
}
