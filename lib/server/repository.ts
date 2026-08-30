import { SERVER_CONFIG } from './config';
import { ensureSchema, getDatabase, getFiles } from './database';
import { validateDataImage } from './image';
import { normalizeDrawingLocation } from './location';
import { hashToken, normalizeCode, randomCode, randomId, randomSlug, randomToken } from './tokens';
import type { DrawingLocationInput, JourneyLocation } from '@/lib/location';
import { measureJourney } from '@/lib/journey-distance';

export type JourneyStatus =
  | 'AWAITING_HANDOFF'
  | 'AVAILABLE_PRIVATE'
  | 'AVAILABLE_WORLD'
  | 'RESERVED'
  | 'COMPLETED'
  | 'EXPIRED';

type JourneyRow = {
  id: string;
  public_slug: string;
  status: JourneyStatus;
  target_redraws: number;
  redraw_count: number;
  handoff_mode: 'PRIVATE' | 'WORLD' | null;
  created_at: number;
  updated_at: number;
  completed_at: number | null;
  reservation_expires_at: number | null;
  previous_available_state: JourneyStatus | null;
  current_drawing_id: string;
  flagged: number;
};

type HandoffRow = {
  id: string;
  journey_id: string;
  mode: 'PRIVATE' | 'WORLD_POOL' | 'WORLD_OFFER';
  token_hash: string | null;
  code_hash: string | null;
  status: string;
  created_at: number;
  claimed_at: number | null;
  expires_at: number | null;
};

type ClaimRow = {
  id: string;
  journey_id: string;
  handoff_id: string;
  session_token_hash: string;
  reveal_started_at: number | null;
  reservation_expires_at: number;
  submitted_at: number | null;
  cancelled_at: number | null;
  cancel_reason: string | null;
  created_at: number;
};

type DrawingRow = {
  id: string;
  journey_id: string;
  step_index: number;
  storage_path: string;
  mime_type: 'image/png' | 'image/webp';
  width: number;
  height: number;
  byte_size: number;
  sha256: string;
  country_code: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  location_precision: JourneyLocation['locationPrecision'];
  created_at: number;
};

export type PublicJourneyFilter = 'all' | 'completed' | 'in_progress';
export type PublicJourneySort = 'random' | 'newest' | 'oldest' | 'progress' | 'votes' | 'distance';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function changes(result: D1Result<unknown>) {
  return Number(result.meta?.changes ?? 0);
}

function claimDeadlines(claim: Pick<ClaimRow, 'reveal_started_at' | 'reservation_expires_at'>) {
  if (!claim.reveal_started_at) {
    return {
      observationEndsAt: null,
      drawingExpiresAt: null,
      confirmationExpiresAt: null,
    };
  }
  const observationEndsAt = claim.reveal_started_at + SERVER_CONFIG.revealSeconds * 1000;
  const drawingExpiresAt = observationEndsAt + SERVER_CONFIG.redrawSeconds * 1000;
  return {
    observationEndsAt,
    drawingExpiresAt,
    confirmationExpiresAt: drawingExpiresAt + SERVER_CONFIG.confirmationSeconds * 1000,
  };
}

async function deleteDraftObjectIfCancelled(claimId: string, storagePath: string | null) {
  if (!storagePath) return;
  const claim = await getDatabase()
    .prepare(`SELECT cancelled_at, submitted_at FROM claims WHERE id = ?`)
    .bind(claimId)
    .first<Pick<ClaimRow, 'cancelled_at' | 'submitted_at'>>();
  if (claim?.cancelled_at && !claim.submitted_at) {
    await getFiles().delete(storagePath);
  }
}

async function releaseExpiredJourney(journeyId: string) {
  const database = getDatabase();
  const now = Date.now();
  const journey = await database
    .prepare(
      `SELECT id, status, reservation_expires_at, previous_available_state
       FROM journeys WHERE id = ?`,
    )
    .bind(journeyId)
    .first<Pick<JourneyRow, 'id' | 'status' | 'reservation_expires_at' | 'previous_available_state'>>();

  if (
    !journey ||
    journey.status !== 'RESERVED' ||
    !journey.reservation_expires_at ||
    journey.reservation_expires_at > now
  ) {
    return false;
  }

  const restored =
    journey.previous_available_state === 'AVAILABLE_PRIVATE'
      ? 'AVAILABLE_PRIVATE'
      : 'AVAILABLE_WORLD';
  const activeClaim = await database
    .prepare(
      `SELECT c.id, c.handoff_id, d.storage_path
       FROM claims c LEFT JOIN claim_drafts d ON d.claim_id = c.id
       WHERE c.journey_id = ? AND c.submitted_at IS NULL AND c.cancelled_at IS NULL
       ORDER BY c.created_at DESC LIMIT 1`,
    )
    .bind(journeyId)
    .first<{ id: string; handoff_id: string; storage_path: string | null }>();

  const results = await database.batch([
    database
      .prepare(
        `UPDATE journeys
         SET status = ?, reservation_expires_at = NULL, previous_available_state = NULL, updated_at = ?
         WHERE id = ? AND status = 'RESERVED' AND reservation_expires_at <= ?`,
      )
      .bind(restored, now, journeyId, now),
    database
      .prepare(
        `UPDATE claims SET cancelled_at = ?, cancel_reason = 'TIMEOUT'
         WHERE id = ? AND submitted_at IS NULL AND cancelled_at IS NULL
           AND reservation_expires_at <= ?`,
      )
      .bind(now, activeClaim?.id ?? '', now),
    database
      .prepare(
        `UPDATE handoffs
         SET status = CASE WHEN mode = 'PRIVATE' THEN 'READY' ELSE 'CANCELLED' END,
             claimed_at = CASE WHEN mode = 'PRIVATE' THEN NULL ELSE claimed_at END
         WHERE id = ?
           AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND cancelled_at = ?)` ,
      )
      .bind(activeClaim?.handoff_id ?? '', activeClaim?.id ?? '', now),
    database
      .prepare(
        `DELETE FROM claim_drafts WHERE claim_id = ?
         AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND cancelled_at = ?)` ,
      )
      .bind(activeClaim?.id ?? '', activeClaim?.id ?? '', now),
  ]);
  if (changes(results[0]) !== 1) return false;
  if (activeClaim) {
    await deleteDraftObjectIfCancelled(activeClaim.id, activeClaim.storage_path);
  }
  return true;
}

