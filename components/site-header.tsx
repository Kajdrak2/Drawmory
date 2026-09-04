'use client';

import { BRAND } from '@/lib/brand';
import { DocumentLink } from './document-link';
import { useLanguage } from './language-provider';
import { languageOptions, type Language } from '@/lib/i18n';
import { useContentPreferences } from './content-preferences';

export function SiteHeader({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useLanguage();
  const { showNsfw, preferencesReady, setShowNsfw } = useContentPreferences();
  return (
    <header className={`site-header${compact ? ' site-header-compact' : ''}`}>
      <DocumentLink className="brand-lockup" href="/" aria-label={`${BRAND.name} — ${t('backHome')}`}>
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        <span>{BRAND.name}</span>
      </DocumentLink>
      <nav className="header-actions">
        <DocumentLink className="quiet-link" href="/how-it-works">
          {t('howItWorks')}
        </DocumentLink>
        <label className="nsfw-toggle" title={t('showNsfw')}>
          <input
            type="checkbox"
            checked={showNsfw}
            disabled={!preferencesReady}
            onChange={(event) => setShowNsfw(event.target.checked)}
            data-testid="show-nsfw-toggle"
          />
          <span aria-hidden="true"><i /></span>
          <strong>NSFW</strong>
          <b className="sr-only">{t('showNsfw')}</b>
        </label>
        <label className="language-picker">
          <span className="sr-only">{t('selectLanguage')}</span>
          <select
            className="language-select"
            value={language}
            aria-label={t('selectLanguage')}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            {languageOptions.map((option) => (
              <option key={option.code} value={option.code}>{option.label}</option>
            ))}
          </select>
        </label>
      </nav>
    </header>
  );
}
