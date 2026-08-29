import { ensureSchema, getDatabase, getFiles } from './database';
import { HttpError, type JourneyStatus } from './repository';
import { hashToken, randomId, randomToken } from './tokens';

type AdminJourneyRow = {
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
  vote_count: number;
  active_claim_id: string | null;
  active_claim_created_at: number | null;
  draft_validated_at: number | null;
};

function changes(result: D1Result<unknown>) {
  return Number(result.meta?.changes ?? 0);
}

function operationTime(expectedUpdatedAt: number) {
  return Math.max(Date.now(), expectedUpdatedAt + 1);
}

function safePaths(journeyId: string, paths: Array<string | null | undefined>) {
  const prefix = `journeys/${journeyId}/`;
  return [...new Set(paths.filter((path): path is string => Boolean(path?.startsWith(prefix))))];
}

async function deleteStoredPaths(journeyId: string, paths: Array<string | null | undefined>) {
  const safe = safePaths(journeyId, paths);
  if (safe.length === 0) return false;
  try {
    await getFiles().delete(safe);
    return false;
  } catch {
    return true;
  }
}

export async function listAdminJourneys() {
  await ensureSchema();
  const database = getDatabase();
  const rows = await database
    .prepare(
      `SELECT j.*,
              (SELECT COUNT(*) FROM journey_votes v WHERE v.journey_id = j.id) AS vote_count,
              (SELECT c.id FROM claims c
               WHERE c.journey_id = j.id AND c.submitted_at IS NULL AND c.cancelled_at IS NULL
               ORDER BY c.created_at DESC LIMIT 1) AS active_claim_id,
              (SELECT c.created_at FROM claims c
               WHERE c.journey_id = j.id AND c.submitted_at IS NULL AND c.cancelled_at IS NULL
               ORDER BY c.created_at DESC LIMIT 1) AS active_claim_created_at,
              (SELECT cd.validated_at FROM claim_drafts cd JOIN claims c ON c.id = cd.claim_id
               WHERE c.journey_id = j.id ORDER BY cd.validated_at DESC LIMIT 1) AS draft_validated_at
       FROM journeys j ORDER BY j.updated_at DESC LIMIT 100`,
    )
    .all<AdminJourneyRow>();

  if (rows.results.length === 0) return [];
  const placeholders = rows.results.map(() => '?').join(', ');
  const drawings = await database
    .prepare(
      `SELECT id, journey_id, step_index, created_at, country_code, city
       FROM drawings WHERE journey_id IN (${placeholders})
       ORDER BY journey_id, step_index ASC`,
    )
    .bind(...rows.results.map((journey) => journey.id))
    .all<{
      id: string;
      journey_id: string;
      step_index: number;
      created_at: number;
      country_code: string;
      city: string | null;
    }>();
  const drawingsByJourney = new Map<string, typeof drawings.results>();
  for (const drawing of drawings.results) {
    const list = drawingsByJourney.get(drawing.journey_id) ?? [];
    list.push(drawing);
    drawingsByJourney.set(drawing.journey_id, list);
  }

  return rows.results.map((journey) => ({
    id: journey.id,
    publicSlug: journey.public_slug,
    status: journey.status,
    targetRedraws: journey.target_redraws,
    redrawCount: journey.redraw_count,
    handoffMode: journey.handoff_mode,
    createdAt: journey.created_at,
    updatedAt: journey.updated_at,
    completedAt: journey.completed_at,
    reservationExpiresAt: journey.reservation_expires_at,
    flagged: Boolean(journey.flagged),
    voteCount: Number(journey.vote_count),
    activeClaim: journey.active_claim_id
      ? {
          id: journey.active_claim_id,
          createdAt: journey.active_claim_created_at,
          drawingValidated: Boolean(journey.draft_validated_at),
        }
      : null,
    drawings: (drawingsByJourney.get(journey.id) ?? []).map((drawing) => ({
      id: drawing.id,
      stepIndex: drawing.step_index,
      createdAt: drawing.created_at,
      countryCode: drawing.country_code,
      city: drawing.city,
      imageUrl: `/api/admin/drawings/${encodeURIComponent(drawing.id)}`,
    })),
  }));
}

export async function getAdminDrawing(drawingId: string) {
  await ensureSchema();
  const drawing = await getDatabase()
    .prepare(`SELECT storage_path, mime_type FROM drawings WHERE id = ?`)
    .bind(drawingId)
    .first<{ storage_path: string; mime_type: 'image/png' | 'image/webp' }>();
  if (!drawing) throw new HttpError(404, 'ADMIN_DRAWING_NOT_FOUND', 'This drawing no longer exists.');
  const object = await getFiles().get(drawing.storage_path);
  if (!object) throw new HttpError(404, 'ADMIN_DRAWING_MISSING', 'The drawing file is missing.');
  return { body: object.body, mimeType: drawing.mime_type };
}

