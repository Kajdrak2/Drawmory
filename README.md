# Drawmory

**See it. Remember it. Redraw it. Pass it on.**

[Drawmory](https://drawmory.xyz) is an anonymous, mobile-first drawing-memory game. One person draws, the next sees that drawing once, redraws it from memory, and passes the new version onward. Every step becomes part of a public visual story that can travel around the world.

## What you can do

- Draw with a brush, marker, fill tool, eraser, lines, rectangles and ellipses, with a full color picker, opacity, size, undo and redo.
- Choose a fixed group size or let the loop continue indefinitely.
- Pass a private link or send the Drawmory to the world queue. Once world mode is chosen, every following drawing automatically returns to the world.
- Explore ongoing and completed Drawmories from the home gallery, move through their drawings, and vote once per browser.
- See each Drawmory as a slide story, a fresco, and—when contributors opt in—a route on a world map.
- Add an optional country, city, or precise position to a contribution. Nothing is requested by default.
- Mark each contribution as NSFW before validating it. NSFW images stay hidden and out of the world queue until the device-level toggle is explicitly enabled.

No account, sign-up, login, email or profile is required.

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
- `/journey/[publicSlug]` — public slides, fresco, map, progress and voting

## Data and security

- Cloudflare D1 stores journey, drawing, handoff, claim, and receipt metadata.
- Cloudflare R2 stores private PNG/WebP drawing files.
- Capability tokens contain at least 32 random bytes; only SHA-256 hashes are stored.
- Carrier sessions use an `HttpOnly`, `SameSite=Lax`, short-lived cookie.
- Image MIME type, signature, byte size, dimensions, and square aspect ratio are validated server-side.
- A conditional atomic claim permits exactly one carrier; expired reservations return to their prior private or world state.
- Public journey pages expose the drawing sequence but never private handoff or receipt capabilities.
- NSFW image endpoints deny access by default; the public gallery, journey viewer, private handoffs and world queue require an explicit opt-in that is stored only in that browser.
- A browser voter token prevents repeated votes from the same browser and is stored only as a hash on the server.
- No raw IP address, identity, account or email is stored. Location is optional and contributor-provided; it may be a country, city or precise coordinates.

## Configuration

Copy `.env.example` only when timing or the trusted production origin needs to change. Production defaults are an 8-second observation, 10 minutes to redraw, a 2-minute confirmation window, and 15 minutes to optionally add a location. A local demo can shorten these windows through the corresponding `DRAWMORY_*_SECONDS` variables.

Owner administration uses no account and is intentionally absent from public navigation. Configure two different long random secrets in `DRAWMORY_ADMIN_CAPABILITY` and `DRAWMORY_ADMIN_SESSION_SECRET`, then open `/manage#access=<capability>`. The fragment is exchanged for a short-lived, HTTP-only session and immediately removed from the address bar. Never commit or publish the real capability.

## Verification

```bash
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

The Playwright suite uses fresh browser contexts to simulate separate anonymous phones. It covers navigation, drawing tools, open loops, private passing, world-mode continuity, NSFW opt-in boundaries, public previews, location inheritance and one-vote-per-browser behavior.

## Honest MVP boundary

The world queue includes a report-and-skip action, but NSFW labels are contributor-provided rather than automatic moderation. A larger public launch still needs operational moderation, abuse monitoring, retention rules and a production privacy/legal review. No claim is made that screenshots can be prevented during the one-time observation.
