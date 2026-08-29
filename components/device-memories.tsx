'use client';

import { useEffect, useState } from 'react';
import { getSavedReceipts, SavedReceipt } from '@/lib/client/receipts';
import { DocumentLink } from './document-link';
import { useLanguage } from './language-provider';
import { SiteHeader } from './site-header';

export function DeviceMemories() {
  const { t } = useLanguage();
  const [receipts, setReceipts] = useState<SavedReceipt[] | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setReceipts(getSavedReceipts()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <main className="app-shell">
      <SiteHeader compact />
      <section className="flow-shell memories-shell">
        <div className="flow-heading">
          <span className="flow-kicker">Local memories</span>
          <h1>{t('yourDevice')}</h1>
          <p>{t('privacyLine')}</p>
        </div>
        {receipts?.length ? (
          <div className="memory-list">
            {receipts.map((receipt, index) => (
              <DocumentLink key={receipt.token} href={`/receipt/${encodeURIComponent(receipt.token)}`}>
                <span className="memory-number">#{String(receipts.length - index).padStart(2, '0')}</span>
                <strong>Drawmory</strong>
                <small>{new Date(receipt.savedAt).toLocaleDateString()}</small>
                <i aria-hidden="true">→</i>
              </DocumentLink>
            ))}
          </div>
        ) : receipts ? (
          <div className="empty-state"><strong>{t('noSaved')}</strong></div>
        ) : (
          <div className="loading-orbit" />
        )}
        <DocumentLink className="primary-button" href="/create">{t('createSubtitle')}</DocumentLink>
      </section>
    </main>
  );
}