export async function releaseAdminClaim(journeyId: string, expectedUpdatedAt: number) {
  await ensureSchema();
  const database = getDatabase();
  const journey = await database
    .prepare(`SELECT status, previous_available_state, updated_at FROM journeys WHERE id = ?`)
    .bind(journeyId)
    .first<{
      status: JourneyStatus;
      previous_available_state: JourneyStatus | null;
      updated_at: number;
    }>();
  if (!journey) throw new HttpError(404, 'ADMIN_JOURNEY_NOT_FOUND', 'This Drawmory no longer exists.');
  if (journey.updated_at !== expectedUpdatedAt) {
    throw new HttpError(409, 'ADMIN_STALE_VIEW', 'This Drawmory changed. Refresh before trying again.');
  }
  if (journey.status !== 'RESERVED') {
    throw new HttpError(409, 'ADMIN_NOT_RESERVED', 'There is no active attempt to release.');
  }
  const claim = await database
    .prepare(
      `SELECT c.id, c.handoff_id, cd.storage_path
       FROM claims c LEFT JOIN claim_drafts cd ON cd.claim_id = c.id
       WHERE c.journey_id = ? AND c.submitted_at IS NULL AND c.cancelled_at IS NULL
       ORDER BY c.created_at DESC LIMIT 1`,
    )
    .bind(journeyId)
    .first<{ id: string; handoff_id: string; storage_path: string | null }>();
  if (!claim) throw new HttpError(409, 'ADMIN_NO_ACTIVE_CLAIM', 'The active attempt could not be found.');

  const restored = journey.previous_available_state === 'AVAILABLE_PRIVATE'
    ? 'AVAILABLE_PRIVATE'
    : 'AVAILABLE_WORLD';
  const now = operationTime(expectedUpdatedAt);
  const results = await database.batch([
    database
      .prepare(
        `UPDATE journeys SET status = ?, reservation_expires_at = NULL,
          previous_available_state = NULL, updated_at = ?
         WHERE id = ? AND status = 'RESERVED' AND updated_at = ?`,
      )
      .bind(restored, now, journeyId, expectedUpdatedAt),
    database
      .prepare(
        `UPDATE claims SET cancelled_at = ?, cancel_reason = 'ADMIN_RELEASE'
         WHERE id = ? AND submitted_at IS NULL AND cancelled_at IS NULL
           AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
      )
      .bind(now, claim.id, journeyId, now),
    database
      .prepare(
        `UPDATE handoffs
         SET status = CASE WHEN mode = 'PRIVATE' THEN 'READY' ELSE 'CANCELLED' END,
             claimed_at = CASE WHEN mode = 'PRIVATE' THEN NULL ELSE claimed_at END
         WHERE id = ?
           AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
      )
      .bind(claim.handoff_id, journeyId, now),
    database
      .prepare(
        `DELETE FROM claim_drafts WHERE claim_id = ?
         AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
      )
      .bind(claim.id, journeyId, now),
  ]);
  if (changes(results[0]) !== 1 || changes(results[1]) !== 1 || changes(results[2]) !== 1) {
    throw new HttpError(409, 'ADMIN_STALE_VIEW', 'This Drawmory changed. Refresh before trying again.');
  }
  return {
    released: true,
    status: restored,
    cleanupWarning: await deleteStoredPaths(journeyId, [claim.storage_path]),
  };
}

export async function resetAdminJourney(
  journeyId: string,
  fromStep: number,
  expectedUpdatedAt: number,
) {
  await ensureSchema();
  const database = getDatabase();
  const journey = await database
    .prepare(`SELECT * FROM journeys WHERE id = ?`)
    .bind(journeyId)
    .first<AdminJourneyRow>();
  if (!journey) throw new HttpError(404, 'ADMIN_JOURNEY_NOT_FOUND', 'This Drawmory no longer exists.');
  if (journey.updated_at !== expectedUpdatedAt) {
    throw new HttpError(409, 'ADMIN_STALE_VIEW', 'This Drawmory changed. Refresh before trying again.');
  }
  if (!Number.isInteger(fromStep) || fromStep < 1 || fromStep > journey.redraw_count) {
    throw new HttpError(400, 'ADMIN_INVALID_STEP', 'Choose an existing redraw. Delete the whole Drawmory to remove its original.');
  }
  const previousDrawing = await database
    .prepare(`SELECT id FROM drawings WHERE journey_id = ? AND step_index = ?`)
    .bind(journeyId, fromStep - 1)
    .first<{ id: string }>();
  if (!previousDrawing) {
    throw new HttpError(409, 'ADMIN_PREVIOUS_DRAWING_MISSING', 'The previous step could not be restored.');
  }
  const stored = await database
    .prepare(
      `SELECT storage_path FROM drawings WHERE journey_id = ? AND step_index >= ?
       UNION ALL SELECT storage_path FROM claim_drafts WHERE journey_id = ?`,
    )
    .bind(journeyId, fromStep, journeyId)
    .all<{ storage_path: string }>();
  const worldHistory = await database
    .prepare(
      `SELECT 1 AS found FROM handoffs
       WHERE journey_id = ? AND mode IN ('WORLD_POOL', 'WORLD_OFFER') LIMIT 1`,
    )
    .bind(journeyId)
    .first<{ found: number }>();
  const returnsToWorld = journey.handoff_mode === 'WORLD' || Boolean(worldHistory);
  const nextStatus = returnsToWorld ? 'AVAILABLE_WORLD' : 'AWAITING_HANDOFF';
  const now = operationTime(expectedUpdatedAt);
  const receiptToken = returnsToWorld ? null : randomToken();
  const receiptHash = receiptToken ? await hashToken(receiptToken) : null;
  const statements = [
    database
      .prepare(
        `UPDATE journeys
         SET status = ?, redraw_count = ?, current_drawing_id = ?, handoff_mode = ?,
             updated_at = ?, completed_at = NULL, reservation_expires_at = NULL,
             previous_available_state = NULL, flagged = 0
         WHERE id = ? AND updated_at = ?`,
      )
      .bind(
        nextStatus,
        fromStep - 1,
        previousDrawing.id,
        returnsToWorld ? 'WORLD' : null,
        now,
        journeyId,
        expectedUpdatedAt,
      ),
    database.prepare(
      `DELETE FROM claim_drafts WHERE journey_id = ?
       AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
    ).bind(journeyId, journeyId, now),
    database.prepare(
      `DELETE FROM claims WHERE journey_id = ?
       AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
    ).bind(journeyId, journeyId, now),
    database.prepare(
      `DELETE FROM handoffs WHERE journey_id = ?
       AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
    ).bind(journeyId, journeyId, now),
    database.prepare(
      `DELETE FROM receipts WHERE journey_id = ? AND step_index >= ?
       AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
    ).bind(journeyId, fromStep, journeyId, now),
    database.prepare(
      `DELETE FROM drawings WHERE journey_id = ? AND step_index >= ?
       AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
    ).bind(journeyId, fromStep, journeyId, now),
    database.prepare(
      `DELETE FROM journey_votes WHERE journey_id = ?
       AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
    ).bind(journeyId, journeyId, now),
  ];
  if (receiptToken && receiptHash) {
    statements.push(
      database
        .prepare(
          `INSERT INTO receipts (id, journey_id, step_index, token_hash, created_at)
           SELECT ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
        )
        .bind(randomId('rcp'), journeyId, fromStep - 1, receiptHash, now, journeyId, now),
    );
  }
  const results = await database.batch(statements);
  if (changes(results[0]) !== 1) {
    throw new HttpError(409, 'ADMIN_STALE_VIEW', 'This Drawmory changed. Refresh before trying again.');
  }

  return {
    reset: true,
    status: nextStatus,
    redrawCount: fromStep - 1,
    recoveryPath: receiptToken ? `/pass/${encodeURIComponent(journeyId)}#receipt=${encodeURIComponent(receiptToken)}` : null,
    cleanupWarning: await deleteStoredPaths(journeyId, stored.results.map((row) => row.storage_path)),
  };
}

