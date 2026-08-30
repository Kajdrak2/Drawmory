'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { navigateTo } from '@/lib/client/document-navigation';
import { saveReceipt } from '@/lib/client/receipts';
import { DocumentLink } from './document-link';
import { DrawingCanvas, DrawingCanvasHandle } from './drawing-canvas';
import { useLanguage } from './language-provider';
import { SiteHeader } from './site-header';
import { LocationPicker } from './location-picker';
import type { DrawingLocationInput } from '@/lib/location';

type ClaimPhase =
  | 'ready'
  | 'observing'
  | 'drawing'
  | 'confirming'
  | 'location'
  | 'expired'
  | 'submitted';

type ClaimState = {
  claimId: string;
  journeyId: string;
  publicSlug: string;
  phase: ClaimPhase;
  redrawCount: number;
  targetRedraws: number;
  revealStartedAt: number | null;
  revealSeconds: number;
  redrawSeconds: number;
  confirmationSeconds: number;
  reservationExpiresAt: number;
  observationEndsAt: number | null;
  drawingExpiresAt: number | null;
  confirmationExpiresAt: number | null;
  imageUrl: string | null;
};

type SubmissionResult = {
  journeyId: string;
  publicSlug: string;
  receiptToken: string;
  completed: boolean;
  autoForwarded: boolean;
  redrawCount: number;
  targetRedraws: number;
};

