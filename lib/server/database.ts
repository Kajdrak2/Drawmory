import { env } from 'cloudflare:workers';

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS journeys (
    id TEXT PRIMARY KEY,
    public_slug TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL,
    target_redraws INTEGER NOT NULL,
    redraw_count INTEGER NOT NULL DEFAULT 0,
    handoff_mode TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    completed_at INTEGER,
    reservation_expires_at INTEGER,
    previous_available_state TEXT,
    current_drawing_id TEXT,
    flagged INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS drawings (
    id TEXT PRIMARY KEY,
    journey_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    country_code TEXT NOT NULL DEFAULT 'UNKNOWN',
    city TEXT,
    latitude REAL,
    longitude REAL,
    location_precision TEXT NOT NULL DEFAULT 'NONE',
    created_at INTEGER NOT NULL,
    UNIQUE(journey_id, step_index)
  )`,
  `CREATE TABLE IF NOT EXISTS handoffs (
    id TEXT PRIMARY KEY,
    journey_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    token_hash TEXT UNIQUE,
    code_hash TEXT UNIQUE,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    claimed_at INTEGER,
    expires_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    journey_id TEXT NOT NULL,
    handoff_id TEXT NOT NULL,
    session_token_hash TEXT NOT NULL UNIQUE,
    reveal_started_at INTEGER,
    reservation_expires_at INTEGER NOT NULL,
    submitted_at INTEGER,
    cancelled_at INTEGER,
    cancel_reason TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS claim_drafts (
    claim_id TEXT PRIMARY KEY,
    journey_id TEXT NOT NULL,
    drawing_id TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    validated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    journey_id TEXT NOT NULL,
    step_index INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS journey_votes (
    id TEXT PRIMARY KEY,
    journey_id TEXT NOT NULL,
    voter_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE(journey_id, voter_hash)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_journeys_world_queue ON journeys(status, flagged, updated_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_drawings_journey_step ON drawings(journey_id, step_index)`,
  `CREATE INDEX IF NOT EXISTS idx_handoffs_journey_status ON handoffs(journey_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_claims_journey ON claims(journey_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_claim_drafts_journey ON claim_drafts(journey_id)`,
  `CREATE INDEX IF NOT EXISTS idx_receipts_journey_step ON receipts(journey_id, step_index)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_journey_votes_journey_voter ON journey_votes(journey_id, voter_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_journey_votes_journey ON journey_votes(journey_id)`,
  `PRAGMA optimize`,
];

const drawingLocationMigrations = [
  `ALTER TABLE drawings ADD COLUMN city TEXT`,
  `ALTER TABLE drawings ADD COLUMN latitude REAL`,
  `ALTER TABLE drawings ADD COLUMN longitude REAL`,
  `ALTER TABLE drawings ADD COLUMN location_precision TEXT NOT NULL DEFAULT 'NONE'`,
];

const claimLifecycleMigrations = [
  `ALTER TABLE claims ADD COLUMN cancelled_at INTEGER`,
  `ALTER TABLE claims ADD COLUMN cancel_reason TEXT`,
];

let schemaReady: Promise<void> | undefined;

export function getDatabase() {
  if (!env.DB) {
    throw new Error('Drawmory database is unavailable.');
  }
  return env.DB;
}

export function getFiles() {
  if (!env.FILES) {
    throw new Error('Drawmory image storage is unavailable.');
  }
  return env.FILES;
}

export async function ensureSchema() {
  schemaReady ??= getDatabase()
    .batch(schemaStatements.map((statement) => getDatabase().prepare(statement)))
    .then(async () => {
      for (const statement of [...drawingLocationMigrations, ...claimLifecycleMigrations]) {
        try {
          await getDatabase().prepare(statement).run();
        } catch (error) {
          if (!(error instanceof Error) || !error.message.toLowerCase().includes('duplicate column')) {
            throw error;
          }
        }
      }
    })
    .catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  return schemaReady;
}
