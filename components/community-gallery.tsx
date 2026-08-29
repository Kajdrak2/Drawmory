'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { DocumentLink } from './document-link';
import { useLanguage } from './language-provider';

type JourneyCardData = {
  publicSlug: string;
  status: string;
  targetRedraws: number;
  redrawCount: number;
  participantCount: number;
  createdAt: number;
  completedAt: number | null;
  voteCount: number;
  coverImageUrl: string | null;
};

type JourneyListResponse = { items: JourneyCardData[] };
type StatusFilter = 'all' | 'completed' | 'in_progress';
type SortFilter = 'random' | 'newest' | 'oldest' | 'progress' | 'votes';

const VOTER_TOKEN_KEY = 'drawmoryVoterToken';
const VOTED_JOURNEYS_KEY = 'drawmoryVotedJourneys';

function readVotedJourneys() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VOTED_JOURNEYS_KEY) ?? '[]');
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []);
  } catch {
    return new Set<string>();
  }
}

function rememberVote(publicSlug: string) {
  const voted = readVotedJourneys();
  voted.add(publicSlug);
  try {
    window.localStorage.setItem(VOTED_JOURNEYS_KEY, JSON.stringify([...voted]));
  } catch {
    // The server still enforces one vote for the current voter token.
  }
  return voted;
}

export function CommunityGallery() {
  const { language, t } = useLanguage();
  const carouselRef = useRef<HTMLDivElement>(null);
  const voterTokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortFilter>('random');
  const [shuffle, setShuffle] = useState(0);
  const [library, setLibrary] = useState<JourneyCardData[] | null>(null);
  const [hall, setHall] = useState<JourneyCardData[] | null>(null);
  const [votedJourneys, setVotedJourneys] = useState<Set<string>>(new Set());
  const [voting, setVoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setVotedJourneys(readVotedJourneys()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch<JourneyListResponse>(
      `/api/public/journeys?status=${status}&sort=${sort}&limit=14&shuffle=${shuffle}`,
    )
      .then((result) => {
        if (active) setLibrary(result.items);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'The library could not be loaded.');
          setLibrary([]);
        }
      });
    return () => {
      active = false;
    };
  }, [shuffle, sort, status]);

  useEffect(() => {
    let active = true;
    apiFetch<JourneyListResponse>('/api/public/journeys?status=completed&sort=votes&limit=6')
      .then((result) => {
        if (active) setHall(result.items);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'The Hall of Fame could not be loaded.');
          setHall([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const getVoterToken = () => {
    if (voterTokenRef.current) return voterTokenRef.current;
    try {
      const saved = window.localStorage.getItem(VOTER_TOKEN_KEY);
      if (saved) {
        voterTokenRef.current = saved;
        return saved;
      }
      const created = crypto.randomUUID();
      window.localStorage.setItem(VOTER_TOKEN_KEY, created);
      voterTokenRef.current = created;
      return created;
    } catch {
      voterTokenRef.current = crypto.randomUUID();
      return voterTokenRef.current;
    }
  };

  const vote = async (journey: JourneyCardData) => {
    if (voting || votedJourneys.has(journey.publicSlug)) return;
    setVoting(journey.publicSlug);
    setError(null);
    try {
      const result = await apiFetch<{ voteCount: number; voted: boolean }>(
        `/api/public/journeys/${encodeURIComponent(journey.publicSlug)}/votes`,
        {
          method: 'POST',
          body: JSON.stringify({ voterToken: getVoterToken() }),
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
        '/api/public/journeys?status=completed&sort=votes&limit=6',
      ).then((refreshed) => setHall(refreshed.items), () => undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The vote could not be saved.');
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
    new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(timestamp);

  const renderCard = (journey: JourneyCardData, rank?: number) => {
    const completed = journey.status === 'COMPLETED';
    const voted = votedJourneys.has(journey.publicSlug);
    return (
      <article className={`journey-card${rank ? ' fame-card' : ''}`}>
        <DocumentLink
          className="journey-card-link"
          href={`/journey/${encodeURIComponent(journey.publicSlug)}`}
          aria-label={t('openJourney')}
        >
          <div className={`journey-cover${completed ? '' : ' journey-cover-hidden'}`}>
            {rank ? <span className="fame-rank">#{rank}</span> : null}
            <span className={`journey-status${completed ? ' completed' : ''}`}>
              {completed ? t('finished') : t('inProgress')}
            </span>
            {journey.coverImageUrl ? (
              <img src={journey.coverImageUrl} alt="" loading="lazy" />
            ) : (
              <div className="hidden-drawing" aria-hidden="true">
                <span className="hidden-orbit"><i /></span>
                <strong>{journey.redrawCount}/{journey.targetRedraws}</strong>
              </div>
            )}
          </div>
          <div className="journey-card-copy">
            <strong>Drawmory #{journey.publicSlug.slice(0, 5).toUpperCase()}</strong>
            <small>{t('createdOn', { date: formatDate(journey.createdAt) })}</small>
            <div className="journey-progress-mini" aria-label={t('progress', {
              current: journey.redrawCount,
              target: journey.targetRedraws,
            })}>
              <span style={{ width: `${Math.max(8, (journey.redrawCount / journey.targetRedraws) * 100)}%` }} />
            </div>
            {!completed ? <p>{t('drawingHidden')}</p> : null}
          </div>
        </DocumentLink>
        <div className="journey-card-footer">
          <span>{t('voteCount', { count: journey.voteCount })}</span>
          {completed ? (
            <button
              className={`vote-button${voted ? ' voted' : ''}`}
              type="button"
              onClick={() => void vote(journey)}
              disabled={voted || voting === journey.publicSlug}
              data-testid={`vote-${journey.publicSlug}`}
            >
              <span aria-hidden="true">♥</span> {voted ? t('voted') : t('vote')}
            </button>
          ) : null}
        </div>
      </article>
    );
  };

  return (
    <section className="community-home">
      <section className="community-section library-section">
        <div className="community-heading">
          <div>
            <p className="section-kicker">Community</p>
            <h2>{t('libraryTitle')}</h2>
            <p>{t('librarySubtitle')}</p>
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
            <p className="section-kicker">Community picks</p>
            <h2>{t('hallTitle')}</h2>
            <p>{t('hallSubtitle')}</p>
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