async function releaseAllExpiredJourneys() {
  const database = getDatabase();
  const rows = await database
    .prepare(
      `SELECT id FROM journeys
       WHERE status = 'RESERVED' AND reservation_expires_at <= ?
       ORDER BY reservation_expires_at ASC LIMIT 20`,
    )
    .bind(Date.now())
    .all<{ id: string }>();
  await Promise.all(rows.results.map((row) => releaseExpiredJourney(row.id)));
}

export async function createJourney(
  imageDataUrl: string,
  targetParticipants: number | 'infinite',
  location?: DrawingLocationInput | null,
) {
  await ensureSchema();
  if (
    targetParticipants !== 'infinite' &&
    (!Number.isInteger(targetParticipants) || targetParticipants < 2 || targetParticipants > 50)
  ) {
    throw new HttpError(400, 'INVALID_LENGTH', 'Choose between 2 and 50 participants, or no limit.');
  }

  const image = await validateDataImage(imageDataUrl);
  const targetRedraws = targetParticipants === 'infinite' ? -1 : targetParticipants - 1;
  const drawingLocation = normalizeDrawingLocation(location);
  const now = Date.now();
  const journeyId = randomId('jny');
  const drawingId = randomId('drw');
  const receiptId = randomId('rcp');
  const receiptToken = randomToken();
  const receiptHash = await hashToken(receiptToken);
  const publicSlug = randomSlug();
  const storagePath = `journeys/${journeyId}/0-${drawingId}.${image.extension}`;

  await getFiles().put(storagePath, image.bytes, {
    httpMetadata: { contentType: image.mimeType },
    customMetadata: { sha256: image.sha256 },
  });

  try {
    const database = getDatabase();
    await database.batch([
      database
        .prepare(
          `INSERT INTO journeys (
            id, public_slug, status, target_redraws, redraw_count, handoff_mode,
            created_at, updated_at, current_drawing_id, flagged
          ) VALUES (?, ?, 'AWAITING_HANDOFF', ?, 0, NULL, ?, ?, ?, 0)`,
        )
        .bind(journeyId, publicSlug, targetRedraws, now, now, drawingId),
      database
        .prepare(
          `INSERT INTO drawings (
            id, journey_id, step_index, storage_path, mime_type, width, height,
            byte_size, sha256, country_code, city, latitude, longitude,
            location_precision, created_at
          ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          drawingId,
          journeyId,
          storagePath,
          image.mimeType,
          image.width,
          image.height,
          image.bytes.byteLength,
          image.sha256,
          drawingLocation.countryCode,
          drawingLocation.city,
          drawingLocation.latitude,
          drawingLocation.longitude,
          drawingLocation.locationPrecision,
          now,
        ),
      database
        .prepare(
          `INSERT INTO receipts (id, journey_id, step_index, token_hash, created_at)
           VALUES (?, ?, 0, ?, ?)`,
        )
        .bind(receiptId, journeyId, receiptHash, now),
    ]);
  } catch (error) {
    await getFiles().delete(storagePath);
    throw error;
  }

  return { journeyId, publicSlug, receiptToken, targetRedraws, targetParticipants };
}

export async function chooseHandoff(
  journeyId: string,
  receiptToken: string,
  mode: 'PRIVATE' | 'WORLD',
) {
  await ensureSchema();
  await releaseExpiredJourney(journeyId);
  const database = getDatabase();
  const receiptHash = await hashToken(receiptToken);
  const journey = await database
    .prepare(
      `SELECT j.* FROM journeys j
       JOIN receipts r ON r.journey_id = j.id AND r.step_index = j.redraw_count
       WHERE j.id = ? AND r.token_hash = ?`,
    )
    .bind(journeyId, receiptHash)
    .first<JourneyRow>();

  if (!journey) {
    throw new HttpError(403, 'INVALID_RECEIPT', 'This contribution link is not valid.');
  }
  if (journey.status === 'COMPLETED') {
    throw new HttpError(409, 'JOURNEY_COMPLETED', 'This Drawmory is already complete.');
  }
  if (journey.status === 'RESERVED') {
    throw new HttpError(409, 'JOURNEY_RESERVED', 'This Drawmory is already being carried.');
  }
  if (journey.status === 'EXPIRED') {
    throw new HttpError(410, 'JOURNEY_EXPIRED', 'This Drawmory can no longer travel.');
  }
  if (journey.handoff_mode === 'WORLD') {
    if (mode !== 'WORLD') {
      throw new HttpError(409, 'WORLD_MODE_LOCKED', 'This Drawmory now travels through the world.');
    }
    return { mode: 'WORLD' as const, publicSlug: journey.public_slug, locked: true };
  }

  const now = Date.now();
  const handoffId = randomId('hnd');
  const handoffToken = randomToken();
  const tokenHash = await hashToken(handoffToken);
  const code = mode === 'PRIVATE' ? randomCode() : null;
  const codeHash = code ? await hashToken(normalizeCode(code)) : null;
  const nextStatus = mode === 'PRIVATE' ? 'AVAILABLE_PRIVATE' : 'AVAILABLE_WORLD';
  const handoffMode = mode === 'PRIVATE' ? 'PRIVATE' : 'WORLD_POOL';

  await database.batch([
    database
      .prepare(`UPDATE handoffs SET status = 'CANCELLED' WHERE journey_id = ? AND status = 'READY'`)
      .bind(journeyId),
    database
      .prepare(
        `INSERT INTO handoffs (
          id, journey_id, mode, token_hash, code_hash, status, created_at, claimed_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, 'READY', ?, NULL, NULL)`,
      )
      .bind(handoffId, journeyId, handoffMode, tokenHash, codeHash, now),
    database
      .prepare(
        `UPDATE journeys
         SET status = ?, handoff_mode = ?, updated_at = ?, reservation_expires_at = NULL,
             previous_available_state = NULL
         WHERE id = ? AND status != 'COMPLETED' AND status != 'RESERVED'`,
      )
      .bind(nextStatus, mode, now, journeyId),
  ]);

  return mode === 'PRIVATE'
    ? { mode, handoffToken, code, publicSlug: journey.public_slug }
    : { mode, publicSlug: journey.public_slug };
}

export async function createWorldOffer() {
  await ensureSchema();
  await releaseAllExpiredJourneys();
  const database = getDatabase();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const journey = await database
      .prepare(
        `SELECT * FROM journeys
         WHERE status = 'AVAILABLE_WORLD' AND flagged = 0
         ORDER BY updated_at ASC LIMIT 1`,
      )
      .first<JourneyRow>();
    if (!journey) return null;

    const now = Date.now();
    const token = randomToken();
    const tokenHash = await hashToken(token);
    const handoffId = randomId('hnd');
    const expiresAt = now + SERVER_CONFIG.worldOfferSeconds * 1000;
    const result = await database
      .prepare(
        `INSERT INTO handoffs (
          id, journey_id, mode, token_hash, code_hash, status, created_at, claimed_at, expires_at
        )
        SELECT ?, id, 'WORLD_OFFER', ?, NULL, 'READY', ?, NULL, ?
        FROM journeys WHERE id = ? AND status = 'AVAILABLE_WORLD' AND flagged = 0`,
      )
      .bind(handoffId, tokenHash, now, expiresAt, journey.id)
      .run();
    if (changes(result) === 1) {
      return {
        token,
        expiresAt,
        journey: {
          publicSlug: journey.public_slug,
          redrawCount: journey.redraw_count,
          targetRedraws: journey.target_redraws,
        },
      };
    }
  }
  return null;
}

async function findHandoff(secret: { token?: string; code?: string }) {
  const database = getDatabase();
  const isCode = Boolean(secret.code);
  const raw = isCode ? normalizeCode(secret.code ?? '') : secret.token ?? '';
  if (!raw) return null;
  const secretHash = await hashToken(raw);
  const column = isCode ? 'code_hash' : 'token_hash';

  let row = await database
    .prepare(
      `SELECT h.*, j.public_slug, j.status AS journey_status, j.target_redraws,
              j.redraw_count, j.reservation_expires_at, j.flagged
       FROM handoffs h JOIN journeys j ON j.id = h.journey_id
       WHERE h.${column} = ?`,
    )
    .bind(secretHash)
    .first<
      HandoffRow & {
        public_slug: string;
        journey_status: JourneyStatus;
        target_redraws: number;
        redraw_count: number;
        reservation_expires_at: number | null;
        flagged: number;
      }
    >();
  if (!row) return null;
  if (row.journey_status === 'RESERVED' && (row.reservation_expires_at ?? 0) <= Date.now()) {
    await releaseExpiredJourney(row.journey_id);
    row = await database
      .prepare(
        `SELECT h.*, j.public_slug, j.status AS journey_status, j.target_redraws,
                j.redraw_count, j.reservation_expires_at, j.flagged
         FROM handoffs h JOIN journeys j ON j.id = h.journey_id
         WHERE h.${column} = ?`,
      )
      .bind(secretHash)
      .first<typeof row>();
  }
  return row;
}

export async function previewHandoff(secret: { token?: string; code?: string }) {
  await ensureSchema();
  const handoff = await findHandoff(secret);
  if (!handoff) {
    throw new HttpError(404, 'INVALID_HANDOFF', 'This Drawmory link or code is invalid.');
  }
  if (handoff.flagged) {
    throw new HttpError(410, 'REPORTED', 'This Drawmory is no longer available.');
  }
  if (handoff.expires_at && handoff.expires_at <= Date.now()) {
    throw new HttpError(410, 'HANDOFF_EXPIRED', 'This invitation has expired.');
  }
  if (handoff.journey_status === 'COMPLETED') {
    throw new HttpError(409, 'JOURNEY_COMPLETED', 'This Drawmory is already complete.');
  }
  if (handoff.journey_status === 'RESERVED') {
    throw new HttpError(409, 'JOURNEY_RESERVED', 'Someone else is carrying this Drawmory.');
  }
  if (handoff.status !== 'READY') {
    throw new HttpError(409, 'HANDOFF_USED', 'This invitation has already been used.');
  }
  const expectedStatus = handoff.mode === 'PRIVATE' ? 'AVAILABLE_PRIVATE' : 'AVAILABLE_WORLD';
  if (handoff.journey_status !== expectedStatus) {
    throw new HttpError(409, 'HANDOFF_UNAVAILABLE', 'This Drawmory is not available here anymore.');
  }

  return {
    publicSlug: handoff.public_slug,
    redrawCount: handoff.redraw_count,
    targetRedraws: handoff.target_redraws,
    expiresAt: handoff.expires_at,
    mode: handoff.mode === 'PRIVATE' ? 'PRIVATE' : 'WORLD',
  };
}

export async function claimHandoff(secret: { token?: string; code?: string }) {
  await ensureSchema();
  const handoff = await findHandoff(secret);
  if (!handoff) {
    throw new HttpError(404, 'INVALID_HANDOFF', 'This Drawmory link or code is invalid.');
  }
  if (handoff.expires_at && handoff.expires_at <= Date.now()) {
    throw new HttpError(410, 'HANDOFF_EXPIRED', 'This invitation has expired.');
  }
  if (handoff.status !== 'READY') {
    throw new HttpError(409, 'HANDOFF_USED', 'Someone else already carried this Drawmory.');
  }

  const expectedStatus = handoff.mode === 'PRIVATE' ? 'AVAILABLE_PRIVATE' : 'AVAILABLE_WORLD';
  if (handoff.journey_status !== expectedStatus) {
    throw new HttpError(
      409,
      handoff.journey_status === 'RESERVED' ? 'JOURNEY_RESERVED' : 'HANDOFF_UNAVAILABLE',
      handoff.journey_status === 'RESERVED'
        ? 'Someone else is carrying this Drawmory.'
        : 'This Drawmory is no longer available here.',
    );
  }

  const now = Date.now();
  const claimId = randomId('clm');
  const sessionToken = randomToken();
  const sessionHash = await hashToken(sessionToken);
  const reservationExpiresAt = now + SERVER_CONFIG.claimSeconds * 1000;
  const database = getDatabase();
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO claims (
          id, journey_id, handoff_id, session_token_hash, reveal_started_at,
          reservation_expires_at, submitted_at, cancelled_at, cancel_reason, created_at
        )
        SELECT ?, j.id, h.id, ?, NULL, ?, NULL, NULL, NULL, ?
        FROM journeys j JOIN handoffs h ON h.journey_id = j.id
        WHERE j.id = ? AND h.id = ? AND j.status = ? AND j.flagged = 0
          AND h.status = 'READY' AND (h.expires_at IS NULL OR h.expires_at > ?)`,
      )
      .bind(
        claimId,
        sessionHash,
        reservationExpiresAt,
        now,
        handoff.journey_id,
        handoff.id,
        expectedStatus,
        now,
      ),
    database
      .prepare(
        `UPDATE journeys
         SET status = 'RESERVED', previous_available_state = ?, reservation_expires_at = ?, updated_at = ?
         WHERE id = ? AND status = ? AND EXISTS (SELECT 1 FROM claims WHERE id = ?)`,
      )
      .bind(expectedStatus, reservationExpiresAt, now, handoff.journey_id, expectedStatus, claimId),
    database
      .prepare(
        `UPDATE handoffs SET status = 'CLAIMED', claimed_at = ?
         WHERE journey_id = ? AND status = 'READY' AND EXISTS (SELECT 1 FROM claims WHERE id = ?)`,
      )
      .bind(now, handoff.journey_id, claimId),
  ]);

  if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
    throw new HttpError(409, 'JOURNEY_RESERVED', 'Someone else claimed this Drawmory first.');
  }

  return {
    claimId,
    sessionToken,
    reservationExpiresAt,
    revealSeconds: SERVER_CONFIG.revealSeconds,
    redrawSeconds: SERVER_CONFIG.redrawSeconds,
    confirmationSeconds: SERVER_CONFIG.confirmationSeconds,
  };
}

