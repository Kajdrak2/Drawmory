'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { DocumentLink } from './document-link';
import { useLanguage } from './language-provider';
import { getOrCreateVoterToken, readVotedJourneys, rememberVote } from '@/lib/client/voting';
import { getLanguageOption } from '@/lib/i18n';
import { JourneyMap } from './journey-map';
import { useContentPreferences } from './content-preferences';
import { NsfwPlaceholder } from './nsfw-controls';

export type JourneyCardData = {
  publicSlug: string;
  status: string;
  targetRedraws: number;
  redrawCount: number;
  participantCount: number;
  createdAt: number;
  completedAt: number | null;
  voteCount: number;
  distanceKm: number | null;
  distanceApproximate: boolean;
  coverImageUrl: string | null;
  coverIsNsfw: boolean;
  routePoints: Array<{
    id: string;
    stepIndex: number;
    countryCode: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    locationPrecision: 'NONE' | 'COUNTRY' | 'PRECISE';
  }>;
  drawingPreviews: Array<{
    id: string;
    stepIndex: number;
    countryCode: string;
    city: string | null;
    imageUrl: string | null;
    isNsfw: boolean;
  }>;
};

type JourneyListResponse = { items: JourneyCardData[] };
type StatusFilter = 'all' | 'completed' | 'in_progress';
type SortFilter = 'random' | 'newest' | 'oldest' | 'progress' | 'votes' | 'distance';

