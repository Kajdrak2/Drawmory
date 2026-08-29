# Drawmory

**See it. Remember it. Redraw it. Pass it on.**

Drawmory is a mobile-first drawing journey with no account, sign-up, login, email, profile, or product AI. One person draws, the next sees that drawing once, redraws it from memory, and passes the new version onward. When the configured 3 or 5 redraws are complete, the full transformation is revealed.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Local D1 and R2 emulation is configured automatically, so the complete multi-device workflow works without external credentials.

## Product routes

- `/` — Create or receive
- `/create` — tactile drawing and journey length
- `/receive` — manual code or world queue
- `/r/[handoffToken]` — private invitation preview
- `/carry/[claimId]` — one-time observation and redraw
- `/pass/[journeyId]` — private QR/code or world handoff
- `/receipt/[receiptToken]` — private contribution receipt
- `/journey/[publicSlug]` — progress, then final reveal
- `/memories` — receipt links stored only on the current device

## Data and security

- Cloudflare D1 stores journey, drawing, handoff, claim, and receipt metadata.
- Cloudflare R2 stores private PNG/WebP drawing files.
- Capability tokens contain at least 32 random bytes; only SHA-256 hashes are stored.
- Carrier sessions use an `HttpOnly`, `SameSite=Lax`, short-lived cookie.
- Image MIME type, signature, byte size, dimensions, and square aspect ratio are validated server-side.
- A conditional atomic claim permits exactly one carrier; expired reservations return to their prior private or world state.
- Public journey pages never expose drawings before completion.
- No raw IP address, precise location, identity, account, or email is stored. Only an approximate two-letter country code is accepted when the host provides one.

## Configuration

Copy `.env.example` only when timing or the trusted production origin needs to change. Production defaults are an 8-second observation, a 60-second redraw, and a 3-minute reservation. A hackathon demo can shorten the observation through `DRAWMORY_REVEAL_SECONDS`.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The Playwright test uses fresh browser contexts to simulate separate anonymous phones and completes a 3-redraw journey through the four-frame reveal.

## Honest MVP boundary

The world queue includes a report-and-skip action and no public gallery, but a public launch still needs an operational moderation policy, abuse monitoring, retention rules, and a production privacy/legal review. No claim is made that screenshots can be prevented during the one-time observation.