export function claimCookie(claimId: string, sessionToken: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = Math.max(
    SERVER_CONFIG.claimSeconds,
    SERVER_CONFIG.revealSeconds + SERVER_CONFIG.redrawSeconds +
      SERVER_CONFIG.confirmationSeconds + SERVER_CONFIG.locationSeconds,
  ) + 60;
  return `dm_claim=${claimId}.${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function readClaimCookie(request: Request, claimId: string) {
  const cookie = request.headers.get('cookie') ?? '';
  const value = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('dm_claim='))
    ?.slice('dm_claim='.length);
  if (!value) return null;
  const separator = value.indexOf('.');
  if (separator < 1) return null;
  const cookieClaimId = value.slice(0, separator);
  const token = value.slice(separator + 1);
  return cookieClaimId === claimId && token ? token : null;
}

async function authenticatedClaim(request: Request, claimId: string) {
  const token = readClaimCookie(request, claimId);
  if (!token) {
    throw new HttpError(401, 'CLAIM_SESSION_MISSING', 'This carrier session is not available on this device.');
  }
  const tokenHash = await hashToken(token);
  const row = await getDatabase()
    .prepare(
      `SELECT c.*, j.public_slug, j.status AS journey_status, j.target_redraws,
              j.redraw_count, j.current_drawing_id, j.reservation_expires_at AS journey_expires_at,
              j.handoff_mode, d.storage_path, d.mime_type, d.country_code, d.city,
              d.latitude, d.longitude, d.location_precision,
              cd.drawing_id AS draft_drawing_id, cd.storage_path AS draft_storage_path,
              cd.mime_type AS draft_mime_type, cd.width AS draft_width,
              cd.height AS draft_height, cd.byte_size AS draft_byte_size,
              cd.sha256 AS draft_sha256, cd.validated_at AS draft_validated_at
       FROM claims c JOIN journeys j ON j.id = c.journey_id
       JOIN drawings d ON d.id = j.current_drawing_id
       LEFT JOIN claim_drafts cd ON cd.claim_id = c.id
       WHERE c.id = ? AND c.session_token_hash = ?`,
    )
    .bind(claimId, tokenHash)
    .first<
      ClaimRow & {
        public_slug: string;
        journey_status: JourneyStatus;
        target_redraws: number;
        redraw_count: number;
        current_drawing_id: string;
        journey_expires_at: number | null;
        storage_path: string;
        mime_type: 'image/png' | 'image/webp';
        handoff_mode: 'PRIVATE' | 'WORLD' | null;
        country_code: string;
        city: string | null;
        latitude: number | null;
        longitude: number | null;
        location_precision: JourneyLocation['locationPrecision'];
        draft_drawing_id: string | null;
        draft_storage_path: string | null;
        draft_mime_type: 'image/png' | 'image/webp' | null;
        draft_width: number | null;
        draft_height: number | null;
        draft_byte_size: number | null;
        draft_sha256: string | null;
        draft_validated_at: number | null;
      }
    >();
  if (!row) {
    throw new HttpError(401, 'CLAIM_SESSION_INVALID', 'This carrier session is invalid.');
  }
  return row;
}

function phaseForClaim(claim: ClaimRow & { journey_status?: JourneyStatus; draft_drawing_id?: string | null }) {
  const now = Date.now();
  if (claim.submitted_at) return 'submitted' as const;
  if (claim.cancelled_at || (claim.journey_status && claim.journey_status !== 'RESERVED')) {
    return 'expired' as const;
  }
  if (claim.reservation_expires_at <= now) return 'expired' as const;
  if (claim.draft_drawing_id) return 'location' as const;
  if (!claim.reveal_started_at) return 'ready' as const;
  const deadlines = claimDeadlines(claim);
  if ((deadlines.observationEndsAt ?? 0) > now) {
    return 'observing' as const;
  }
  if ((deadlines.drawingExpiresAt ?? 0) > now) return 'drawing' as const;
  if ((deadlines.confirmationExpiresAt ?? 0) > now) return 'confirming' as const;
  return 'expired' as const;
}

export async function getClaimState(request: Request, claimId: string) {
  await ensureSchema();
  let claim = await authenticatedClaim(request, claimId);
  const preliminaryPhase = phaseForClaim(claim);
  if (preliminaryPhase === 'expired' && !claim.submitted_at && !claim.cancelled_at) {
    await releaseExpiredJourney(claim.journey_id);
    claim = await authenticatedClaim(request, claimId);
  }
  const phase = phaseForClaim(claim);
  const deadlines = claimDeadlines(claim);
  return {
    claimId: claim.id,
    journeyId: claim.journey_id,
    publicSlug: claim.public_slug,
    phase,
    redrawCount: claim.redraw_count,
    targetRedraws: claim.target_redraws,
    revealStartedAt: claim.reveal_started_at,
    revealSeconds: SERVER_CONFIG.revealSeconds,
    redrawSeconds: SERVER_CONFIG.redrawSeconds,
    confirmationSeconds: SERVER_CONFIG.confirmationSeconds,
    reservationExpiresAt: claim.reservation_expires_at,
    observationEndsAt: deadlines.observationEndsAt,
    drawingExpiresAt: deadlines.drawingExpiresAt,
    confirmationExpiresAt: deadlines.confirmationExpiresAt,
    imageUrl: phase === 'observing' ? `/api/claims/${claim.id}/image` : null,
  };
}

export async function startReveal(request: Request, claimId: string) {
  await ensureSchema();
  const claim = await authenticatedClaim(request, claimId);
  const now = Date.now();
  if (claim.submitted_at) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'This contribution was already submitted.');
  }
  if (claim.cancelled_at || claim.journey_status !== 'RESERVED') {
    throw new HttpError(410, 'RESERVATION_EXPIRED', 'Your temporary reservation expired.');
  }
  if (claim.reservation_expires_at <= now) {
    await releaseExpiredJourney(claim.journey_id);
    throw new HttpError(410, 'RESERVATION_EXPIRED', 'Your temporary reservation expired.');
  }
  const lifecycleExpiresAt = now + (
    SERVER_CONFIG.revealSeconds + SERVER_CONFIG.redrawSeconds + SERVER_CONFIG.confirmationSeconds
  ) * 1000;
  await getDatabase().batch([
    getDatabase()
      .prepare(
        `UPDATE claims
         SET reveal_started_at = ?, reservation_expires_at = ?
         WHERE id = ? AND reveal_started_at IS NULL AND submitted_at IS NULL
           AND cancelled_at IS NULL AND reservation_expires_at > ?`,
      )
      .bind(now, lifecycleExpiresAt, claimId, now),
    getDatabase()
      .prepare(
        `UPDATE journeys
         SET reservation_expires_at = (
           SELECT reservation_expires_at FROM claims WHERE id = ?
         ), updated_at = ?
         WHERE id = ? AND status = 'RESERVED'
           AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND reveal_started_at IS NOT NULL)`,
      )
      .bind(claimId, now, claim.journey_id, claimId),
  ]);
  return getClaimState(request, claimId);
}

export async function getClaimImage(request: Request, claimId: string) {
  await ensureSchema();
  const claim = await authenticatedClaim(request, claimId);
  if (phaseForClaim(claim) !== 'observing') {
    throw new HttpError(410, 'OBSERVATION_ENDED', 'The one-time observation has ended.');
  }
  const object = await getFiles().get(claim.storage_path);
  if (!object) {
    throw new HttpError(404, 'DRAWING_MISSING', 'The drawing could not be found.');
  }
  return { body: object.body, mimeType: claim.mime_type };
}

export async function validateClaimDrawing(
  request: Request,
  claimId: string,
  imageDataUrl: string,
) {
  await ensureSchema();
  const claim = await authenticatedClaim(request, claimId);
  const now = Date.now();
  if (claim.submitted_at) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'This contribution was already submitted.');
  }
  if (claim.draft_drawing_id) {
    return getClaimState(request, claimId);
  }
  if (claim.cancelled_at || claim.journey_status !== 'RESERVED') {
    throw new HttpError(410, 'RESERVATION_EXPIRED', 'Your temporary reservation expired.');
  }
  const deadlines = claimDeadlines(claim);
  if (claim.reservation_expires_at <= now || (deadlines.confirmationExpiresAt ?? 0) <= now) {
    await releaseExpiredJourney(claim.journey_id);
    throw new HttpError(410, 'RESERVATION_EXPIRED', 'Your temporary reservation expired.');
  }
  if (!claim.reveal_started_at) {
    throw new HttpError(409, 'REVEAL_NOT_STARTED', 'View the drawing before redrawing it.');
  }
  if ((deadlines.observationEndsAt ?? 0) > now) {
    throw new HttpError(409, 'REVEAL_IN_PROGRESS', 'Wait until the observation ends before submitting.');
  }

  const image = await validateDataImage(imageDataUrl);
  const stepIndex = claim.redraw_count + 1;
  const drawingId = randomId('drw');
  const storagePath = `journeys/${claim.journey_id}/${stepIndex}-${drawingId}.${image.extension}`;
  const locationExpiresAt = now + SERVER_CONFIG.locationSeconds * 1000;

  await getFiles().put(storagePath, image.bytes, {
    httpMetadata: { contentType: image.mimeType },
    customMetadata: { sha256: image.sha256 },
  });

  try {
    const database = getDatabase();
    const results = await database.batch([
      database
        .prepare(
          `INSERT OR IGNORE INTO claim_drafts (
            claim_id, journey_id, drawing_id, storage_path, mime_type, width,
            height, byte_size, sha256, validated_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM claims c JOIN journeys j ON j.id = c.journey_id
            WHERE c.id = ? AND c.submitted_at IS NULL AND c.cancelled_at IS NULL
              AND c.reservation_expires_at > ? AND c.reveal_started_at IS NOT NULL
              AND c.reveal_started_at + ? > ? AND j.status = 'RESERVED'
          )`,
        )
        .bind(
          claimId,
          claim.journey_id,
          drawingId,
          storagePath,
          image.mimeType,
          image.width,
          image.height,
          image.bytes.byteLength,
          image.sha256,
          now,
          claimId,
          now,
          (SERVER_CONFIG.revealSeconds + SERVER_CONFIG.redrawSeconds +
            SERVER_CONFIG.confirmationSeconds) * 1000,
          now,
        ),
      database
        .prepare(
          `UPDATE claims SET reservation_expires_at = ?
           WHERE id = ? AND submitted_at IS NULL AND cancelled_at IS NULL
             AND EXISTS (SELECT 1 FROM claim_drafts WHERE claim_id = ?)`,
        )
        .bind(locationExpiresAt, claimId, claimId),
      database
        .prepare(
          `UPDATE journeys SET reservation_expires_at = ?, updated_at = ?
           WHERE id = ? AND status = 'RESERVED'
             AND EXISTS (SELECT 1 FROM claim_drafts WHERE claim_id = ?)`,
        )
        .bind(locationExpiresAt, now, claim.journey_id, claimId),
    ]);

    if (changes(results[0]) !== 1) {
      const existing = await database
        .prepare(`SELECT claim_id FROM claim_drafts WHERE claim_id = ?`)
        .bind(claimId)
        .first<{ claim_id: string }>();
      await getFiles().delete(storagePath);
      if (existing) return getClaimState(request, claimId);
      throw new HttpError(409, 'VALIDATION_UNAVAILABLE', 'The validation window has ended.');
    }
  } catch (error) {
    const persisted = await getDatabase()
      .prepare(`SELECT claim_id FROM claim_drafts WHERE claim_id = ? AND storage_path = ?`)
      .bind(claimId, storagePath)
      .first<{ claim_id: string }>();
    if (!persisted) await getFiles().delete(storagePath);
    throw error;
  }

  return getClaimState(request, claimId);
}

export async function submitRedraw(
  request: Request,
  claimId: string,
  location?: DrawingLocationInput | null,
) {
  await ensureSchema();
  const claim = await authenticatedClaim(request, claimId);
  const now = Date.now();
  if (claim.submitted_at) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'This contribution was already submitted.');
  }
  if (claim.cancelled_at || claim.journey_status !== 'RESERVED' || claim.reservation_expires_at <= now) {
    await releaseExpiredJourney(claim.journey_id);
    throw new HttpError(410, 'RESERVATION_EXPIRED', 'Your temporary reservation expired.');
  }
  if (
    !claim.draft_drawing_id || !claim.draft_storage_path || !claim.draft_mime_type ||
    claim.draft_width == null || claim.draft_height == null || claim.draft_byte_size == null ||
    !claim.draft_sha256
  ) {
    throw new HttpError(409, 'DRAWING_NOT_VALIDATED', 'Validate the drawing before adding its location.');
  }

  const stepIndex = claim.redraw_count + 1;
  const receiptId = randomId('rcp');
  const receiptToken = randomToken();
  const receiptHash = await hashToken(receiptToken);
  const drawingLocation = normalizeDrawingLocation(location, {
    countryCode: claim.country_code,
    city: claim.city,
    latitude: claim.latitude,
    longitude: claim.longitude,
    locationPrecision: claim.location_precision,
  });
  const completed = claim.target_redraws >= 0 && stepIndex >= claim.target_redraws;
  const autoForwarded = !completed && claim.handoff_mode === 'WORLD';
  const nextStatus: JourneyStatus = completed
    ? 'COMPLETED'
    : autoForwarded
      ? 'AVAILABLE_WORLD'
      : 'AWAITING_HANDOFF';
  const nextHandoffMode = autoForwarded ? 'WORLD' : null;
  const database = getDatabase();
  const results = await database.batch([
    database
      .prepare(
        `INSERT INTO drawings (
          id, journey_id, step_index, storage_path, mime_type, width, height,
          byte_size, sha256, country_code, city, latitude, longitude,
          location_precision, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM claims c JOIN journeys j ON j.id = c.journey_id
          JOIN claim_drafts cd ON cd.claim_id = c.id
          WHERE c.id = ? AND c.submitted_at IS NULL AND c.cancelled_at IS NULL
            AND c.reservation_expires_at > ? AND j.status = 'RESERVED'
            AND cd.drawing_id = ?
        )`,
      )
      .bind(
        claim.draft_drawing_id,
        claim.journey_id,
        stepIndex,
        claim.draft_storage_path,
        claim.draft_mime_type,
        claim.draft_width,
        claim.draft_height,
        claim.draft_byte_size,
        claim.draft_sha256,
        drawingLocation.countryCode,
        drawingLocation.city,
        drawingLocation.latitude,
        drawingLocation.longitude,
        drawingLocation.locationPrecision,
        now,
        claimId,
        now,
        claim.draft_drawing_id,
      ),
    database
      .prepare(
        `INSERT INTO receipts (id, journey_id, step_index, token_hash, created_at)
         SELECT ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM drawings WHERE id = ?)`,
      )
      .bind(receiptId, claim.journey_id, stepIndex, receiptHash, now, claim.draft_drawing_id),
    database
      .prepare(
        `UPDATE claims SET submitted_at = ?
         WHERE id = ? AND submitted_at IS NULL AND cancelled_at IS NULL
           AND EXISTS (SELECT 1 FROM drawings WHERE id = ?)`,
      )
      .bind(now, claimId, claim.draft_drawing_id),
    database
      .prepare(
        `UPDATE journeys
         SET redraw_count = ?, current_drawing_id = ?, status = ?, updated_at = ?,
             completed_at = ?, reservation_expires_at = NULL,
             previous_available_state = NULL, handoff_mode = ?
         WHERE id = ? AND status = 'RESERVED'
           AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND submitted_at = ?)`,
      )
      .bind(
        stepIndex,
        claim.draft_drawing_id,
        nextStatus,
        now,
        completed ? now : null,
        nextHandoffMode,
        claim.journey_id,
        claimId,
        now,
      ),
    database
      .prepare(
        `DELETE FROM claim_drafts WHERE claim_id = ?
         AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND submitted_at = ?)`,
      )
      .bind(claimId, claimId, now),
  ]);

  if (results.some((result) => changes(result) !== 1)) {
    throw new Error('The contribution could not be committed atomically.');
  }

  return {
    journeyId: claim.journey_id,
    publicSlug: claim.public_slug,
    receiptToken,
    completed,
    autoForwarded,
    redrawCount: stepIndex,
    targetRedraws: claim.target_redraws,
  };
}

export async function abandonExpiredClaim(request: Request, claimId: string) {
  await ensureSchema();
  const claim = await authenticatedClaim(request, claimId);
  if (claim.submitted_at) return { released: false, submitted: true };
  if (claim.cancelled_at) return { released: true };
  const deadlines = claimDeadlines(claim);
  const releaseDeadline = claim.draft_drawing_id
    ? claim.reservation_expires_at
    : deadlines.confirmationExpiresAt;
  if (!releaseDeadline || releaseDeadline > Date.now()) {
    throw new HttpError(409, 'CONFIRMATION_ACTIVE', 'The confirmation window is still active.');
  }
  const released = await releaseExpiredJourney(claim.journey_id);
  return { released };
}

export async function getReceipt(receiptToken: string) {
  await ensureSchema();
  const tokenHash = await hashToken(receiptToken);
  let result = await getDatabase()
    .prepare(
      `SELECT r.step_index, r.created_at AS receipt_created_at, j.*
       FROM receipts r JOIN journeys j ON j.id = r.journey_id
       WHERE r.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<JourneyRow & { step_index: number; receipt_created_at: number }>();
  if (!result) {
    throw new HttpError(404, 'RECEIPT_NOT_FOUND', 'This contribution link is invalid.');
  }
  if (result.status === 'RESERVED' && (result.reservation_expires_at ?? 0) <= Date.now()) {
    await releaseExpiredJourney(result.id);
    result = await getDatabase()
      .prepare(
        `SELECT r.step_index, r.created_at AS receipt_created_at, j.*
         FROM receipts r JOIN journeys j ON j.id = r.journey_id
         WHERE r.token_hash = ?`,
      )
      .bind(tokenHash)
      .first<typeof result>();
  }
  if (!result) {
    throw new HttpError(404, 'RECEIPT_NOT_FOUND', 'This contribution link is invalid.');
  }

  return {
    journeyId: result.id,
    publicSlug: result.public_slug,
    status: result.status,
    targetRedraws: result.target_redraws,
    redrawCount: result.redraw_count,
    contributionStep: result.step_index,
    canPass: result.step_index === result.redraw_count && result.status === 'AWAITING_HANDOFF',
    completedAt: result.completed_at,
  };
}

