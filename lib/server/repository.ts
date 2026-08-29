import { SERVER_CONFIG } from './config';
import { ensureSchema, getDatabase, getFiles } from './database';
import { validateDataImage } from './image';
import { hashToken, normalizeCode, randomCode, randomId, randomSlug, randomToken } from './tokens';

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
  handoff_mode: string | null;
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
  created_at: number;
};

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

function countryFromRequest(request: Request) {
  const raw =
    request.headers.get('x-vercel-ip-country') ??
    request.headers.get('cf-ipcountry') ??
    request.headers.get('x-country-code') ??
    'UNKNOWN';
  const country = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : 'UNKNOWN';
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
  await database.batch([
    database
      .prepare(
        `UPDATE journeys
         SET status = ?, reservation_expires_at = NULL, previous_available_state = NULL, updated_at = ?
         WHERE id = ? AND status = 'RESERVED' AND reservation_expires_at <= ?`,
      )
      .bind(restored, now, journeyId, now),
    database
      .prepare(
        `UPDATE handoffs SET status = 'READY', claimed_at = NULL
         WHERE id = (
           SELECT handoff_id FROM claims WHERE journey_id = ? ORDER BY created_at DESC LIMIT 1
         ) AND mode = 'PRIVATE'`,
      )
      .bind(journeyId),
  ]);
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

export async function createJourney(request: Request, imageDataUrl: string, targetRedraws: number) {
  await ensureSchema();
  if (targetRedraws !== 3 && targetRedraws !== 5) {
    throw new HttpError(400, 'INVALID_LENGTH', 'Choose a journey of 3 or 5 redraws.');
  }

  const image = await validateDataImage(imageDataUrl);
  const now = Date.now();
  const journeyId = randomId('jny');
  const drawingId = randomId('drw');
  const receiptId = randomId('rcp');
  const receiptToken = randomToken();
  const receiptHash = await hashToken(receiptToken);
  const publicSlug = randomSlug();
  const storagePath = `journeys/${journeyId}/0-${drawingId}.${image.extension}`;
  const countryCode = countryFromRequest(request);

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
            byte_size, sha256, country_code, created_at
          ) VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          countryCode,
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

  return { journeyId, publicSlug, receiptToken, targetRedraws };
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
          reservation_expires_at, submitted_at, created_at
        )
        SELECT ?, j.id, h.id, ?, NULL, ?, NULL, ?
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
  };
}

export function claimCookie(claimId: string, sessionToken: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `dm_claim=${claimId}.${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SERVER_CONFIG.claimSeconds}${secure}`;
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
              d.storage_path, d.mime_type
       FROM claims c JOIN journeys j ON j.id = c.journey_id
       JOIN drawings d ON d.id = j.current_drawing_id
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
      }
    >();
  if (!row) {
    throw new HttpError(401, 'CLAIM_SESSION_INVALID', 'This carrier session is invalid.');
  }
  return row;
}

function phaseForClaim(claim: ClaimRow) {
  const now = Date.now();
  if (claim.submitted_at) return 'submitted' as const;
  if (claim.reservation_expires_at <= now) return 'expired' as const;
  if (!claim.reveal_started_at) return 'ready' as const;
  if (claim.reveal_started_at + SERVER_CONFIG.revealSeconds * 1000 > now) {
    return 'observing' as const;
  }
  return 'drawing' as const;
}

