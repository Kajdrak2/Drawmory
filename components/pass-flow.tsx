'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { apiFetch } from '@/lib/client/api';
import { DocumentLink } from './document-link';
import { useLanguage } from './language-provider';
import { SiteHeader } from './site-header';

type HandoffResult = {
  mode: 'PRIVATE' | 'WORLD';
  publicSlug: string;
  handoffToken?: string;
  code?: string;
};

export function PassFlow({ journeyId }: { journeyId: string }) {
  const { t } = useLanguage();
  const [receiptToken, setReceiptToken] = useState<string | null>(null);
  const [result, setResult] = useState<HandoffResult | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<'PRIVATE' | 'WORLD' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const parameters = new URLSearchParams(window.location.hash.slice(1));
      setReceiptToken(parameters.get('receipt'));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handoffUrl =
    result?.handoffToken && typeof window !== 'undefined'
      ? `${window.location.origin}/r/${result.handoffToken}`
      : null;

  useEffect(() => {
    if (!handoffUrl) return;
    QRCode.toDataURL(handoffUrl, {
      width: 360,
      margin: 1,
      color: { dark: '#1d1830', light: '#fffdf8' },
    }).then(setQrCode, () => setQrCode(null));
  }, [handoffUrl]);

  const choose = async (mode: 'PRIVATE' | 'WORLD') => {
    if (!receiptToken || busy) return;
    setBusy(mode);
    setError(null);
    try {
      const response = await apiFetch<HandoffResult>(
        `/api/journeys/${encodeURIComponent(journeyId)}/handoff`,
        {
          method: 'POST',
          body: JSON.stringify({ receiptToken, mode }),
        },
      );
      setResult(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The handoff could not be created.');
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    if (!handoffUrl) return;
    await navigator.clipboard.writeText(handoffUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    if (!handoffUrl) return;
    if (navigator.share) {
      await navigator.share({ title: 'Drawmory', text: t('waitingForYou'), url: handoffUrl });
    } else {
      await copy();
    }
  };

  if (receiptToken === null) {
    return (
      <main className="app-shell">
        <SiteHeader compact />
        <section className="center-card"><div className="loading-orbit" aria-label={t('galleryLoading')} /></section>
      </main>
    );
  }

  if (!receiptToken) {
    return (
      <main className="app-shell">
        <SiteHeader compact />
        <section className="center-card">
          <span className="result-icon">?</span>
          <h1>{t('invalidLink')}</h1>
          <DocumentLink className="primary-button" href="/">{t('backHome')}</DocumentLink>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <SiteHeader compact />
      <section className="flow-shell pass-shell">
        <div className="flow-heading">
          <span className="flow-kicker">{t('passTitle')} · 03</span>
          <h1>{result ? t('waiting') : t('passTitle')}</h1>
          <p>{result ? t('saveLink') : t('privacyTail')}</p>
        </div>

        {!result ? (
          <div className="handoff-options">
            <button
              className="handoff-card private-handoff"
              type="button"
              onClick={() => choose('PRIVATE')}
              disabled={Boolean(busy)}
              data-testid="private-handoff"
            >
              <span className="handoff-symbol" aria-hidden="true">↗</span>
              <strong>{busy === 'PRIVATE' ? '…' : t('passSomeone')}</strong>
              <small>{t('passSomeoneHint')}</small>
            </button>
            <button
              className="handoff-card world-handoff"
              type="button"
              onClick={() => choose('WORLD')}
              disabled={Boolean(busy)}
              data-testid="world-handoff"
            >
              <span className="handoff-symbol world-symbol" aria-hidden="true">◎</span>
              <strong>{busy === 'WORLD' ? '…' : t('world')}</strong>
              <small>{t('worldHint')}</small>
            </button>
          </div>
        ) : result.mode === 'PRIVATE' && handoffUrl ? (
          <div className="share-panel">
            {qrCode ? <img className="qr-code" src={qrCode} alt="Drawmory handoff QR code" /> : null}
            <div className="share-details">
              <p className="manual-code-label">{t('enterCode')}</p>
              <strong className="manual-code" data-testid="manual-code">{result.code}</strong>
              <p className="secret-link">{handoffUrl}</p>
              <div className="button-row">
                <button className="primary-button" type="button" onClick={copy}>
                  {copied ? t('copied') : t('copyLink')}
                </button>
                <button className="secondary-button" type="button" onClick={share}>
                  {t('share')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="world-waiting-card">
            <span className="world-orbit" aria-hidden="true"><span /></span>
            <strong>{t('waiting')}</strong>
            <p>{t('worldHint')}</p>
            <small>{t('worldLocked')}</small>
          </div>
        )}

        {result ? (
          <div className="receipt-strip">
            <span>{t('saveLink')}</span>
            <DocumentLink href={`/receipt/${encodeURIComponent(receiptToken)}`}>{t('receipt')} →</DocumentLink>
          </div>
        ) : null}

        {error ? <p className="error-banner" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