export async function listPublicJourneys(options: {
  status: PublicJourneyFilter;
  sort: PublicJourneySort;
  limit: number;
}) {
  await ensureSchema();
  await releaseAllExpiredJourneys();

  const statusClause =
    options.status === 'completed'
      ? `AND j.status = 'COMPLETED'`
      : options.status === 'in_progress'
        ? `AND j.status != 'COMPLETED'`
        : '';
  const orderClause: Record<PublicJourneySort, string> = {
    random: 'RANDOM()',
    newest: 'j.created_at DESC',
    oldest: 'j.created_at ASC',
    progress:
      'CAST(j.redraw_count AS REAL) / CASE WHEN j.target_redraws < 0 THEN j.redraw_count + 1 WHEN j.target_redraws = 0 THEN 1 ELSE j.target_redraws END DESC, j.updated_at DESC',
    votes: 'vote_count DESC, j.completed_at DESC, j.created_at DESC',
    distance: 'j.updated_at DESC',
  };

  type ListRow = {
    public_slug: string;
    id: string;
    status: JourneyStatus;
    target_redraws: number;
    redraw_count: number;
    created_at: number;
    updated_at: number;
    completed_at: number | null;
    current_drawing_id: string | null;
    vote_count: number;
  };

  const database = getDatabase();
  const listStatement = database.prepare(
    `SELECT j.id, j.public_slug, j.status, j.target_redraws, j.redraw_count,
            j.created_at, j.updated_at, j.completed_at, j.current_drawing_id,
            COUNT(v.id) AS vote_count
     FROM journeys j
     LEFT JOIN journey_votes v ON v.journey_id = j.id
     WHERE j.flagged = 0 AND j.status != 'EXPIRED' ${statusClause}
     GROUP BY j.id
     ORDER BY ${orderClause[options.sort]}
     ${options.sort === 'distance' ? '' : 'LIMIT ?'}`,
  );
  const rows = options.sort === 'distance'
    ? await listStatement.all<ListRow>()
    : await listStatement.bind(options.limit).all<ListRow>();

  if (rows.results.length === 0) return [];

  const distanceRows = options.sort === 'distance'
    ? await database
        .prepare(
          `SELECT d.journey_id, d.step_index, d.latitude, d.longitude, d.location_precision
           FROM drawings d
           JOIN journeys j ON j.id = d.journey_id
           WHERE j.flagged = 0 AND j.status != 'EXPIRED' ${statusClause}
           ORDER BY d.journey_id, d.step_index ASC`,
        )
        .all<Pick<DrawingRow, 'journey_id' | 'step_index' | 'latitude' | 'longitude' | 'location_precision'>>()
    : await database
        .prepare(
          `SELECT journey_id, step_index, latitude, longitude, location_precision
           FROM drawings
           WHERE journey_id IN (${rows.results.map(() => '?').join(', ')})
           ORDER BY journey_id, step_index ASC`,
        )
        .bind(...rows.results.map((journey) => journey.id))
        .all<Pick<DrawingRow, 'journey_id' | 'step_index' | 'latitude' | 'longitude' | 'location_precision'>>();

  const pointsByJourney = new Map<string, typeof distanceRows.results>();
  for (const point of distanceRows.results) {
    const current = pointsByJourney.get(point.journey_id) ?? [];
    current.push(point);
    pointsByJourney.set(point.journey_id, current);
  }
  const distancesByJourney = new Map(
    rows.results.map((journey) => [
      journey.id,
      measureJourney(
        (pointsByJourney.get(journey.id) ?? []).map((point) => ({
          latitude: point.latitude,
          longitude: point.longitude,
          locationPrecision: point.location_precision,
        })),
      ),
    ]),
  );

  const selectedRows = options.sort === 'distance'
    ? [...rows.results]
        .sort((left, right) => {
          const leftDistance = distancesByJourney.get(left.id)?.distanceKm ?? null;
          const rightDistance = distancesByJourney.get(right.id)?.distanceKm ?? null;
          if (leftDistance == null && rightDistance == null) return right.updated_at - left.updated_at;
          if (leftDistance == null) return 1;
          if (rightDistance == null) return -1;
          return rightDistance - leftDistance || right.updated_at - left.updated_at;
        })
        .slice(0, options.limit)
    : rows.results;

  const placeholders = selectedRows.map(() => '?').join(', ');
  const previewRows = await database
    .prepare(
      `SELECT id, journey_id, step_index, country_code, city, latitude, longitude,
              location_precision, created_at
       FROM (
         SELECT id, journey_id, step_index, country_code, city, latitude, longitude,
                location_precision, created_at,
                ROW_NUMBER() OVER (PARTITION BY journey_id ORDER BY step_index DESC) AS preview_rank
         FROM drawings WHERE journey_id IN (${placeholders})
       )
       WHERE preview_rank <= 20 OR step_index = 0
       ORDER BY journey_id, step_index ASC`,
    )
    .bind(...selectedRows.map((journey) => journey.id))
    .all<Pick<
      DrawingRow,
      | 'id'
      | 'journey_id'
      | 'step_index'
      | 'country_code'
      | 'city'
      | 'latitude'
      | 'longitude'
      | 'location_precision'
      | 'created_at'
    >>();
  const previewsByJourney = new Map<string, typeof previewRows.results>();
  for (const drawing of previewRows.results) {
    const current = previewsByJourney.get(drawing.journey_id) ?? [];
    current.push(drawing);
    previewsByJourney.set(drawing.journey_id, current);
  }

  return selectedRows.map((journey) => {
    const drawingPreviews = (previewsByJourney.get(journey.id) ?? []).map((drawing) => ({
      id: drawing.id,
      stepIndex: drawing.step_index,
      countryCode: drawing.country_code,
      city: drawing.city,
      latitude: drawing.latitude,
      longitude: drawing.longitude,
      locationPrecision: drawing.location_precision,
      createdAt: drawing.created_at,
      imageUrl: `/api/public/journeys/${encodeURIComponent(journey.public_slug)}/drawings/${encodeURIComponent(drawing.id)}`,
    }));
    const distance = distancesByJourney.get(journey.id) ?? { distanceKm: null, approximate: false };
    return {
      publicSlug: journey.public_slug,
      status: journey.status,
      targetRedraws: journey.target_redraws,
      redrawCount: journey.redraw_count,
      participantCount: journey.redraw_count + 1,
      createdAt: journey.created_at,
      updatedAt: journey.updated_at,
      completedAt: journey.completed_at,
      voteCount: Number(journey.vote_count),
      distanceKm: distance.distanceKm,
      distanceApproximate: distance.approximate,
      coverImageUrl:
        journey.current_drawing_id
          ? `/api/public/journeys/${encodeURIComponent(journey.public_slug)}/drawings/${encodeURIComponent(journey.current_drawing_id)}`
          : null,
      drawingPreviews,
    };
  });
}

