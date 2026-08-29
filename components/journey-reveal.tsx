'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { useLanguage } from './language-provider';
import { SiteHeader } from './site-header';

export type PublicJourney = {
  publicSlug: string;
  status: string;
  targetRedraws: number;
  redrawCount: number;
  participantCount: number;
  createdAt: number;
  completedAt: number | null;
  countryCount: number;
  drawings: Array<{
    id: string;
    stepIndex: number;
    countryCode: string;
    createdAt: number;
    width: number;
    height: number;
    imageUrl: string;
  }>;
};

function durationLabel(start: number, end: number | null) {
  const milliseconds = Math.max(0, (end ?? Date.now()) - start);
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function JourneyReveal({ publicSlug }: { publicSlug: string }) {
  const { t } = useLanguage();
  const [journey, setJourney] = useState<PublicJourney | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PublicJourney>(`/api/public/journeys/${encodeURIComponent(publicSlug)}`)
      .then(setJourney)
      .catch((caught) => setError(caught instanceof Error ? caught.message : t('invalidLink')));
  }, [publicSlug, t]);

  useEffect(() => {
    if (!playing || !journey || journey.drawings.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % journey.drawings.length);
    }, 1_450);
    return () => window.clearInterval(timer);
  }, [journey, playing]);

  const current = journey?.drawings[activeIndex];
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const stats = useMemo(
    () =>
      journey
        ? [
            { value: journey.participantCount, label: t('participants') },
            { value: journey.countryCount || '—', label: t('countries') },
            { value: durationLabel(journey.createdAt, journey.completedAt), label: t('journeyTime') },
          ]
        : [],
    [journey, t],
  );

  const share = async () => {
    if (navigator.share) {
      await navigator.share({ title: 'Drawmory', text: t('seeWorldRemembered'), url: shareUrl });
    } else {
      await navigator.clipboard.writeText(shareUrl);
    }
  };

  if (!journey && !error) {
    return <main className="app-shell"><SiteHeader compact /><div className="loading-orbit" /></main>;
  }

  if (error || !journey) {
    return (
      <main className="app-shell"><SiteHeader compact /><section className="center-card">
        <span className="result-icon">?</span><h1>{error ?? t('invalidLink')}</h1>
        <Link className="primary-button" href="/">{t('backHome')}</Link>
      </section></main>
    );
  }

  if (journey.status !== 'COMPLETED') {
    return (
      <main className="app-shell">
        <SiteHeader compact />
        <section className="center-card progress-card">
          <span className="world-orbit" aria-hidden="true"><span /></span>
          <p className="flow-kicker">Journey in progress</p>
          <h1>{t('waiting')}</h1>
          <p>{t('progress', { current: journey.redrawCount, target: journey.targetRedraws })}</p>
          <div className="journey-progress">
            {Array.from({ length: journey.targetRedraws + 1 }, (_, index) => (
              <span key={index} className={index <= journey.redrawCount ? 'complete' : ''} />
            ))}
          </div>
          <Link className="secondary-button" href="/">{t('backHome')}</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="reveal-page">
      <SiteHeader compact />
      <section className="reveal-shell">
        <div className="reveal-heading">
          <p className="eyebrow">Journey complete</p>
          <h1>{t('seeWorldRemembered')}</h1>
        </div>

        <div className="flipbook-stage">
          <div className="flipbook-image">
            {current ? (
              <img
                key={current.id}
                src={current.imageUrl}
                alt={current.stepIndex === 0 ? t('original') : t('redraw', { step: current.stepIndex })}
              />
            ) : null}
            <span className="frame-label">
              {current?.stepIndex === 0 ? t('original') : t('redraw', { step: current?.stepIndex ?? 0 })}
            </span>
            <span className="country-label">{current?.countryCode ?? 'UNKNOWN'}</span>
          </div>
          <div className="flipbook-controls">
            <button
              className="secondary-button icon-button"
              type="button"
              aria-label="Previous drawing"
              onClick={() => setActiveIndex((currentIndex) => Math.max(0, currentIndex - 1))}
            >
              ←
            </button>
            <button className="secondary-button" type="button" onClick={() => setPlaying((currentPlaying) => !currentPlaying)}>
              {playing ? t('pause') : t('play')}
            </button>
            <button
              className="secondary-button icon-button"
              type="button"
              aria-label="Next drawing"
              onClick={() => setActiveIndex((currentIndex) => Math.min(journey.drawings.length - 1, currentIndex + 1))}
            >
              →
            </button>
            <button className="secondary-button" type="button" onClick={() => { setActiveIndex(0); setPlaying(true); }}>
              {t('replay')}
            </button>
          </div>
        </div>

        <div className="reveal-stats">
          {stats.map((stat) => (
            <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>
          ))}
        </div>

        <div className="timeline-strip" aria-label="Journey drawings">
          {journey.drawings.map((drawing, index) => (
            <button
              key={drawing.id}
              type="button"
              className={index === activeIndex ? 'active' : ''}
              onClick={() => { setActiveIndex(index); setPlaying(false); }}
              aria-label={drawing.stepIndex === 0 ? t('original') : t('redraw', { step: drawing.stepIndex })}
            >
              <img src={drawing.imageUrl} alt="" />
              <span>{drawing.stepIndex === 0 ? '0' : drawing.stepIndex}</span>
            </button>
          ))}
        </div>

        <div className="reveal-actions">
          <button className="primary-button" type="button" onClick={share}>{t('shareReveal')}</button>
          <Link className="secondary-button" href="/create">{t('createSubtitle')}</Link>
        </div>
      </section>
    </main>
  );
}
