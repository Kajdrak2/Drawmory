'use client';

import { useLanguage } from './language-provider';
import { useContentPreferences } from './content-preferences';
import { NsfwPlaceholder } from './nsfw-controls';

export type HandoffPreview = {
  publicSlug: string;
  redrawCount: number;
  targetRedraws: number;
  expiresAt?: number | null;
  mode?: 'PRIVATE' | 'WORLD';
  isNsfw: boolean;
};

export function OfferPanel({
  preview,
  busy,
  onCarry,
}: {
  preview: HandoffPreview;
  busy: boolean;
  onCarry: () => void;
}) {
  const { t } = useLanguage();
  const { showNsfw, preferencesReady } = useContentPreferences();
  const blocked = preview.isNsfw && !showNsfw;
  return (
    <section className="offer-panel" aria-live="polite">
      <span className="offer-eye" aria-hidden="true"><span /></span>
      <h2>Drawmory #{preview.redrawCount + 2}</h2>
      {blocked ? <NsfwPlaceholder /> : null}
      {preview.targetRedraws < 0 ? (
        <div className="infinite-progress" aria-label={t('openProgress', { count: preview.redrawCount + 1 })}>
          <strong>{preview.redrawCount + 1}</strong><span>→</span><b>∞</b>
        </div>
      ) : (
        <div className="progress-dots" aria-label={`${preview.redrawCount} of ${preview.targetRedraws}`}>
          {Array.from({ length: preview.targetRedraws + 1 }, (_, index) => (
            <span key={index} className={index <= preview.redrawCount ? 'complete' : ''} />
          ))}
        </div>
      )}
      <button className="primary-button wide-button" type="button" onClick={onCarry} disabled={busy || blocked || !preferencesReady} data-testid="carry-it">
        {busy ? t('claiming') : t('carryIt')} <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
