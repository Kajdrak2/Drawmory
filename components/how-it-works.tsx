'use client';

import { useLanguage } from './language-provider';
import { DocumentLink } from './document-link';
import { SiteHeader } from './site-header';

export function HowItWorks() {
  const { t } = useLanguage();
  const steps = [t('stepCreate'), t('stepRemember'), t('stepRedraw'), t('stepPass')];
  return (
    <main className="app-shell how-page">
      <SiteHeader compact />
      <section className="how-shell">
        <div className="flow-heading minimal-heading">
          <h1>{t('howItWorks')}</h1>
        </div>
        <ol className="how-steps">
          {steps.map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
              <i aria-hidden="true">{index === 0 ? '✎' : index === 1 ? '◉' : index === 2 ? '∿' : '↗'}</i>
            </li>
          ))}
        </ol>
        <div className="reveal-actions">
          <DocumentLink className="primary-button" href="/create">{t('create')}</DocumentLink>
          <DocumentLink className="secondary-button" href="/receive">{t('receive')}</DocumentLink>
        </div>
      </section>
    </main>
  );
}
