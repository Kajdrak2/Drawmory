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

type ClaimState = {
  claimId: string;
  journeyId: string;
  publicSlug: string;
  phase: 'ready' | 'observing' | 'drawing' | 'expired' | 'submitted';
  redrawCount: number;
  targetRedraws: number;
  revealStartedAt: number | null;
  revealSeconds: number;
  redrawSeconds: number;
  reservationExpiresAt: number;
  imageUrl: string | null;
};

type SubmissionResult = {
  journeyId: string;
  publicSlug: string;
  receiptToken: string;
  completed: boolean;
  redrawCount: number;
  targetRedraws: number;
};

function secondsLeft(deadline: number | null, now: number) {
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

export function CarryFlow({ claimId }: { claimId: string }) {
  const { t } = useLanguage();
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const handledTimeout = useRef(false);
  const [claim, setClaim] = useState<ClaimState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [drawingDeadline, setDrawingDeadline] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyExpired, setEmptyExpired] = useState(false);
  const effectivePhase =
    claim?.phase === 'observing' &&
    claim.revealStartedAt &&
    claim.revealStartedAt + claim.revealSeconds * 1000 <= now
      ? 'drawing'
      : claim?.phase;

  const submitDrawing = useCallback(async () => {
    if (busy || !claim) return;
    const imageDataUrl = canvasRef.current?.exportImage();
    if (!imageDataUrl) {
      setEmptyExpired(true);
      handledTimeout.current = true;
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<SubmissionResult>(
        `/api/claims/${encodeURIComponent(claimId)}/submit`,
        { method: 'POST', body: JSON.stringify({ imageDataUrl }) },
      );
      saveReceipt({
        token: result.receiptToken,
        journeyId: result.journeyId,
        publicSlug: result.publicSlug,
        savedAt: Date.now(),
      });
      if (result.completed) {
        navigateTo(`/journey/${encodeURIComponent(result.publicSlug)}`);
      } else {
        navigateTo(
          `/pass/${encodeURIComponent(result.journeyId)}#receipt=${encodeURIComponent(result.receiptToken)}`,
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The drawing could not be submitted.');
      setBusy(false);
    }
  }, [busy, claim, claimId]);

  useEffect(() => {
    apiFetch<ClaimState>(`/api/claims/${encodeURIComponent(claimId)}`)
      .then((state) => {
        setClaim(state);
        if (state.phase === 'drawing' || (state.phase === 'observing' && state.revealStartedAt)) {
          const drawingStartsAt = state.revealStartedAt
            ? state.revealStartedAt + state.revealSeconds * 1000
            : Date.now();
          setDrawingDeadline(
            Math.min(drawingStartsAt + state.redrawSeconds * 1000, state.reservationExpiresAt),
          );
          handledTimeout.current = false;
        }
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('invalidLink')));
  }, [claimId, t]);

  useEffect(() => {
    if (!claim || !effectivePhase || !['ready', 'observing', 'drawing'].includes(effectivePhase)) return;
    const interval = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(interval);
  }, [claim, effectivePhase]);

  useEffect(() => {
    if (!claim || effectivePhase !== 'drawing' || !drawingDeadline || handledTimeout.current || busy) {
      return;
    }
    const timeout = window.setTimeout(() => {
      if (handledTimeout.current) return;
      handledTimeout.current = true;
      if (canvasRef.current?.isEmpty()) setEmptyExpired(true);
      else void submitDrawing();
    }, Math.max(0, drawingDeadline - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [busy, claim, drawingDeadline, effectivePhase, submitDrawing]);

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
      if (state.revealStartedAt) {
        setDrawingDeadline(
          Math.min(
            state.revealStartedAt + (state.revealSeconds + state.redrawSeconds) * 1000,
            state.reservationExpiresAt,
          ),
        );
        handledTimeout.current = false;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('reservationExpired'));
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    if (!window.confirm('Report this drawing and end its journey?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/claims/${encodeURIComponent(claimId)}/report`, { method: 'POST' });
      navigateTo('/receive');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The report could not be sent.');
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
        <section className="center-card">
          <span className="result-icon">⌛</span>
          <h1>{t('reservationExpired')}</h1>
          <DocumentLink className="primary-button" href="/receive">{t('tryAgain')}</DocumentLink>
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
          <span className="flow-kicker">Memory {claim.redrawCount + 1} → {claim.redrawCount + 2}</span>
          <h1>{t('seeOnce', { seconds: claim.revealSeconds })}</h1>
          <p>{t('remember')}</p>
          <button className="primary-button wide-button" type="button" onClick={beginObservation} disabled={busy} data-testid="start-reveal">
            {busy ? '…' : t('ready')}
          </button>
          <small>{secondsLeft(claim.reservationExpiresAt, now)}s {t('reservationLeft').toLowerCase()}</small>
        </section>
      </main>
    );
  }

  if (effectivePhase === 'observing' && claim.revealStartedAt) {
    const deadline = claim.revealStartedAt + claim.revealSeconds * 1000;
    return (
      <main className="observe-stage">
        <div className="observe-topline">
          <span>{t('remember')}</span>
          <strong>{secondsLeft(deadline, now)}</strong>
        </div>
        <div className="observed-image-frame">
          {claim.imageUrl ? <img src={claim.imageUrl} alt="Drawing to remember" draggable={false} /> : null}
        </div>
        <p className="observe-instruction">{t('seeOnce', { seconds: claim.revealSeconds })}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <SiteHeader compact />
      <section className="flow-shell draw-memory-shell">
        <div className="drawing-heading-row">
          <div className="flow-heading">
            <span className="flow-kicker">Redraw · {claim.redrawCount + 1}/{claim.targetRedraws}</span>
            <h1>{t('drawMemory')}</h1>
            <p>{t('redrawHint')}</p>
          </div>
          <div className="timer-chip" aria-live="polite">
            <span>{t('timeLeft')}</span>
            <strong>{secondsLeft(drawingDeadline, now)}s</strong>
          </div>
        </div>

        <DrawingCanvas ref={canvasRef} compact disabled={busy} />
        <div className="flow-actions carry-actions">
          <button className="report-button" type="button" onClick={report} disabled={busy}>{t('reportSkip')}</button>
          <button className="primary-button" type="button" onClick={submitDrawing} disabled={busy} data-testid="submit-redraw">
            {busy ? t('submitting') : t('submit')} <span aria-hidden="true">→</span>
          </button>
        </div>

        {emptyExpired ? (
          <div className="empty-confirmation" role="alert">
            <strong>{t('emptyAtEnd')}</strong>
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                const nextDeadline = Math.min(Date.now() + 15_000, claim.reservationExpiresAt);
                setDrawingDeadline(nextDeadline);
                setEmptyExpired(false);
                handledTimeout.current = false;
              }}
            >
              {t('moreTime')}
            </button>
          </div>
        ) : null}
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
