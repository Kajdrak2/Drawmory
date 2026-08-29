'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { getOrCreateVoterToken, readVotedJourneys, rememberVote } from '@/lib/client/voting';
import { DocumentLink } from './document-link';
import { JourneyMap } from './journey-map';
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
  voteCount: number;
  drawings: Array<{
    id: string;
    stepIndex: number;
    countryCode: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    locationPrecision: 'NONE' | 'COUNTRY' | 'PRECISE';
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
  const [view, setView] = useState<'book' | 'mural'>('book');
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      apiFetch<PublicJourney>(`/api/public/journeys/${encodeURIComponent(publicSlug)}`)
        .then((result) => {
          if (!active) return;
          setJourney(result);
          setActiveIndex((current) => Math.min(current, Math.max(0, result.drawings.length - 1)));
        })
        .catch((caught) => {
          if (active) setError(caught instanceof Error ? caught.message : t('invalidLink'));
        });
    };
    load();
    const interval = window.setInterval(load, 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [publicSlug, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => setVoted(readVotedJourneys().has(publicSlug)), 0);
    return () => window.clearTimeout(timer);
  }, [publicSlug]);

  useEffect(() => {
    if (!playing || view !== 'book' || !journey || journey.drawings.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % journey.drawings.length);
    }, 1_700);
    return () => window.clearInterval(timer);
  }, [journey, playing, view]);

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

  const vote = async () => {
    if (!journey || voted || voting) return;
    setVoting(true);
    try {
      const result = await apiFetch<{ voteCount: number }>(
        `/api/public/journeys/${encodeURIComponent(publicSlug)}/votes`,
        { method: 'POST', body: JSON.stringify({ voterToken: getOrCreateVoterToken() }) },
      );
      setJourney((currentJourney) => currentJourney ? { ...currentJourney, voteCount: result.voteCount } : currentJourney);
      rememberVote(publicSlug);
      setVoted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The vote could not be saved.');
    } finally {
      setVoting(false);
    }
  };

  if (!journey && !error) {
    return <main className="app-shell"><SiteHeader compact /><div className="loading-orbit" /></main>;
  }

  if (error && !journey) {
    return (
      <main className="app-shell"><SiteHeader compact /><section className="center-card">
        <span className="result-icon">?</span><h1>{error}</h1>
        <DocumentLink className="primary-button" href="/">{t('backHome')}</DocumentLink>
      </section></main>
    );
  }

  if (!journey) return null;
  const completed = journey.status === 'COMPLETED';
  const locationLabel = current
    ? [current.city, current.countryCode === 'UNKNOWN' ? null : current.countryCode].filter(Boolean).join(', ')
    : '';

  return (
    <main className="reveal-page">
      <SiteHeader compact />
      <section className="reveal-shell">
        <div className="reveal-heading reveal-heading-row">
          <div>
            <p className="eyebrow">{completed ? t('completeJourney') : t('ongoingJourney')}</p>
            <h1>{t('seeWorldRemembered')}</h1>
          </div>
          <div className={`journey-state-badge${completed ? ' complete' : ''}`}>
            <strong>{journey.participantCount}</strong>
            <span>{journey.targetRedraws < 0 ? t('openLoop') : `${journey.participantCount}/${journey.targetRedraws + 1}`}</span>
          </div>
        </div>

        <div className="reveal-view-switch" role="group" aria-label="View">
          <button type="button" className={view === 'book' ? 'active' : ''} aria-pressed={view === 'book'} onClick={() => setView('book')}>
            {t('bookView')}
          </button>
          <button type="button" className={view === 'mural' ? 'active' : ''} aria-pressed={view === 'mural'} onClick={() => { setView('mural'); setPlaying(false); }}>
            {t('muralView')}
          </button>
        </div>

        {view === 'book' ? (
          <div className="flipbook-stage">
            <div className="flipbook-image">
              {current ? (
                <img key={current.id} src={current.imageUrl} alt={current.stepIndex === 0 ? t('original') : t('redraw', { step: current.stepIndex })} />
              ) : null}
              <span className="frame-label">{current?.stepIndex === 0 ? t('original') : t('redraw', { step: current?.stepIndex ?? 0 })}</span>
              <span className="country-label">{locationLabel || t('notSpecified')}</span>
            </div>
            <div className="flipbook-controls">
              <button className="secondary-button icon-button" type="button" aria-label={t('previousDrawing')} onClick={() => { setActiveIndex((index) => (index - 1 + journey.drawings.length) % journey.drawings.length); setPlaying(false); }} disabled={journey.drawings.length < 2}>←</button>
              <button className="secondary-button" type="button" onClick={() => setPlaying((value) => !value)} disabled={journey.drawings.length < 2}>{playing ? t('pause') : t('play')}</button>
              <button className="secondary-button icon-button" type="button" aria-label={t('nextDrawing')} onClick={() => { setActiveIndex((index) => (index + 1) % journey.drawings.length); setPlaying(false); }} disabled={journey.drawings.length < 2}>→</button>
              <button className="secondary-button" type="button" onClick={() => { setActiveIndex(0); setPlaying(true); }}>{t('replay')}</button>
            </div>
          </div>
        ) : (
          <div className="mural-grid" aria-label={t('muralView')}>
            {journey.drawings.map((drawing) => (
              <figure key={drawing.id}>
                <img src={drawing.imageUrl} alt={drawing.stepIndex === 0 ? t('original') : t('redraw', { step: drawing.stepIndex })} />
                <figcaption>{drawing.stepIndex === 0 ? t('original') : t('redraw', { step: drawing.stepIndex })}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="reveal-stats">
          {stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
        </div>

        <div className="timeline-strip" aria-label="Journey drawings">
          {journey.drawings.map((drawing, index) => (
            <button key={drawing.id} type="button" className={index === activeIndex ? 'active' : ''} onClick={() => { setActiveIndex(index); setPlaying(false); setView('book'); }} aria-label={drawing.stepIndex === 0 ? t('original') : t('redraw', { step: drawing.stepIndex })}>
              <img src={drawing.imageUrl} alt="" /><span>{drawing.stepIndex}</span>
            </button>
          ))}
        </div>

        <section className="journey-map-section">
          <div className="map-heading"><p className="section-kicker">Route</p><h2>{t('journeyMap')}</h2></div>
          <JourneyMap drawings={journey.drawings} />
        </section>

        <div className="reveal-actions">
          <button className={`vote-button reveal-vote${voted ? ' voted' : ''}`} type="button" onClick={vote} disabled={voted || voting} data-testid="vote-public">
            <span aria-hidden="true">♥</span> {voted ? t('voted') : t('vote')} · {journey.voteCount}
          </button>
          <button className="primary-button" type="button" onClick={share}>{t('shareReveal')}</button>
          <DocumentLink className="secondary-button" href="/create">{t('createSubtitle')}</DocumentLink>
        </div>
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
