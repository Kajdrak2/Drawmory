'use client';

import { useRef, useState } from 'react';
import { DrawingCanvas, DrawingCanvasHandle } from './drawing-canvas';
import { SiteHeader } from './site-header';
import { useLanguage } from './language-provider';
import { apiFetch } from '@/lib/client/api';
import { navigateTo } from '@/lib/client/document-navigation';
import { saveReceipt } from '@/lib/client/receipts';

type CreateResult = {
  journeyId: string;
  publicSlug: string;
  receiptToken: string;
  targetRedraws: number;
};

export function CreateFlow() {
  const { t } = useLanguage();
  const canvasRef = useRef<DrawingCanvasHandle>(null);
  const [step, setStep] = useState<'draw' | 'length'>('draw');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [targetRedraws, setTargetRedraws] = useState<3 | 5>(3);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const continueFromDrawing = () => {
    const image = canvasRef.current?.exportImage();
    if (!image) {
      setError(t('emptyDrawing'));
      return;
    }
    setError(null);
    setImageDataUrl(image);
    setStep('length');
  };

  const create = async () => {
    if (!imageDataUrl || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<CreateResult>('/api/journeys', {
        method: 'POST',
        body: JSON.stringify({ imageDataUrl, targetRedraws }),
      });
      saveReceipt({
        token: result.receiptToken,
        journeyId: result.journeyId,
        publicSlug: result.publicSlug,
        savedAt: Date.now(),
      });
      navigateTo(
        `/pass/${encodeURIComponent(result.journeyId)}#receipt=${encodeURIComponent(result.receiptToken)}`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The Drawmory could not be created.');
      setBusy(false);
    }
  };

  return (
    <main className="app-shell">
      <SiteHeader compact />
      <section className="flow-shell">
        <div className="flow-heading">
          <span className="flow-kicker">Create · {step === 'draw' ? '01' : '02'}</span>
          <h1>{step === 'draw' ? t('drawFirst') : t('chooseLength')}</h1>
          <p>{step === 'draw' ? t('keepSimple') : t('privacyLine')}</p>
        </div>

        {step === 'draw' ? (
          <>
            <DrawingCanvas ref={canvasRef} onDrawingChange={setHasDrawing} />
            <div className="flow-actions">
              <button
                className="primary-button"
                type="button"
                onClick={continueFromDrawing}
                disabled={!hasDrawing}
              >
                {t('continue')} <span aria-hidden="true">→</span>
              </button>
            </div>
          </>
        ) : (
          <div className="length-panel">
            <div className="length-options" role="radiogroup" aria-label={t('chooseLength')}>
              <button
                className={`length-card${targetRedraws === 3 ? ' selected' : ''}`}
                type="button"
                role="radio"
                aria-checked={targetRedraws === 3}
                onClick={() => setTargetRedraws(3)}
              >
                <span className="length-number">3</span>
                <strong>{t('threeRedraws')}</strong>
                <small>{t('demo')}</small>
              </button>
              <button
                className={`length-card${targetRedraws === 5 ? ' selected' : ''}`}
                type="button"
                role="radio"
                aria-checked={targetRedraws === 5}
                onClick={() => setTargetRedraws(5)}
              >
                <span className="length-number">5</span>
                <strong>{t('fiveRedraws')}</strong>
                <small>{t('shortJourney')}</small>
              </button>
            </div>
            <div className="flow-actions split-actions">
              <button className="secondary-button" type="button" onClick={() => setStep('draw')}>
                ←
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={create}
                disabled={busy}
                data-testid="launch-journey"
              >
                {busy ? t('creatingJourney') : t('launchJourney')}
              </button>
            </div>
          </div>
        )}

        {error ? (
          <p className="error-banner" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