function secondsLeft(deadline: number | null, now: number) {
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

function formatCountdown(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function currentPhase(claim: ClaimState | null, now: number): ClaimPhase | null {
  if (!claim) return null;
  if (claim.phase === 'location') {
    return now < claim.reservationExpiresAt ? 'location' : 'expired';
  }
  if (claim.phase === 'ready') return now < claim.reservationExpiresAt ? 'ready' : 'expired';
  if (['expired', 'submitted'].includes(claim.phase)) return claim.phase;
  if (claim.observationEndsAt && now < claim.observationEndsAt) return 'observing';
  if (claim.drawingExpiresAt && now < claim.drawingExpiresAt) return 'drawing';
  if (claim.confirmationExpiresAt && now < claim.confirmationExpiresAt) return 'confirming';
  return 'expired';
}

export function CarryFlow({ claimId }: { claimId: string }) {
  const { t } = useLanguage();
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const releaseSent = useRef(false);
  const [claim, setClaim] = useState<ClaimState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [location, setLocation] = useState<DrawingLocationInput>({});
  const effectivePhase = currentPhase(claim, now);

  const validateDrawing = useCallback(async () => {
    if (busy || !claim || !canvasRef.current) return;
    if (canvasRef.current.isEmpty()) {
      setError(t('emptyDrawingValidation'));
      return;
    }
    const imageDataUrl = canvasRef.current.exportImage();
    if (!imageDataUrl) {
      setError(t('emptyDrawingValidation'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const state = await apiFetch<ClaimState>(
        `/api/claims/${encodeURIComponent(claimId)}/validate`,
        { method: 'POST', body: JSON.stringify({ imageDataUrl }) },
      );
      setClaim(state);
      setNow(Date.now());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('validationFailed'));
    } finally {
      setBusy(false);
    }
  }, [busy, claim, claimId, t]);

  const finishLocation = useCallback(async (selectedLocation: DrawingLocationInput | null) => {
    if (busy || !claim) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<SubmissionResult>(
        `/api/claims/${encodeURIComponent(claimId)}/submit`,
        { method: 'POST', body: JSON.stringify({ location: selectedLocation }) },
      );
      saveReceipt({
        token: result.receiptToken,
        journeyId: result.journeyId,
        publicSlug: result.publicSlug,
        savedAt: Date.now(),
      });
      if (result.completed) {
        navigateTo(`/journey/${encodeURIComponent(result.publicSlug)}`);
      } else if (result.autoForwarded) {
        navigateTo(`/receipt/${encodeURIComponent(result.receiptToken)}`);
      } else {
        navigateTo(
          `/pass/${encodeURIComponent(result.journeyId)}#receipt=${encodeURIComponent(result.receiptToken)}`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('locationSaveFailed'));
      setBusy(false);
    }
  }, [busy, claim, claimId, t]);

  useEffect(() => {
    apiFetch<ClaimState>(`/api/claims/${encodeURIComponent(claimId)}`)
      .then((state) => {
        setClaim(state);
        setNow(Date.now());
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('invalidLink')));
  }, [claimId, t]);

  useEffect(() => {
    if (!effectivePhase || !['ready', 'observing', 'drawing', 'confirming', 'location'].includes(effectivePhase)) {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, [effectivePhase]);

  useEffect(() => {
    if (!claim || releaseSent.current || claim.phase === 'submitted') {
      return;
    }
    const releaseDeadline = claim.phase === 'location'
      ? claim.reservationExpiresAt
      : claim.confirmationExpiresAt;
    if (!releaseDeadline || now < releaseDeadline) return;
    releaseSent.current = true;
    void apiFetch(`/api/claims/${encodeURIComponent(claimId)}/abandon`, { method: 'POST' })
      .catch(() => undefined)
      .finally(() => {
        setClaim((current) => current ? { ...current, phase: 'expired' } : current);
      });
  }, [claim, claimId, now]);

  async function beginObservation() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const state = await apiFetch<ClaimState>(
        `/api/claims/${encodeURIComponent(claimId)}/reveal`,
        { method: 'POST' },
      );
      setClaim(state);
      setNow(Date.now());
      releaseSent.current = false;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('reservationExpired'));
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    if (!window.confirm(t('reportConfirm'))) return;
    setBusy(true);
    try {
      await apiFetch(`/api/claims/${encodeURIComponent(claimId)}/report`, { method: 'POST' });
      navigateTo('/receive');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('reportFailed'));
      setBusy(false);
    }
  }

  if (error && !claim) {
    return (
      <main className="app-shell">
        <SiteHeader compact />
        <section className="center-card">
          <span className="result-icon">!</span>
          <h1>{error}</h1>
          <DocumentLink className="primary-button" href="/receive">{t('receive')}</DocumentLink>
        </section>
      </main>
    );
  }

  if (!claim) {
    return <main className="app-shell"><SiteHeader compact /><div className="loading-orbit" /></main>;
  }

  if (effectivePhase === 'expired') {
    return (
      <main className="app-shell">
        <SiteHeader compact />
        <section className="center-card" data-testid="claim-expired">
          <span className="result-icon">⌛</span>
          <h1>{t('stepReleased')}</h1>
          <p>{t('stepReleasedBody')}</p>
          <DocumentLink className="primary-button" href="/receive">{t('tryAgain')}</DocumentLink>
        </section>
      </main>
    );
  }

  if (effectivePhase === 'submitted') {
    return (
      <main className="app-shell">
        <SiteHeader compact />
        <section className="center-card">
          <span className="result-icon">✓</span>
          <h1>{t('carried')}</h1>
          <DocumentLink className="primary-button" href={`/journey/${encodeURIComponent(claim.publicSlug)}`}>
            {t('openJourney')}
          </DocumentLink>
        </section>
      </main>
    );
  }

  if (effectivePhase === 'ready') {
    return (
      <main className="app-shell observation-shell">
        <SiteHeader compact />
        <section className="ready-card">
          <div className="memory-eye" aria-hidden="true"><span /></div>
          <h1>{t('seeOnce', { seconds: claim.revealSeconds })}</h1>
          <button className="primary-button wide-button" type="button" onClick={beginObservation} disabled={busy} data-testid="start-reveal">
            {busy ? '…' : t('ready')}
          </button>
          <small>{secondsLeft(claim.reservationExpiresAt, now)}s {t('reservationLeft').toLowerCase()}</small>
        </section>
      </main>
    );
  }

  if (effectivePhase === 'observing') {
    return (
      <main className="observe-stage">
        <div className="observe-topline">
          <span>{t('remember')}</span>
          <strong>{secondsLeft(claim.observationEndsAt, now)}</strong>
        </div>
        <div className="observed-image-frame">
          {claim.imageUrl ? <img src={claim.imageUrl} alt="Drawing to remember" draggable={false} /> : null}
        </div>
      </main>
    );
  }

  if (effectivePhase === 'location') {
    return (
      <main className="app-shell location-stage-shell">
        <SiteHeader compact />
        <section className="flow-shell location-stage" data-testid="location-step">
          <LocationPicker
            value={location}
            onChange={setLocation}
            inheritsPrevious
            cityRequiresCountry
          />
          <div className="location-stage-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => finishLocation(null)}
              disabled={busy}
              data-testid="skip-location"
            >
              {t('skipLocation')}
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => finishLocation(location)}
              disabled={busy}
              data-testid="save-location"
            >
              {busy ? t('submitting') : t('saveLocation')} <span aria-hidden="true">→</span>
            </button>
          </div>
          {error ? <p className="error-banner" role="alert">{error}</p> : null}
        </section>
      </main>
    );
  }

  const confirming = effectivePhase === 'confirming';
  const timerDeadline = confirming ? claim.confirmationExpiresAt : claim.drawingExpiresAt;
  const timerSeconds = secondsLeft(timerDeadline, now);

  return (
    <main className="app-shell">
      <SiteHeader compact />
      <section className="flow-shell draw-memory-shell">
        <div className="drawing-heading-row">
          <div className="flow-heading">
            <span className="flow-kicker">
              {claim.redrawCount + 1}/{claim.targetRedraws < 0 ? '∞' : claim.targetRedraws}
            </span>
            <h1>{t('redraw', { step: claim.redrawCount + 1 })}</h1>
          </div>
          <div className={`timer-chip${confirming ? ' timer-chip-warning' : ''}`} aria-live="polite">
            <span>{confirming ? t('confirmationLeft') : t('timeLeft')}</span>
            <strong>{formatCountdown(timerSeconds)}</strong>
          </div>
        </div>

        <DrawingCanvas ref={canvasRef} compact disabled={busy || confirming} />
        <div className="flow-actions carry-actions">
          <button className="report-button" type="button" onClick={report} disabled={busy}>{t('reportSkip')}</button>
          <button className="primary-button" type="button" onClick={validateDrawing} disabled={busy} data-testid="submit-redraw">
            {busy ? t('validatingDrawing') : t('validateDrawing')} <span aria-hidden="true">→</span>
          </button>
        </div>
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
      </section>

      {confirming ? (
        <div className="confirmation-overlay" role="dialog" aria-modal="true" aria-labelledby="confirmation-title" data-testid="validation-timeout">
          <section className="confirmation-card">
            <span className="confirmation-clock" aria-hidden="true">10:00</span>
            <p className="flow-kicker">{t('drawingTimeEnded')}</p>
            <h2 id="confirmation-title">{t('confirmationTitle')}</h2>
            <p>{t('confirmationBody', { seconds: claim.confirmationSeconds })}</p>
            <strong className="confirmation-countdown">{formatCountdown(timerSeconds)}</strong>
            <button className="primary-button wide-button" type="button" onClick={validateDrawing} disabled={busy} data-testid="confirm-redraw">
              {busy ? t('validatingDrawing') : t('confirmDrawing')}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
