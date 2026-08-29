'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { useLanguage } from './language-provider';
import { SiteHeader } from './site-header';

type ReceiptState = {
  journeyId: string;
  publicSlug: string;
  status: string;
  targetRedraws: number;
  redrawCount: number;
  contributionStep: number;
  canPass: boolean;
  completedAt: number | null;
};

export function ReceiptFlow({ token }: { token: string }) {
  const { t } = useLanguage();
  const [receipt, setReceipt] = useState<ReceiptState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      apiFetch<ReceiptState>(`/api/receipts/${encodeURIComponent(token)}`)
        .then((state) => {
          if (active) setReceipt(state);
        })
        .catch((caught) => {
          if (active) setError(caught instanceof Error ? caught.message : t('invalidLink'));
        });
    };
    load();
    const interval = window.setInterval(load, 8_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [t, token]);

  return (
    <main className="app-shell receipt-page">
      <SiteHeader compact />
      <section className="center-card receipt-card">
        {!receipt && !error ? <div className="loading-orbit" /> : null}
        {error ? (
          <>
            <span className="result-icon">?</span>
            <h1>{error}</h1>
            <Link className="primary-button" href="/">{t('backHome')}</Link>
          </>
        ) : null}
        {receipt ? (
          <>
            <span className="result-icon result-check">✓</span>
            <p className="flow-kicker">Memory receipt · #{receipt.contributionStep + 1}</p>
            <h1>{t('carried')}</h1>
            <p>{t('progress', { current: receipt.redrawCount, target: receipt.targetRedraws })}</p>
            <div className="journey-progress" aria-label={`${receipt.redrawCount} of ${receipt.targetRedraws}`}>
              {Array.from({ length: receipt.targetRedraws + 1 }, (_, index) => (
                <span key={index} className={index <= receipt.redrawCount ? 'complete' : ''}>
                  {index === receipt.contributionStep ? <i>You</i> : null}
                </span>
              ))}
            </div>
            {receipt.status === 'COMPLETED' ? (
              <Link className="primary-button wide-button" href={`/journey/${receipt.publicSlug}`}>
                {t('seeReveal')} →
              </Link>
            ) : receipt.canPass ? (
              <Link
                className="primary-button wide-button"
                href={`/pass/${receipt.journeyId}#receipt=${encodeURIComponent(token)}`}
              >
                {t('passTitle')} →
              </Link>
            ) : (
              <Link className="secondary-button" href={`/journey/${receipt.publicSlug}`}>
                View progress
              </Link>
            )}
            <small>{t('saveLink')}</small>
          </>
        ) : null}
      </section>
    </main>
  );
}
