import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const journeys = sqliteTable(
  'journeys',
  {
    id: text('id').primaryKey(),
    publicSlug: text('public_slug').notNull(),
    status: text('status').notNull(),
    targetRedraws: integer('target_redraws').notNull(),
    redrawCount: integer('redraw_count').notNull().default(0),
    handoffMode: text('handoff_mode'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    completedAt: integer('completed_at'),
    reservationExpiresAt: integer('reservation_expires_at'),
    previousAvailableState: text('previous_available_state'),
    currentDrawingId: text('current_drawing_id'),
    flagged: integer('flagged').notNull().default(0),
  },
  (table) => [
    uniqueIndex('idx_journeys_public_slug').on(table.publicSlug),
    index('idx_journeys_world_queue').on(table.status, table.flagged, table.updatedAt),
  ],
);

export const drawings = sqliteTable(
  'drawings',
  {
    id: text('id').primaryKey(),
    journeyId: text('journey_id').notNull(),
    stepIndex: integer('step_index').notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    byteSize: integer('byte_size').notNull(),
    sha256: text('sha256').notNull(),
    countryCode: text('country_code').notNull().default('UNKNOWN'),
    city: text('city'),
    latitude: real('latitude'),
    longitude: real('longitude'),
    locationPrecision: text('location_precision').notNull().default('NONE'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_drawings_journey_step').on(table.journeyId, table.stepIndex),
    index('idx_drawings_journey').on(table.journeyId),
  ],
);

export const handoffs = sqliteTable(
  'handoffs',
  {
    id: text('id').primaryKey(),
    journeyId: text('journey_id').notNull(),
    mode: text('mode').notNull(),
    tokenHash: text('token_hash'),
    codeHash: text('code_hash'),
    status: text('status').notNull(),
    createdAt: integer('created_at').notNull(),
    claimedAt: integer('claimed_at'),
    expiresAt: integer('expires_at'),
  },
  (table) => [
    uniqueIndex('idx_handoffs_token_hash').on(table.tokenHash),
    uniqueIndex('idx_handoffs_code_hash').on(table.codeHash),
    index('idx_handoffs_journey_status').on(table.journeyId, table.status),
  ],
);

export const claims = sqliteTable(
  'claims',
  {
    id: text('id').primaryKey(),
    journeyId: text('journey_id').notNull(),
    handoffId: text('handoff_id').notNull(),
    sessionTokenHash: text('session_token_hash').notNull(),
    revealStartedAt: integer('reveal_started_at'),
    reservationExpiresAt: integer('reservation_expires_at').notNull(),
    submittedAt: integer('submitted_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_claims_session_hash').on(table.sessionTokenHash),
    index('idx_claims_journey').on(table.journeyId, table.createdAt),
  ],
);

export const receipts = sqliteTable(
  'receipts',
  {
    id: text('id').primaryKey(),
    journeyId: text('journey_id').notNull(),
    stepIndex: integer('step_index').notNull(),
    tokenHash: text('token_hash').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_receipts_token_hash').on(table.tokenHash),
    index('idx_receipts_journey_step').on(table.journeyId, table.stepIndex),
  ],
);

export const journeyVotes = sqliteTable(
  'journey_votes',
  {
    id: text('id').primaryKey(),
    journeyId: text('journey_id').notNull(),
    voterHash: text('voter_hash').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('idx_journey_votes_journey_voter').on(table.journeyId, table.voterHash),
    index('idx_journey_votes_journey').on(table.journeyId),
  ],
);
