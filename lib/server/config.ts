function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export const SERVER_CONFIG = {
  claimSeconds: boundedInteger(process.env.DRAWMORY_CLAIM_SECONDS, 180, 60, 900),
  revealSeconds: boundedInteger(process.env.DRAWMORY_REVEAL_SECONDS, 8, 2, 30),
  redrawSeconds: boundedInteger(process.env.DRAWMORY_REDRAW_SECONDS, 600, 3, 1_200),
  confirmationSeconds: boundedInteger(process.env.DRAWMORY_CONFIRMATION_SECONDS, 120, 2, 300),
  locationSeconds: boundedInteger(process.env.DRAWMORY_LOCATION_SECONDS, 900, 60, 3_600),
  worldOfferSeconds: boundedInteger(process.env.DRAWMORY_WORLD_OFFER_SECONDS, 90, 30, 300),
  maxImageBytes: 1_000_000,
  maxImageDimension: 1024,
} as const;