export async function deleteAdminJourney(journeyId: string, expectedUpdatedAt: number) {
  await ensureSchema();
  const database = getDatabase();
  const journey = await database
    .prepare(`SELECT public_slug, updated_at FROM journeys WHERE id = ?`)
    .bind(journeyId)
    .first<{ public_slug: string; updated_at: number }>();
  if (!journey) throw new HttpError(404, 'ADMIN_JOURNEY_NOT_FOUND', 'This Drawmory no longer exists.');
  if (journey.updated_at !== expectedUpdatedAt) {
    throw new HttpError(409, 'ADMIN_STALE_VIEW', 'This Drawmory changed. Refresh before trying again.');
  }
  const stored = await database
    .prepare(
      `SELECT storage_path FROM drawings WHERE journey_id = ?
       UNION ALL SELECT storage_path FROM claim_drafts WHERE journey_id = ?`,
    )
    .bind(journeyId, journeyId)
    .all<{ storage_path: string }>();
  const now = operationTime(expectedUpdatedAt);
  const guardedDelete = (table: string) => database
    .prepare(
      `DELETE FROM ${table} WHERE journey_id = ?
       AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND updated_at = ?)`,
    )
    .bind(journeyId, journeyId, now);
  const results = await database.batch([
    database
      .prepare(`UPDATE journeys SET status = 'EXPIRED', flagged = 1, updated_at = ? WHERE id = ? AND updated_at = ?`)
      .bind(now, journeyId, expectedUpdatedAt),
    guardedDelete('claim_drafts'),
    guardedDelete('claims'),
    guardedDelete('receipts'),
    guardedDelete('handoffs'),
    guardedDelete('journey_votes'),
    guardedDelete('drawings'),
    database.prepare(`DELETE FROM journeys WHERE id = ? AND updated_at = ?`).bind(journeyId, now),
  ]);
  if (changes(results[0]) !== 1 || changes(results.at(-1)!) !== 1) {
    throw new HttpError(409, 'ADMIN_STALE_VIEW', 'This Drawmory changed. Refresh before trying again.');
  }
  return {
    deleted: true,
    publicSlug: journey.public_slug,
    cleanupWarning: await deleteStoredPaths(journeyId, stored.results.map((row) => row.storage_path)),
  };
}
