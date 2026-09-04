'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { getOrCreateVoterToken, readVotedJourneys, rememberVote } from '@/lib/client/voting';
import { DocumentLink } from './document-link';
import { JourneyMap } from './journey-map';
import { useLanguage } from './language-provider';
import { SiteHeader } from './site-header';
import { useContentPreferences } from './content-preferences';
import { NsfwPlaceholder } from './nsfw-controls';

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
    imageUrl: string | null;
    isNsfw: boolean;
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

export function JourneyReveal({
  publicSlug,
  initialJourney,
}: {
  publicSlug: string;
  initialJourney: PublicJourney;
}) {
  const { t } = useLanguage();
  const { showNsfw } = useContentPreferences();
  const lastLoadedJourneyRef = useRef<PublicJourney | null>(initialJourney);
  const [journey, setJourney] = useState<PublicJourney | null>(initialJourney);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [view, setView] = useState<'book' | 'mural'>('book');
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => {
      apiFetch<PublicJourney>(
        `/api/public/journeys/${encodeURIComponent(publicSlug)}?includeNsfw=${showNsfw ? 1 : 0}`,
      )
        .then((result) => {
          if (!active) return;
          const previousMapIndex = lastLoadedJourneyRef.current?.drawings.length;
          lastLoadedJourneyRef.current = result;
          setJourney(result);
          setActiveIndex((current) =>
            previousMapIndex !== undefined && current === previousMapIndex
              ? result.drawings.length
              : Math.min(current, Math.max(0, result.drawings.length - 1)),
          );
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
  }, [publicSlug, showNsfw, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => setVoted(readVotedJourneys().has(publicSlug)), 0);
    return () => window.clearTimeout(timer);
  }, [publicSlug]);

  useEffect(() => {
    if (!playing || view !== 'book' || !journey || activeIndex >= journey.drawings.length) return;
    const timer = window.setTimeout(() => {
      const nextIndex = Math.min(activeIndex + 1, journey.drawings.length);
      setActiveIndex(nextIndex);
      if (nextIndex === journey.drawings.length) setPlaying(false);
    }, 1_700);
    return () => window.clearTimeout(timer);
  }, [activeIndex, journey, playing, view]);

  const mapSlideIndex = journey?.drawings.length ?? 0;
  const slideCount = mapSlideIndex + 1;
  const isMapSlide = Boolean(journey) && activeIndex === mapSlideIndex;
  const current = isMapSlide ? undefined : journey?.drawings[activeIndex];
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
      await navigator.share({ title: 'Drawmory', text: `Drawmory #${publicSlug.slice(0, 5).toUpperCase()}`, url: shareUrl });
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
      setError(caught instanceof Error ? caught.message : t('voteSaveFailed'));
    } finally {
      setVoting(false);
    }
  };

  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (isMapSlide) setActiveIndex(0);
    setPlaying(true);
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
            <h1>Drawmory #{publicSlug.slice(0, 5).toUpperCase()}</h1>
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
            <div className={`flipbook-image${isMapSlide ? ' flipbook-map-slide' : ''}`} data-testid={isMapSlide ? 'journey-map-slide' : undefined}>
              {isMapSlide ? (
                <JourneyMap drawings={journey.drawings} compact />
              ) : current?.isNsfw && (!showNsfw || !current.imageUrl) ? (
                <NsfwPlaceholder />
              ) : current?.imageUrl ? (
                <img key={current.id} src={current.imageUrl} alt={current.stepIndex === 0 ? t('original') : t('redraw', { step: current.stepIndex })} />
              ) : null}
              <span className="frame-label">{isMapSlide ? t('journeyMap') : current?.stepIndex === 0 ? t('original') : t('redraw', { step: current?.stepIndex ?? 0 })}</span>
              {isMapSlide ? null : <span className="country-label">{locationLabel || t('notSpecified')}</span>}
            </div>
            <div className="flipbook-controls">
              <button className="secondary-button icon-button" type="button" aria-label={t('previousDrawing')} onClick={() => { setActiveIndex((index) => Math.max(0, index - 1)); setPlaying(false); }} disabled={activeIndex === 0}>←</button>
              <button className="secondary-button" type="button" onClick={togglePlayback}>{playing ? t('pause') : t('play')}</button>
              <button className="secondary-button icon-button" type="button" aria-label={t('nextDrawing')} onClick={() => { setActiveIndex((index) => Math.min(slideCount - 1, index + 1)); setPlaying(false); }} disabled={activeIndex === slideCount - 1}>→</button>
              <button className="secondary-button" type="button" onClick={() => { setActiveIndex(0); setPlaying(true); }}>{t('replay')}</button>
            </div>
          </div>
        ) : (
          <div className="mural-grid" aria-label={t('muralView')}>
            {journey.drawings.map((drawing) => (
              <figure key={drawing.id}>
                {drawing.isNsfw && (!showNsfw || !drawing.imageUrl) ? (
                  <NsfwPlaceholder compact />
                ) : drawing.imageUrl ? (
                  <img src={drawing.imageUrl} alt={drawing.stepIndex === 0 ? t('original') : t('redraw', { step: drawing.stepIndex })} />
                ) : null}
                <figcaption>{drawing.stepIndex === 0 ? t('original') : t('redraw', { step: drawing.stepIndex })}</figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="reveal-stats">
          {stats.map((stat) => <div key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span></div>)}
        </div>

        <div className="timeline-strip" aria-label={t('drawingHidden')}>
          {journey.drawings.map((drawing, index) => (
            <button key={drawing.id} type="button" className={index === activeIndex ? 'active' : ''} onClick={() => { setActiveIndex(index); setPlaying(false); setView('book'); }} aria-label={drawing.stepIndex === 0 ? t('original') : t('redraw', { step: drawing.stepIndex })}>
              {drawing.isNsfw && (!showNsfw || !drawing.imageUrl) ? (
                <NsfwPlaceholder compact />
              ) : drawing.imageUrl ? <img src={drawing.imageUrl} alt="" /> : null}
              <span>{drawing.stepIndex}</span>
            </button>
          ))}
          <button type="button" className={`timeline-map-button${isMapSlide ? ' active' : ''}`} onClick={() => { setActiveIndex(mapSlideIndex); setPlaying(false); setView('book'); }} aria-label={t('journeyMap')} data-testid="journey-map-thumbnail">
            <svg viewBox="0 0 64 64" aria-hidden="true">
              <path d="M8 45c10-21 20-22 29-8s13 8 19-16" />
              <circle cx="8" cy="45" r="5" />
              <circle cx="37" cy="37" r="5" />
              <circle cx="56" cy="21" r="5" />
            </svg>
            <strong>{t('journeyMap')}</strong>
          </button>
        </div>

        {view === 'mural' ? <section className="journey-map-section">
          <div className="map-heading"><p className="section-kicker">{t('journeyMap')}</p><h2>{t('journeyMap')}</h2></div>
          <JourneyMap drawings={journey.drawings} />
        </section> : null}

        <div className="reveal-actions">
          <button className={`vote-button reveal-vote${voted ? ' voted' : ''}`} type="button" onClick={vote} disabled={voted || voting} data-testid="vote-public">
            <span aria-hidden="true">♥</span> {voted ? t('voted') : t('vote')} · {journey.voteCount}
          </button>
          <button className="primary-button" type="button" onClick={share}>{t('shareReveal')}</button>
          <DocumentLink className="secondary-button" href="/create">{t('create')}</DocumentLink>
        </div>
        {error ? <p className="error-banner" role="alert">{error}</p> : null}
      </section>
    </main>
  );
}