export async function voteForJourney(publicSlug: string, voterToken: string) {
  await ensureSchema();
  const database = getDatabase();
  const journey = await database
    .prepare(
      `SELECT id FROM journeys
       WHERE public_slug = ? AND status != 'EXPIRED' AND flagged = 0`,
    )
    .bind(publicSlug)
    .first<{ id: string }>();
  if (!journey) {
    throw new HttpError(404, 'VOTING_UNAVAILABLE', 'This Drawmory is not open for voting.');
  }

  const voterHash = await hashToken(voterToken);
  const inserted = await database
    .prepare(
      `INSERT OR IGNORE INTO journey_votes (id, journey_id, voter_hash, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(randomId('vot'), journey.id, voterHash, Date.now())
    .run();
  const count = await database
    .prepare(`SELECT COUNT(*) AS vote_count FROM journey_votes WHERE journey_id = ?`)
    .bind(journey.id)
    .first<{ vote_count: number }>();

  return {
    voteCount: Number(count?.vote_count ?? 0),
    accepted: changes(inserted) === 1,
    voted: true,
  };
}

export async function getPublicJourney(publicSlug: string) {
  await ensureSchema();
  let journey = await getDatabase()
    .prepare(`SELECT * FROM journeys WHERE public_slug = ?`)
    .bind(publicSlug)
    .first<JourneyRow>();
  if (!journey) {
    throw new HttpError(404, 'JOURNEY_NOT_FOUND', 'This Drawmory could not be found.');
  }
  if (journey.status === 'RESERVED' && (journey.reservation_expires_at ?? 0) <= Date.now()) {
    await releaseExpiredJourney(journey.id);
    journey = await getDatabase()
      .prepare(`SELECT * FROM journeys WHERE public_slug = ?`)
      .bind(publicSlug)
      .first<JourneyRow>();
  }
  if (!journey) {
    throw new HttpError(404, 'JOURNEY_NOT_FOUND', 'This Drawmory could not be found.');
  }
  if (journey.flagged || journey.status === 'EXPIRED') {
    throw new HttpError(404, 'JOURNEY_NOT_FOUND', 'This Drawmory could not be found.');
  }

  const drawings = (
    await getDatabase()
      .prepare(
        `SELECT id, step_index, country_code, city, latitude, longitude,
                location_precision, created_at, width, height
         FROM drawings WHERE journey_id = ? ORDER BY step_index ASC`,
      )
      .bind(journey.id)
      .all<Pick<
        DrawingRow,
        | 'id'
        | 'step_index'
        | 'country_code'
        | 'city'
        | 'latitude'
        | 'longitude'
        | 'location_precision'
        | 'created_at'
        | 'width'
        | 'height'
      >>()
  ).results.map((drawing) => ({
          id: drawing.id,
          stepIndex: drawing.step_index,
          countryCode: drawing.country_code,
          city: drawing.city,
          latitude: drawing.latitude,
          longitude: drawing.longitude,
          locationPrecision: drawing.location_precision,
          createdAt: drawing.created_at,
          width: drawing.width,
          height: drawing.height,
          imageUrl: `/api/public/journeys/${encodeURIComponent(publicSlug)}/drawings/${drawing.id}`,
        }));

  const countryCount = new Set(
    drawings.map((drawing) => drawing.countryCode).filter((country) => country !== 'UNKNOWN'),
  ).size;
  const votes = await getDatabase()
    .prepare(`SELECT COUNT(*) AS vote_count FROM journey_votes WHERE journey_id = ?`)
    .bind(journey.id)
    .first<{ vote_count: number }>();

  return {
    publicSlug: journey.public_slug,
    status: journey.status,
    targetRedraws: journey.target_redraws,
    redrawCount: journey.redraw_count,
    participantCount: journey.redraw_count + 1,
    createdAt: journey.created_at,
    completedAt: journey.completed_at,
    countryCount,
    voteCount: Number(votes?.vote_count ?? 0),
    drawings,
  };
}

export async function getPublicDrawing(publicSlug: string, drawingId: string) {
  await ensureSchema();
  const drawing = await getDatabase()
    .prepare(
      `SELECT d.* FROM drawings d JOIN journeys j ON j.id = d.journey_id
       WHERE j.public_slug = ? AND j.status != 'EXPIRED' AND j.flagged = 0 AND d.id = ?`,
    )
    .bind(publicSlug, drawingId)
    .first<DrawingRow>();
  if (!drawing) {
    throw new HttpError(404, 'DRAWING_NOT_FOUND', 'This drawing is not available.');
  }
  const object = await getFiles().get(drawing.storage_path);
  if (!object) {
    throw new HttpError(404, 'DRAWING_MISSING', 'The drawing could not be found.');
  }
  return { body: object.body, mimeType: drawing.mime_type };
}

export async function reportClaim(request: Request, claimId: string) {
  await ensureSchema();
  const claim = await authenticatedClaim(request, claimId);
  const now = Date.now();
  if (claim.submitted_at) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'This carrier session is already closed.');
  }
  await getDatabase().batch([
    getDatabase()
      .prepare(
        `UPDATE journeys SET flagged = 1, status = 'EXPIRED', updated_at = ?,
         reservation_expires_at = NULL, previous_available_state = NULL WHERE id = ?`,
      )
      .bind(now, claim.journey_id),
    getDatabase()
      .prepare(`UPDATE claims SET submitted_at = ? WHERE id = ? AND submitted_at IS NULL`)
      .bind(now, claimId),
    getDatabase()
      .prepare(`UPDATE handoffs SET status = 'REPORTED' WHERE journey_id = ?`)
      .bind(claim.journey_id),
    getDatabase()
      .prepare(`DELETE FROM claim_drafts WHERE claim_id = ?`)
      .bind(claimId),
  ]);
  if (claim.draft_storage_path) {
    await getFiles().delete(claim.draft_storage_path);
  }
  return { reported: true };
}
