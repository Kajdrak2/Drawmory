'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { useLanguage } from './language-provider';
import { HandoffPreview, OfferPanel } from './offer-panel';
import { SiteHeader } from './site-header';

type WorldOffer = {
  token: string;
  expiresAt: number;
  journey: Omit<HandoffPreview, 'mode' | 'expiresAt'>;
};

type ClaimResult = { claimId: string };

export function ReceiveFlow() {
  const { t } = useLanguage();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState<{ token?: string; code?: string } | null>(null);
  const [preview, setPreview] = useState<HandoffPreview | null>(null);
  const [busy, setBusy] = useState<'code' | 'world' | 'claim' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [worldEmpty, setWorldEmpty] = useState(false);

  const checkCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy('code');
    setError(null);
    setWorldEmpty(false);
    try {
      const next = await apiFetch<HandoffPreview>(
        `/api/handoffs/preview?code=${encodeURIComponent(code)}`,
      );
      setSecret({ code });
      setPreview(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('invalidLink'));
    } finally {
      setBusy(null);
    }
  };

  const receiveWorld = async () => {
    if (busy) return;
    setBusy('world');
    setError(null);
    setWorldEmpty(false);
    try {
      const offer = await apiFetch<WorldOffer>('/api/world/offer', { method: 'POST' });
      setSecret({ token: offer.token });
      setPreview({ ...offer.journey, expiresAt: offer.expiresAt, mode: 'WORLD' });
    } catch (caught) {
      const errorWithCode = caught as Error & { code?: string };
      if (errorWithCode.code === 'WORLD_QUEUE_EMPTY') setWorldEmpty(true);
      else setError(caught instanceof Error ? caught.message : t('worldQuiet'));
    } finally {
      setBusy(null);
    }
  };

  const claim = async () => {
    if (!secret || busy) return;
    setBusy('claim');
    setError(null);
    try {
      const result = await apiFetch<ClaimResult>('/api/handoffs/claim', {
        method: 'POST',
        body: JSON.stringify(secret),
      });
      router.push(`/carry/${encodeURIComponent(result.claimId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('invalidLink'));
      setPreview(null);
      setSecret(null);
      setBusy(null);
    }
  };

  return (
    <main className="app-shell">
      <SiteHeader compact />
      <section className="flow-shell receive-shell">
        <div className="flow-heading">
          <span className="flow-kicker">Receive</span>
          <h1>{t('receiveSubtitle')}</h1>
          <p>{t('privacyLine')}</p>
        </div>

        {preview ? (
          <OfferPanel preview={preview} busy={busy === 'claim'} onCarry={claim} />
        ) : (
          <div className="receive-options">
            <form className="receive-card code-card" onSubmit={checkCode}>
              <span className="receive-index">01</span>
              <h2>{t('enterCode')}</h2>
              <label className="sr-only" htmlFor="handoff-code">{t('enterCode')}</label>
              <input
                id="handoff-code"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder={t('codePlaceholder')}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={16}
                data-testid="handoff-code"
              />
              <button className="secondary-button dark-button" type="submit" disabled={busy === 'code'}>
                {busy === 'code' ? '…' : t('checkCode')}
              </button>
            </form>

            <section className="receive-card world-card">
              <span className="receive-index">02</span>
              <span className="world-orbit small-orbit" aria-hidden="true"><span /></span>
              <h2>{t('receiveWorld')}</h2>
              <p>{t('worldHint')}</p>
              <button className="primary-button" type="button" onClick={receiveWorld} disabled={busy === 'world'}>
                {busy === 'world' ? '…' : t('receiveWorld')}
              </button>
            </section>
          </div>
        )}

        {worldEmpty ? (
          <div className="empty-state" role="status">
            <strong>{t('worldQuiet')}</strong>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={receiveWorld}>{t('tryAgain')}</button>
              <Link className="quiet-link" href="/create">{t('createSubtitle')}</Link>
            </div>
          </div>
        ) : null}
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
