'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { navigateTo } from '@/lib/client/document-navigation';
import { DocumentLink } from './document-link';
import { useLanguage } from './language-provider';
import { HandoffPreview, OfferPanel } from './offer-panel';
import { SiteHeader } from './site-header';

export function HandoffFlow({ token }: { token: string }) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState<HandoffPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HandoffPreview>(`/api/handoffs/preview?token=${encodeURIComponent(token)}`)
      .then(setPreview)
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('invalidLink')))
      .finally(() => setLoading(false));
  }, [t, token]);

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ claimId: string }>('/api/handoffs/claim', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      navigateTo(`/carry/${encodeURIComponent(result.claimId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('invalidLink'));
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <SiteHeader compact />
      <section className="flow-shell narrow-shell">
        {loading ? <div className="loading-orbit" aria-label="Loading" /> : null}
        {preview ? <OfferPanel preview={preview} busy={busy} onCarry={claim} /> : null}
        {error ? (
          <section className="center-card">
            <span className="result-icon">!</span>
            <h1>{error}</h1>
            <DocumentLink className="primary-button" href="/receive">{t('receive')}</DocumentLink>
          </section>
        ) : null}
      </section>
    </main>
  );
}