export function CommunityGallery({
  initialLibrary = null,
  initialHall = null,
}: {
  initialLibrary?: JourneyCardData[] | null;
  initialHall?: JourneyCardData[] | null;
}) {
  const { language, t } = useLanguage();
  const { showNsfw } = useContentPreferences();
  const carouselRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortFilter>('random');
  const [shuffle, setShuffle] = useState(0);
  const [library, setLibrary] = useState<JourneyCardData[] | null>(initialLibrary);
  const [hall, setHall] = useState<JourneyCardData[] | null>(initialHall);
  const [votedJourneys, setVotedJourneys] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState<string | null>(null);
  const [previewIndexes, setPreviewIndexes] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setVotedJourneys(readVotedJourneys()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch<JourneyListResponse>(
      `/api/public/journeys?status=${status}&sort=${sort}&limit=14&shuffle=${shuffle}&includeNsfw=${showNsfw ? 1 : 0}`,
    )
      .then((result) => {
        if (active) setLibrary(result.items);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : t('libraryLoadFailed'));
          setLibrary([]);
        }
      });
    return () => {
      active = false;
    };
  }, [showNsfw, shuffle, sort, status, t]);

  useEffect(() => {
    let active = true;
    apiFetch<JourneyListResponse>(`/api/public/journeys?status=all&sort=votes&limit=6&includeNsfw=${showNsfw ? 1 : 0}`)
      .then((result) => {
        if (active) setHall(result.items);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : t('hallLoadFailed'));
          setHall([]);
        }
      });
    return () => {
      active = false;
    };
  }, [showNsfw, t]);

  const vote = async (journey: JourneyCardData) => {
    if (voting || votedJourneys.has(journey.publicSlug)) return;
    setVoting(journey.publicSlug);
    setError(null);
    try {
      const result = await apiFetch<{ voteCount: number; voted: boolean }>(
        `/api/public/journeys/${encodeURIComponent(journey.publicSlug)}/votes`,
        {
          method: 'POST',
          body: JSON.stringify({ voterToken: getOrCreateVoterToken() }),
        },
      );
      const updateVote = (item: JourneyCardData) =>
        item.publicSlug === journey.publicSlug ? { ...item, voteCount: result.voteCount } : item;
      setLibrary((current) => current?.map(updateVote) ?? current);
      setHall((current) =>
        current
          ? current.map(updateVote).sort((left, right) => right.voteCount - left.voteCount)
          : current,
      );
      setVotedJourneys(rememberVote(journey.publicSlug));
      void apiFetch<JourneyListResponse>(
        `/api/public/journeys?status=all&sort=votes&limit=6&includeNsfw=${showNsfw ? 1 : 0}`,
      ).then((refreshed) => setHall(refreshed.items), () => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('voteSaveFailed'));
    } finally {
      setVoting(null);
    }
  };

  const scrollCarousel = (direction: -1 | 1) => {
    carouselRef.current?.scrollBy({
      left: carouselRef.current.clientWidth * 0.82 * direction,
      behavior: 'smooth',
    });
  };

  const formatDate = (timestamp: number) =>
    new Intl.DateTimeFormat(getLanguageOption(language).locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(timestamp);

  const formatDistance = (journey: JourneyCardData) => {
    if (journey.distanceKm == null) return t('distanceUnknown');
    const distance = new Intl.NumberFormat(getLanguageOption(language).locale, {
      maximumFractionDigits: journey.distanceKm < 10 ? 1 : 0,
    }).format(journey.distanceKm);
    return t(journey.distanceApproximate ? 'distanceTravelledApproximate' : 'distanceTravelled', {
      distance,
    });
  };

  const renderCard = (journey: JourneyCardData, rank?: number) => {
    const completed = journey.status === 'COMPLETED';
    const voted = votedJourneys.has(journey.publicSlug);
    const previews = journey.drawingPreviews ?? [];
    const previewSlideCount = previews.length + 1;
    const mapPreviewIndex = previews.length;
    const activePreviewIndex = Math.min(previewIndexes[journey.publicSlug] ?? 0, previewSlideCount - 1);
    const isMapPreview = activePreviewIndex === mapPreviewIndex;
    const activePreview = isMapPreview ? undefined : previews[activePreviewIndex];
    const previewImageUrl = activePreview ? activePreview.imageUrl : journey.coverImageUrl;
    const previewHiddenNsfw = activePreview
      ? activePreview.isNsfw && !showNsfw
      : journey.coverIsNsfw && !showNsfw;
    const movePreview = (direction: -1 | 1) => {
      setPreviewIndexes((current) => ({
        ...current,
        [journey.publicSlug]: (activePreviewIndex + direction + previewSlideCount) % previewSlideCount,
      }));
    };
    const progressWidth = journey.targetRedraws < 0
      ? Math.min(92, 24 + journey.redrawCount * 8)
      : Math.max(8, (journey.redrawCount / Math.max(1, journey.targetRedraws)) * 100);
    return (
      <article className={`journey-card${rank ? ' fame-card' : ''}`}>
        <div className="journey-cover">
          {rank ? <span className="fame-rank">#{rank}</span> : null}
          <span className={`journey-status${completed ? ' completed' : ''}`}>
            {completed ? t('finished') : t('inProgress')}
          </span>
          {isMapPreview ? (
            <div className="journey-card-map" data-testid={`journey-card-map-${journey.publicSlug}`}>
              <JourneyMap drawings={journey.routePoints ?? previews} compact preview />
            </div>
          ) : previewHiddenNsfw ? (
            <NsfwPlaceholder compact />
          ) : previewImageUrl ? (
            <img src={previewImageUrl} alt="" loading="lazy" />
          ) : (
            <div className="hidden-drawing" aria-hidden="true">
              <span className="hidden-orbit"><i /></span>
            </div>
          )}
          <DocumentLink
            className="journey-cover-link"
            href={`/journey/${encodeURIComponent(journey.publicSlug)}`}
            aria-label={t('openJourney')}
          />
          {previewSlideCount > 1 ? (
            <>
              <button
                className="frame-arrow frame-arrow-previous"
                type="button"
                aria-label={t('previousDrawing')}
                onClick={() => movePreview(-1)}
              >←</button>
              <button
                className="frame-arrow frame-arrow-next"
                type="button"
                aria-label={t('nextDrawing')}
                onClick={() => movePreview(1)}
              >→</button>
            </>
          ) : null}
          {previewSlideCount ? (
            <span className="frame-counter" aria-live="polite" title={isMapPreview ? t('journeyMap') : undefined}>
              {activePreviewIndex + 1}/{previewSlideCount}
            </span>
          ) : null}
        </div>
        <DocumentLink
          className="journey-card-link"
          href={`/journey/${encodeURIComponent(journey.publicSlug)}`}
          aria-label={t('openJourney')}
        >
          <div className="journey-card-copy">
            <strong>Drawmory #{journey.publicSlug.slice(0, 5).toUpperCase()}</strong>
            <small>{t('createdOn', { date: formatDate(journey.createdAt) })}</small>
            {journey.distanceKm != null || sort === 'distance' ? (
              <small className="journey-distance">{formatDistance(journey)}</small>
            ) : null}
            <div className="journey-progress-mini" aria-label={t('progress', {
              current: journey.redrawCount,
              target: journey.targetRedraws < 0 ? '∞' : journey.targetRedraws,
            })}>
              <span className={journey.targetRedraws < 0 ? 'open' : ''} style={{ width: `${progressWidth}%` }} />
            </div>
            <p>
              {journey.targetRedraws < 0
                ? t('openProgress', { count: journey.participantCount })
                : t('frameCount', { current: journey.participantCount, total: journey.targetRedraws + 1 })}
            </p>
          </div>
        </DocumentLink>
        <div className="journey-card-footer">
          <span>{t('voteCount', { count: journey.voteCount })}</span>
          <button
            className={`vote-button${voted ? ' voted' : ''}`}
            type="button"
            onClick={() => void vote(journey)}
            disabled={voted || voting === journey.publicSlug}
            data-testid={`vote-${journey.publicSlug}`}
          >
            <span aria-hidden="true">♥</span> {voted ? t('voted') : t('vote')}
          </button>
        </div>
      </article>
    );
  };

  return (
    <section className="community-home">
      <section className="community-section library-section">
        <div className="community-heading">
          <div>
            <h2>{t('libraryTitle')}</h2>
          </div>
          <div className="gallery-controls">
            <label className="filter-field">
              <span>{t('filterStatus')}</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
                <option value="all">{t('allJourneys')}</option>
                <option value="completed">{t('completedJourneys')}</option>
                <option value="in_progress">{t('inProgressJourneys')}</option>
              </select>
            </label>
            <label className="filter-field">
              <span>{t('sortBy')}</span>
              <select value={sort} onChange={(event) => setSort(event.target.value as SortFilter)}>
                <option value="random">{t('randomSort')}</option>
                <option value="newest">{t('newestSort')}</option>
                <option value="oldest">{t('oldestSort')}</option>
                <option value="progress">{t('progressSort')}</option>
                <option value="votes">{t('votesSort')}</option>
                <option value="distance">{t('distanceSort')}</option>
              </select>
            </label>
            {sort === 'random' ? (
              <button className="shuffle-button" type="button" onClick={() => setShuffle((value) => value + 1)}>
                ↻ {t('refreshRandom')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="carousel-shell">
          <button
            className="carousel-button carousel-button-previous"
            type="button"
            aria-label={t('previousCards')}
            onClick={() => scrollCarousel(-1)}
          >
            ←
          </button>
          <div className="journey-carousel" ref={carouselRef}>
            {library === null ? <p className="gallery-state">{t('galleryLoading')}</p> : null}
            {library?.length === 0 ? <p className="gallery-state">{t('libraryEmpty')}</p> : null}
            {library?.map((journey) => (
              <div className="carousel-item" key={journey.publicSlug}>{renderCard(journey)}</div>
            ))}
          </div>
          <button
            className="carousel-button carousel-button-next"
            type="button"
            aria-label={t('nextCards')}
            onClick={() => scrollCarousel(1)}
          >
            →
          </button>
        </div>
      </section>

      <section className="community-section hall-section">
        <div className="community-heading hall-heading">
          <div>
            <h2>{t('hallTitle')}</h2>
          </div>
          <span className="hall-symbol" aria-hidden="true">★</span>
        </div>
        {hall === null ? <p className="gallery-state">{t('galleryLoading')}</p> : null}
        {hall?.length === 0 ? <p className="gallery-state hall-empty">{t('hallEmpty')}</p> : null}
        {hall?.length ? (
          <div className="hall-grid">
            {hall.map((journey, index) => (
              <div key={journey.publicSlug}>{renderCard(journey, index + 1)}</div>
            ))}
          </div>
        ) : null}
      </section>

      {error ? <p className="error-banner gallery-error" role="alert">{error}</p> : null}
    </section>
  );
}
