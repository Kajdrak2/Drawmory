'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { DocumentLink } from './document-link';

type AdminDrawing = {
  id: string;
  stepIndex: number;
  createdAt: number;
  countryCode: string;
  city: string | null;
  imageUrl: string;
};

type AdminJourney = {
  id: string;
  publicSlug: string;
  status: string;
  targetRedraws: number;
  redrawCount: number;
  handoffMode: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  reservationExpiresAt: number | null;
  flagged: boolean;
  voteCount: number;
  activeClaim: { id: string; createdAt: number | null; drawingValidated: boolean } | null;
  drawings: AdminDrawing[];
};

type AdminMutationResult = {
  cleanupWarning?: boolean;
  recoveryPath?: string | null;
};

function displayDate(timestamp: number | null) {
  return timestamp
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(timestamp)
    : '—';
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    AWAITING_HANDOFF: 'À transmettre',
    AVAILABLE_PRIVATE: 'Disponible en privé',
    AVAILABLE_WORLD: 'Disponible au monde',
    RESERVED: 'Étape en cours',
    COMPLETED: 'Terminée',
    EXPIRED: 'Arrêtée',
  };
  return labels[status] ?? status;
}

export function AdminPanel() {
  const initialized = useRef(false);
  const [access, setAccess] = useState<'loading' | 'ready' | 'denied'>('loading');
  const [journeys, setJourneys] = useState<AdminJourney[]>([]);
  const [filter, setFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);

  const loadJourneys = useCallback(async () => {
    const result = await apiFetch<{ journeys: AdminJourney[] }>('/api/admin/journeys');
    setJourneys(result.journeys);
    setAccess('ready');
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const capability = fragment.get('access');
    if (window.location.hash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
    const open = async () => {
      try {
        if (capability) {
          await apiFetch('/api/admin/session', {
            method: 'POST',
            body: JSON.stringify({ capability }),
          });
        }
        await loadJourneys();
      } catch {
        setAccess('denied');
      }
    };
    void open();
  }, [loadJourneys]);

  const mutate = async (
    journey: AdminJourney,
    action: 'release' | 'reset' | 'delete',
    fromStep?: number,
  ) => {
    setBusyId(journey.id);
    setMessage(null);
    setRecoveryUrl(null);
    try {
      const route = action === 'delete'
        ? `/api/admin/journeys/${encodeURIComponent(journey.id)}`
        : `/api/admin/journeys/${encodeURIComponent(journey.id)}/${action}`;
      const result = await apiFetch<AdminMutationResult>(route, {
        method: action === 'delete' ? 'DELETE' : 'POST',
        body: JSON.stringify({ expectedUpdatedAt: journey.updatedAt, fromStep }),
      });
      if (result.recoveryPath) setRecoveryUrl(`${window.location.origin}${result.recoveryPath}`);
      setMessage(
        result.cleanupWarning
          ? 'Action effectuée. Un fichier image résiduel devra être nettoyé plus tard.'
          : 'Action effectuée.',
      );
      await loadJourneys();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'L’action a échoué.');
    } finally {
      setBusyId(null);
    }
  };

  const release = (journey: AdminJourney) => {
    if (window.confirm('Libérer cette tentative ? La même étape redeviendra immédiatement disponible.')) {
      void mutate(journey, 'release');
    }
  };

  const reset = (journey: AdminJourney, drawing: AdminDrawing) => {
    if (
      window.confirm(
        `Annuler le dessin ${drawing.stepIndex}, tous les dessins suivants et les votes ? Cette action est irréversible.`,
      )
    ) {
      void mutate(journey, 'reset', drawing.stepIndex);
    }
  };

  const remove = (journey: AdminJourney) => {
    const confirmation = window.prompt(
      `Pour supprimer définitivement cette Drawmory, ses images, ses votes et toute tentative en cours, saisis ${journey.publicSlug}`,
    );
    if (confirmation === journey.publicSlug) void mutate(journey, 'delete');
  };

  const logout = async () => {
    try {
      await apiFetch('/api/admin/session', { method: 'DELETE' });
    } finally {
      setJourneys([]);
      setAccess('denied');
    }
  };

  if (access === 'loading') {
    return <main className="admin-shell"><div className="loading-orbit" /></main>;
  }

  if (access === 'denied') {
    return (
      <main className="admin-shell">
        <section className="admin-access-card">
          <span className="result-icon">⌁</span>
          <h1>Accès propriétaire requis</h1>
          <p>Ouvre l’adresse secrète d’administration. Aucun compte ni mot de passe n’est demandé.</p>
          <DocumentLink className="secondary-button" href="/">Retour à Drawmory</DocumentLink>
        </section>
      </main>
    );
  }

  const normalizedFilter = filter.trim().toLowerCase();
  const visibleJourneys = journeys.filter((journey) =>
    !normalizedFilter ||
    journey.publicSlug.toLowerCase().includes(normalizedFilter) ||
    statusLabel(journey.status).toLowerCase().includes(normalizedFilter),
  );

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="flow-kicker">Drawmory · accès privé</p>
          <h1>Administration</h1>
          <p>Annule une tentative, reviens à une étape antérieure ou supprime une Drawmory.</p>
        </div>
        <div className="admin-header-actions">
          <button className="secondary-button" type="button" onClick={() => void loadJourneys()}>Actualiser</button>
          <button className="quiet-action" type="button" onClick={logout}>Fermer l’accès</button>
        </div>
      </header>

      <section className="admin-toolbar">
        <label htmlFor="admin-filter">Rechercher</label>
        <input
          id="admin-filter"
          type="search"
          placeholder="Identifiant public ou état"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <strong>{visibleJourneys.length} Drawmorie{visibleJourneys.length > 1 ? 's' : ''}</strong>
      </section>

      {message ? <p className="admin-message" role="status">{message}</p> : null}
      {recoveryUrl ? (
        <p className="admin-recovery">
          Nouveau lien de transmission privé : <a href={recoveryUrl}>{recoveryUrl}</a>
        </p>
      ) : null}

      <div className="admin-journeys" data-testid="admin-journeys">
        {visibleJourneys.map((journey) => (
          <article className="admin-journey-card" key={journey.id} data-testid={`admin-journey-${journey.publicSlug}`}>
            <div className="admin-journey-heading">
              <div>
                <span className={`admin-status admin-status-${journey.status.toLowerCase()}`}>
                  {statusLabel(journey.status)}
                </span>
                <h2>{journey.publicSlug}</h2>
                <p>
                  {journey.redrawCount + 1} dessin{journey.redrawCount > 0 ? 's' : ''}
                  {' · '}{journey.voteCount} vote{journey.voteCount > 1 ? 's' : ''}
                  {' · '}modifiée {displayDate(journey.updatedAt)}
                </p>
              </div>
              <div className="admin-card-actions">
                {journey.status === 'RESERVED' && journey.activeClaim ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busyId === journey.id}
                    onClick={() => release(journey)}
                    data-testid={`admin-release-${journey.publicSlug}`}
                  >
                    Libérer l’étape
                  </button>
                ) : null}
                <a className="secondary-button" href={`/journey/${encodeURIComponent(journey.publicSlug)}`} target="_blank" rel="noreferrer">
                  Voir
                </a>
                <button
                  className="admin-danger-button"
                  type="button"
                  disabled={busyId === journey.id}
                  onClick={() => remove(journey)}
                  data-testid={`admin-delete-${journey.publicSlug}`}
                >
                  Supprimer tout
                </button>
              </div>
            </div>

            {journey.activeClaim ? (
              <p className="admin-active-note">
                Tentative commencée {displayDate(journey.activeClaim.createdAt)}
                {journey.activeClaim.drawingValidated ? ' · dessin validé, lieu en attente' : ''}
              </p>
            ) : null}

            <div className="admin-drawings">
              {journey.drawings.map((drawing) => (
                <figure key={drawing.id}>
                  <img src={drawing.imageUrl} alt={`Dessin ${drawing.stepIndex}`} loading="lazy" />
                  <figcaption>
                    <span>{drawing.stepIndex === 0 ? 'Original' : `Étape ${drawing.stepIndex}`}</span>
                    <small>
                      {drawing.countryCode === 'UNKNOWN' ? 'Lieu inconnu' : drawing.countryCode}
                      {drawing.city ? ` · ${drawing.city}` : ''}
                    </small>
                    {drawing.stepIndex > 0 ? (
                      <button
                        className="admin-reset-button"
                        type="button"
                        disabled={busyId === journey.id}
                        onClick={() => reset(journey, drawing)}
                        data-testid={`admin-reset-${journey.publicSlug}-${drawing.stepIndex}`}
                      >
                        Annuler depuis ici
                      </button>
                    ) : null}
                  </figcaption>
                </figure>
              ))}
            </div>
          </article>
        ))}
        {visibleJourneys.length === 0 ? <p className="admin-empty">Aucune Drawmory trouvée.</p> : null}
      </div>
    </main>
  );
}