export async function getClaimState(request: Request, claimId: string) {
  await ensureSchema();
  let claim = await authenticatedClaim(request, claimId);
  if (claim.reservation_expires_at <= Date.now() && !claim.submitted_at) {
    await releaseExpiredJourney(claim.journey_id);
    claim = await authenticatedClaim(request, claimId);
  }
  const phase = phaseForClaim(claim);
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
    reservationExpiresAt: claim.reservation_expires_at,
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
  if (claim.reservation_expires_at <= now) {
    await releaseExpiredJourney(claim.journey_id);
    throw new HttpError(410, 'RESERVATION_EXPIRED', 'Your temporary reservation expired.');
  }
  await getDatabase()
    .prepare(
      `UPDATE claims SET reveal_started_at = COALESCE(reveal_started_at, ?)
       WHERE id = ? AND submitted_at IS NULL AND reservation_expires_at > ?`,
    )
    .bind(now, claimId, now)
    .run();
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

export async function submitRedraw(request: Request, claimId: string, imageDataUrl: string) {
  await ensureSchema();
  const claim = await authenticatedClaim(request, claimId);
  const now = Date.now();
  if (claim.submitted_at) {
    throw new HttpError(409, 'ALREADY_SUBMITTED', 'This contribution was already submitted.');
  }
  if (claim.reservation_expires_at <= now) {
    await releaseExpiredJourney(claim.journey_id);
    throw new HttpError(410, 'RESERVATION_EXPIRED', 'Your temporary reservation expired.');
  }
  if (!claim.reveal_started_at) {
    throw new HttpError(409, 'REVEAL_NOT_STARTED', 'View the drawing before redrawing it.');
  }
  if (claim.reveal_started_at + SERVER_CONFIG.revealSeconds * 1000 > now) {
    throw new HttpError(409, 'REVEAL_IN_PROGRESS', 'Wait until the observation ends before submitting.');
  }
  if (claim.journey_status !== 'RESERVED') {
    throw new HttpError(409, 'CLAIM_UNAVAILABLE', 'This Drawmory is no longer reserved for this session.');
  }

  const image = await validateDataImage(imageDataUrl);
  const stepIndex = claim.redraw_count + 1;
  const drawingId = randomId('drw');
  const receiptId = randomId('rcp');
  const receiptToken = randomToken();
  const receiptHash = await hashToken(receiptToken);
  const storagePath = `journeys/${claim.journey_id}/${stepIndex}-${drawingId}.${image.extension}`;
  const countryCode = countryFromRequest(request);
  const completed = stepIndex >= claim.target_redraws;
  const nextStatus: JourneyStatus = completed ? 'COMPLETED' : 'AWAITING_HANDOFF';

  await getFiles().put(storagePath, image.bytes, {
    httpMetadata: { contentType: image.mimeType },
    customMetadata: { sha256: image.sha256 },
  });

  try {
    const database = getDatabase();
    const results = await database.batch([
      database
        .prepare(
          `INSERT INTO drawings (
            id, journey_id, step_index, storage_path, mime_type, width, height,
            byte_size, sha256, country_code, created_at
          )
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM claims c JOIN journeys j ON j.id = c.journey_id
            WHERE c.id = ? AND c.submitted_at IS NULL AND c.reservation_expires_at > ?
              AND j.status = 'RESERVED'
          )`,
        )
        .bind(
          drawingId,
          claim.journey_id,
          stepIndex,
          storagePath,
          image.mimeType,
          image.width,
          image.height,
          image.bytes.byteLength,
          image.sha256,
          countryCode,
          now,
          claimId,
          now,
        ),
      database
        .prepare(
          `INSERT INTO receipts (id, journey_id, step_index, token_hash, created_at)
           SELECT ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM claims WHERE id = ? AND submitted_at IS NULL)`,
        )
        .bind(receiptId, claim.journey_id, stepIndex, receiptHash, now, claimId),
      database
        .prepare(
          `UPDATE claims SET submitted_at = ?
           WHERE id = ? AND submitted_at IS NULL AND reservation_expires_at > ?`,
        )
        .bind(now, claimId, now),
      database
        .prepare(
          `UPDATE journeys
           SET redraw_count = ?, current_drawing_id = ?, status = ?, updated_at = ?,
               completed_at = ?, reservation_expires_at = NULL,
               previous_available_state = NULL, handoff_mode = NULL
           WHERE id = ? AND status = 'RESERVED'
             AND EXISTS (SELECT 1 FROM claims WHERE id = ? AND submitted_at = ?)`,
        )
        .bind(
          stepIndex,
          drawingId,
          nextStatus,
          now,
          completed ? now : null,
          claim.journey_id,
          claimId,
          now,
        ),
    ]);

    if (results.some((result) => changes(result) !== 1)) {
      throw new Error('The contribution could not be committed atomically.');
    }
  } catch (error) {
    await getFiles().delete(storagePath);
    throw error;
  }

  return {
    journeyId: claim.journey_id,
    publicSlug: claim.public_slug,
    receiptToken,
    completed,
    redrawCount: stepIndex,
    targetRedraws: claim.target_redraws,
  };
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

  const drawings =
    journey.status === 'COMPLETED'
      ? (
          await getDatabase()
            .prepare(
              `SELECT id, step_index, country_code, created_at, width, height
               FROM drawings WHERE journey_id = ? ORDER BY step_index ASC`,
            )
            .bind(journey.id)
            .all<Pick<DrawingRow, 'id' | 'step_index' | 'country_code' | 'created_at' | 'width' | 'height'>>()
        ).results.map((drawing) => ({
          id: drawing.id,
          stepIndex: drawing.step_index,
          countryCode: drawing.country_code,
          createdAt: drawing.created_at,
          width: drawing.width,
          height: drawing.height,
          imageUrl: `/api/public/journeys/${encodeURIComponent(publicSlug)}/drawings/${drawing.id}`,
        }))
      : [];

  const countryCount = new Set(
    drawings.map((drawing) => drawing.countryCode).filter((country) => country !== 'UNKNOWN'),
  ).size;

  return {
    publicSlug: journey.public_slug,
    status: journey.status,
    targetRedraws: journey.target_redraws,
    redrawCount: journey.redraw_count,
    participantCount: journey.redraw_count + 1,
    createdAt: journey.created_at,
    completedAt: journey.completed_at,
    countryCount,
    drawings,
  };
}

export async function getPublicDrawing(publicSlug: string, drawingId: string) {
  await ensureSchema();
  const drawing = await getDatabase()
    .prepare(
      `SELECT d.* FROM drawings d JOIN journeys j ON j.id = d.journey_id
       WHERE j.public_slug = ? AND j.status = 'COMPLETED' AND d.id = ?`,
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
  ]);
  return { reported: true };
}
