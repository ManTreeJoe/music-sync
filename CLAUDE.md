# Playlist Bridge — Build Spec

Cross-platform playlist transfer between Spotify, Apple Music, and YouTube Music. Paste a playlist link, get a converted playlist on the other service.

## v1 Scope

**In:**
- Spotify ↔ Apple Music (both directions, full support)
- YouTube Music (see constraints below — quota-limited, ships behind a flag)
- **Append to an existing destination playlist**, not just create-new
- Stateless: no user accounts, no persisted playlists
- US storefront only (parameterized, not hardcoded)
- Review screen before final write
- Playlist export (CSV/JSON/M3U8) so nothing is ever locked in

**Out (do not build yet):**
- User accounts, saved history, social/sharing layer
- Tidal, Deezer
- Scheduled/recurring sync
- Any ML-based matching
- Any reverse-engineered/unofficial API client (see YouTube section — this is a hard rule)

**Success criterion:** a 100-track mainstream playlist transfers with ≥90% auto-match and the user can resolve the rest in under two minutes.

### Deployment context — read this first

This is a private tool for the author and ~10 friends. It is **not** a commercial product in v1. That changes several defaults:

- **Stay under 25 users.** Spotify development mode allows 25 users without a quota extension review. Do not exceed this. If it grows past 25, that's a deliberate decision requiring a Spotify extension request (slow, reviewed) and a separate conversation with Spotify about commercial use.
- **No competitive pressure.** Ignore feature parity with Soundiiz/FreeYourMusic/TuneMyMusic. Their free-tier caps (200–600 tracks, 1 sync slot) exist for business reasons that don't apply here. Build what's useful, not what's competitive.
- **Free tiers are sufficient.** Vercel, Upstash Redis, and Inngest free tiers all comfortably cover ~10 users. Do not add paid infra without a specific reason.
- **YouTube quota is shared across all users.** 10,000 units/day total for the project, not per user. At ~15,000 units per 100-track write, that's under one YouTube-destination transfer per day for the whole friend group. Plan the UI around this scarcity.
- **If it grows:** the things that need revisiting are Spotify quota extension, Apple's commercial terms, YouTube quota audit, and a real privacy policy. None are v1 concerns. Do not pre-build for scale.

---

## Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js (App Router), TypeScript | API routes + UI in one deploy |
| Jobs | Inngest | Playlists >100 tracks exceed serverless timeouts |
| Cache | Redis (Upstash) | ISRC→platform-ID cache, rate-limit token buckets |
| Session | Encrypted iron-session cookies | No DB needed for v1 |
| Hosting | Vercel | Inngest integrates cleanly |

No Postgres in v1. If you find yourself wanting one, stop and ask — it means scope crept.

### Project structure

```
src/
  lib/
    providers/
      types.ts          # MusicProvider interface + shared types
      spotify.ts
      apple.ts
      youtube.ts
      jsonFile.ts       # re-import adapter
      index.ts          # registry: platform → provider
    matching/
      normalize.ts      # pure string normalization
      score.ts          # pure scoring functions
      engine.ts         # tier orchestration
      index.ts
    export/
      csv.ts
      json.ts
      m3u8.ts
    ratelimit.ts        # Redis token bucket
    quota.ts            # YouTube quota accounting
    cache.ts            # ISRC → platform ID
    session.ts          # iron-session config
  inngest/
    client.ts
    functions/
      matchPlaylist.ts
      writePlaylist.ts
  app/
    api/
      auth/[platform]/route.ts
      jobs/route.ts
      jobs/[id]/route.ts
      jobs/[id]/stream/route.ts
      export/[id]/route.ts
      inngest/route.ts
    (ui pages)
tests/
  fixtures/
    tracks.json         # the 50 hand-verified pairs
  matching/
```

**`lib/matching/` must have zero imports from `lib/providers/`.** It operates on the normalized `Track` type only. This is what makes it testable without network access, and it's the single most important structural rule in the project.

---

## Core Types

Define these first. Everything else depends on them.

```typescript
// lib/providers/types.ts

export type Platform = 'spotify' | 'apple' | 'youtube';
export type Confidence = 'high' | 'medium' | 'low' | 'none';

/** Normalized track — the lingua franca. Providers convert to/from this. */
export interface Track {
  title: string;
  artists: string[];          // [0] is primary
  album?: string;
  isrc?: string;              // absent on YouTube
  durationMs?: number;        // absent on some YouTube results
  platformId: string;         // Spotify URI, Apple catalog id, YT video id
  platform: Platform;
  sourceUrl?: string;
  isrcMissingReason?: 'platform_unsupported' | 'not_in_response';
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  trackCount: number;
  platform: Platform;
  url: string;
  owner?: string;
}

export interface MatchResult {
  source: Track;
  destination: Track | null;
  confidence: Confidence;
  score?: number;             // 0-1, present for tier-2 matches
  tier: 1 | 2 | 3;
  alternatives?: Track[];     // for user review on low confidence
  reason?: string;            // why it failed, for the UI
}

export interface MusicProvider {
  platform: Platform;

  /** Parse a URL into a playlist ref. Returns null if not this platform. */
  parseUrl(url: string): { playlistId: string } | null;

  getPlaylist(id: string, auth: Auth): Promise<Playlist>;

  /** Must handle pagination internally and return ALL tracks. */
  getTracks(id: string, auth: Auth): Promise<Track[]>;

  /** Tier 1. Return null if platform has no ISRC support. */
  findByIsrc(isrc: string, auth: Auth): Promise<Track[]> | null;

  /** Tier 2. Free-text search. */
  search(query: SearchQuery, auth: Auth): Promise<Track[]>;

  createPlaylist(name: string, desc: string, auth: Auth): Promise<Playlist>;

  /** Must batch internally per platform limits. */
  addTracks(playlistId: string, trackIds: string[], auth: Auth): Promise<void>;

  /** For append-mode dedup and the write-permission check. */
  getWritablePlaylists(auth: Auth): Promise<Playlist[]>;

  /** Cost estimate in whatever unit the platform meters. 0 if unmetered. */
  estimateWriteCost(trackCount: number): number;
}

export interface SearchQuery {
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
}

export type Auth =
  | { kind: 'none' }                                    // public reads
  | { kind: 'bearer'; token: string }                   // Spotify, YouTube
  | { kind: 'apple'; developerToken: string; userToken?: string };
```

`estimateWriteCost` exists so the YouTube quota preflight doesn't need platform-specific branching in the job code.

---

## Auth

### Spotify

- OAuth 2.0 **with PKCE** (not implicit, not client-secret-in-browser)
- Scopes: `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-public`, `playlist-modify-private`
- Access token ~1hr; refresh token does not expire
- Reading a *public* playlist needs only a client-credentials token — no user auth. Use this so the source side requires zero login when the input is a public link.

**Endpoints**

| Purpose | Endpoint | Notes |
|---|---|---|
| Client credentials | `POST /api/token` | `grant_type=client_credentials`, cache ~55min |
| Playlist meta | `GET /v1/playlists/{id}` | Add `fields=` to trim payload |
| Tracks | `GET /v1/playlists/{id}/tracks` | 100/page, `offset` paginate |
| ISRC search | `GET /v1/search?q=isrc:{isrc}&type=track` | Tier 1 |
| Text search | `GET /v1/search?q=...&type=track&limit=10` | Tier 2 |
| Create | `POST /v1/users/{user_id}/playlists` | Needs user id from `/v1/me` |
| Add tracks | `POST /v1/playlists/{id}/tracks` | 100 URIs/req |
| My playlists | `GET /v1/me/playlists` | 50/page |

**Gotchas that will cost you time:**

- **Local files** appear in playlists with `track.id === null` and `is_local: true`. Skip them, count them separately, and tell the user. They cannot be transferred by definition.
- **Podcast episodes** in playlists have `track.type === 'episode'`. Filter these out.
- **Unavailable tracks** may return `track: null` entirely. Guard against it — this crashes naive code.
- `market` param matters. Pass `market=US` (or the user's) or you get relinking surprises where `track.id` differs from `track.linked_from.id`. Always prefer `linked_from.id` when present for stable identity.
- The `fields` param dramatically cuts payload size. Use:
  `fields=items(track(id,name,artists(name),album(name),duration_ms,external_ids,is_local,type)),next`
- Rate limit responses include `Retry-After` in **seconds**. Honor it exactly.

**Token exchange**

```typescript
// PKCE: generate verifier, store in session, send challenge
const verifier = base64url(crypto.randomBytes(32));
const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());

// Authorize URL
const url = new URL('https://accounts.spotify.com/authorize');
url.searchParams.set('client_id', process.env.SPOTIFY_CLIENT_ID!);
url.searchParams.set('response_type', 'code');
url.searchParams.set('redirect_uri', REDIRECT_URI);
url.searchParams.set('code_challenge_method', 'S256');
url.searchParams.set('code_challenge', challenge);
url.searchParams.set('scope', SCOPES.join(' '));
url.searchParams.set('state', csrfToken);
```

Validate `state` on the callback. It's the CSRF defense and it's easy to skip.

### Apple Music

- **Developer token:** JWT, ES256, signed with the MusicKit `.p8` private key. Claims: `iss` (Team ID), `iat`, `exp` (max 6 months), header `kid` (Key ID). Generate server-side, cache until expiry. Never ship the `.p8` to the client.
- **Music User Token:** obtained in-browser via MusicKit JS `authorize()`. Required only for *writing* a playlist. Expires ~6 months.
- Catalog reads need only the developer token.

**Consequence for UX:** Spotify public link → Apple Music requires exactly one auth (Apple, at the end). Design the flow around this — do not ask for auth up front.

**Developer token generation** (this is the part people get wrong):

```typescript
import jwt from 'jsonwebtoken';

let cached: { token: string; expiresAt: number } | null = null;

export function getAppleDeveloperToken(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expiresAt > now + 3600) return cached.token;

  // .p8 stored with literal \n — restore real newlines
  const key = process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const exp = now + 60 * 60 * 24 * 180;   // 180 days, under the 6mo max

  const token = jwt.sign(
    { iss: process.env.APPLE_TEAM_ID!, iat: now, exp },
    key,
    {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: process.env.APPLE_KEY_ID! },
    }
  );

  cached = { token, expiresAt: exp };
  return token;
}
```

Failure modes, all of which produce an unhelpful 401:
- `\n` not restored in the private key → invalid key error
- `kid` in the payload instead of the header → 401
- `exp` more than 6 months out → 401
- Team ID confused with Key ID → 401
- Using an App Store key instead of a **MusicKit** key → 401. The key must be created with MusicKit enabled.

**Endpoints**

| Purpose | Endpoint | Auth |
|---|---|---|
| ISRC lookup | `GET /v1/catalog/{sf}/songs?filter[isrc]={isrc}` | Dev token |
| Text search | `GET /v1/catalog/{sf}/search?term=...&types=songs&limit=10` | Dev token |
| My playlists | `GET /v1/me/library/playlists` | Dev + user |
| Create | `POST /v1/me/library/playlists` | Dev + user |
| Add tracks | `POST /v1/me/library/playlists/{id}/tracks` | Dev + user |
| Storefront | `GET /v1/me/storefront` | Dev + user |

Headers: `Authorization: Bearer {devToken}` and `Music-User-Token: {userToken}`.

**Gotchas:**

- **Library IDs ≠ catalog IDs.** Adding to a playlist uses catalog IDs with `type: 'songs'`. Library items have `type: 'library-songs'` and different IDs. Mixing them silently fails.
- `filter[isrc]` accepts comma-separated ISRCs — batch up to ~25 per call. Big win, easy to miss.
- Create-playlist response does **not** reliably include the tracks you passed in the same request. Create first, then add in a second call. More reliable.
- Storefront is per-user. Call `/v1/me/storefront` once authed rather than assuming `us` — a track present in `us` may be absent in `gb`.
- Apple returns `403` for a valid dev token with a missing/expired user token. Distinguish this from `401` (bad dev token) in error handling or you'll debug the wrong thing.

**MusicKit JS (client side):**

```javascript
await MusicKit.configure({
  developerToken,                       // fetched from your server
  app: { name: 'Playlist Bridge', build: '1.0' },
});
const music = MusicKit.getInstance();
const userToken = await music.authorize();   // opens Apple's auth flow
// POST userToken to your server, store in the encrypted session
```

Load MusicKit v3 from `https://js-cdn.music.apple.com/musickit/v3/musickit.js`. It attaches to `window.MusicKit` after the `musickitloaded` event — waiting on that event is required, since a naive `await import` will race.

### YouTube Music

**There is no official YouTube Music API.** YouTube Data API v3 covers YouTube proper. Tracks added to a YouTube playlist do surface in YouTube Music, so this is the compliant path.

**Hard rule: do not use `ytmusicapi` or any other reverse-engineered client.** They work by replaying internal endpoints with a user's browser cookies. That violates YouTube ToS, risks termination of the account whose cookies are used, and breaks without warning when Google changes internals. If a task seems to require one, stop and escalate rather than reaching for it.

- OAuth 2.0, scope `https://www.googleapis.com/auth/youtube`
- Write: `playlists.insert` then `playlistItems.insert` (one call per track — no batch endpoint)
- Read: `playlistItems.list` for source playlists

**Quota is the binding constraint.** Default 10,000 units/day for the whole project:

| Operation | Cost | Notes |
|---|---|---|
| `search.list` | 100 | The killer |
| `playlistItems.insert` | 50 | Per track, no batching |
| `playlists.insert` | 50 | Once per transfer |
| `playlistItems.list` | 1 | Reads are cheap |

A 100-track transfer *into* YouTube costs ~15,000 units — over the daily cap for a single playlist. Reading *out of* YouTube is cheap (~1 unit/page).

**Therefore:**
- Ship **YouTube → Spotify/Apple** first. It's read-heavy and effectively unconstrained.
- Ship **→ YouTube** behind a feature flag with a hard per-day transfer cap derived from remaining quota. Show the user a clear "N transfers remaining today" rather than failing mid-job.
- Track quota consumption in Redis, reset at midnight Pacific (Google's reset boundary, not UTC).
- Apply for a quota increase early. It requires a compliance audit and takes weeks.
- Never call `search.list` when a cached video ID exists. Cache aggressively — this is worth 100 units per hit.

YouTube has no ISRC in its API. Matching into YouTube is Tier 2 only, so expect meaningfully lower accuracy and set `medium` as the ceiling confidence.

### Env vars
```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=        # .p8 contents, newlines as \n
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
YOUTUBE_WRITE_ENABLED=false   # feature flag, off until quota approved
YOUTUBE_DAILY_QUOTA=10000
SESSION_SECRET=           # 32+ bytes
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
DEFAULT_STOREFRONT=us
```

---

## Matching Engine

This is the whole product. Everything else is plumbing.

### Tier 1 — ISRC (authoritative)
- Spotify: `track.external_ids.isrc`
- Apple lookup: `GET /v1/catalog/{storefront}/songs?filter[isrc]={isrc}`
- Apple: `attributes.isrc`
- Spotify lookup: `GET /v1/search?q=isrc:{isrc}&type=track`

ISRC can return multiple results (remasters, regional editions). Prefer exact duration match, then earliest release date. Mark confidence `high`.

### Tier 2 — Normalized fuzzy
Trigger only on Tier 1 miss.

```typescript
// lib/matching/normalize.ts

const NOISE_PATTERNS = [
  /\s*[\(\[]\s*(remaster(ed)?|re-?master)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(deluxe|expanded|special|anniversary)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(bonus track|album version|single version)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(radio edit|clean|explicit)[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(official\s+)?(music\s+)?video[^\)\]]*[\)\]]/gi,
  /\s*[\(\[]\s*(hd|hq|4k|lyrics?|audio)\s*[\)\]]/gi,
  /\s*-\s*(remaster(ed)?|radio edit|single version)\b.*$/gi,
  /\s*\|\s*official.*$/gi,
];

const FEAT_PATTERN =
  /\s*[\(\[]?\s*(feat\.?|ft\.?|featuring|with)\s+([^\)\]]+)[\)\]]?/gi;

export interface Normalized {
  title: string;
  featured: string[];
  hadNoise: boolean;
}

export function normalizeTitle(raw: string): Normalized {
  let s = raw;
  const featured: string[] = [];

  // Extract featured artists BEFORE stripping — they're a scoring signal
  s = s.replace(FEAT_PATTERN, (_m, _kw, names) => {
    featured.push(...names.split(/,|&|and/i).map((n: string) => n.trim()));
    return ' ';
  });

  const before = s;
  for (const p of NOISE_PATTERNS) s = s.replace(p, ' ');
  const hadNoise = before !== s;

  s = s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/[^\p{L}\p{N}\s'&]/gu, ' ')               // keep letters/nums
    .replace(/\s+/g, ' ')
    .trim();

  return { title: s, featured: featured.map(f => f.toLowerCase()), hadNoise };
}

export function normalizeArtist(raw: string): string {
  return raw
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')          // "The Beatles" ≡ "Beatles"
    .replace(/\s*-\s*topic$/, '')    // YouTube auto-channels
    .replace(/[^\p{L}\p{N}\s'&]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

**Use `\p{L}` with the `u` flag, not `a-z`.** Stripping to ASCII destroys non-Latin titles entirely — a K-pop or J-pop track becomes an empty string and matches nothing.

**Scoring**

```typescript
// lib/matching/score.ts

export function durationScore(a?: number, b?: number): number {
  if (a == null || b == null) return 0.5;   // unknown ≠ mismatch
  const diff = Math.abs(a - b) / 1000;
  if (diff <= 2) return 1;
  if (diff >= 10) return 0;
  return 1 - (diff - 2) / 8;
}

export function scoreMatch(source: Track, candidate: Track): number {
  const s = normalizeTitle(source.title);
  const c = normalizeTitle(candidate.title);

  const titleSim = jaroWinkler(s.title, c.title);
  const artistSim = Math.max(
    ...source.artists.map(sa =>
      Math.max(...candidate.artists.map(ca =>
        jaroWinkler(normalizeArtist(sa), normalizeArtist(ca))))
    )
  );
  const durSim = durationScore(source.durationMs, candidate.durationMs);

  let score = titleSim * 0.5 + artistSim * 0.3 + durSim * 0.2;

  // Featured-artist agreement is a small bonus, not a requirement
  if (s.featured.length && c.featured.length) {
    const overlap = s.featured.filter(f =>
      c.featured.some(cf => jaroWinkler(f, cf) > 0.9)).length;
    if (overlap) score = Math.min(1, score + 0.03);
  }

  return score;
}
```

Use the `natural` npm package for `jaroWinkler`, or vendor a ~40-line implementation. Don't hand-roll Levenshtein and call it close enough — Jaro-Winkler's prefix weighting matters a lot for track titles.

**Thresholds:** `≥0.90` auto-accept (confidence `medium`) · `0.70–0.90` surface for user review (`low`) · `<0.70` unmatched.

**Do not auto-accept below 0.90.** A wrong track is worse than a missing one.

**Negative signals — reject regardless of score** unless the same term appears in the source title:

```typescript
const REJECT_IF_ABSENT_IN_SOURCE = [
  'live', 'remix', 'cover', 'karaoke', 'instrumental',
  'acoustic', 'demo', 'reaction', 'sped up', 'slowed',
  'nightcore', '8d audio', 'tribute', 'made famous by',
];
```

"Made famous by" and "tribute" are karaoke-label tells and appear constantly in search results. Filtering them is worth several points of accuracy on its own.

### Tier 3 — Unmatched
Return with the original metadata and a deep search link on the destination platform. Never silently drop.

### YouTube matching (Tier 2 only)

YouTube Data API exposes no ISRC, so Tier 1 is unavailable in both directions.

**Into YouTube:** build the query as `{title} {primary artist}`, restrict with `videoCategoryId=10` (Music) and `type=video`. Prefer results from a channel whose title matches the artist or ends in `- Topic` (auto-generated official audio, most reliable signal available). Penalize titles containing `live`, `cover`, `remix`, `reaction`, `lyrics`, `1 hour` unless present in the source title.

**Out of YouTube:** titles are unstructured (`Artist - Title (Official Video) [HD]`). Parse by splitting on the first ` - `, then stripping bracketed suffixes. When the channel is `X - Topic`, the channel name is a more trustworthy artist than anything in the title. Fall back to the video's `description` first line for auto-generated uploads, which often carries clean metadata.

Ceiling confidence for any YouTube match is `medium`. Never mark `high` without an ISRC.


Document these in the UI, don't pretend they're solved: classical (performer vs composer ambiguity), live recordings, regional/non-Latin-script releases, DJ mixes and continuous-mix albums, tracks pulled from the destination catalog entirely.

---

## Rate Limits & Batching

**Spotify:** ~180 req/min rolling. Batch reads via `GET /v1/tracks?ids=` (50/req). Writes: `POST /v1/playlists/{id}/tracks` (100 URIs/req). Honor `Retry-After` on 429 — always, no exceptions.

**Apple Music:** limits undocumented and enforced unpredictably. Assume ~20 req/sec, add jitter. Batch adds at 25 tracks/req.

**YouTube:** not rate-limited per second in practice — limited by daily quota instead. See the YouTube auth section. Enforce the quota budget *before* enqueuing a write job, not during it. A job that dies at track 60 of 100 because quota ran out is the worst possible failure mode: the user has a half-built playlist and no clear recovery.

Implement a shared token-bucket limiter in Redis keyed by platform. Exponential backoff with jitter on 429/503, max 5 retries.

```typescript
// lib/ratelimit.ts — sliding window via sorted set

const LIMITS: Record<Platform, { max: number; windowMs: number }> = {
  spotify: { max: 160, windowMs: 60_000 },   // under the ~180 real limit
  apple:   { max: 900, windowMs: 60_000 },   // ~15/s, undocumented
  youtube: { max: 300, windowMs: 60_000 },   // quota-bound, not rate-bound
};

export async function acquire(platform: Platform): Promise<void> {
  const { max, windowMs } = LIMITS[platform];
  const key = `rl:${platform}`;

  for (let attempt = 0; attempt < 50; attempt++) {
    const now = Date.now();
    const pipe = redis.pipeline();
    pipe.zremrangebyscore(key, 0, now - windowMs);
    pipe.zcard(key);
    const [, count] = await pipe.exec<[unknown, number]>();

    if (count < max) {
      await redis.zadd(key, { score: now, member: `${now}:${Math.random()}` });
      await redis.expire(key, Math.ceil(windowMs / 1000) + 1);
      return;
    }
    await sleep(200 + Math.random() * 300);
  }
  throw new Error(`Rate limit acquire timeout: ${platform}`);
}

export async function withRetry<T>(
  platform: Platform,
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 5; i++) {
    await acquire(platform);
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (e.status === 429) {
        const retryAfter = Number(e.headers?.get?.('retry-after')) || 2 ** i;
        await sleep(retryAfter * 1000 + Math.random() * 500);
        continue;
      }
      if (e.status >= 500) {
        await sleep(2 ** i * 1000 + Math.random() * 500);
        continue;
      }
      throw e;   // 4xx other than 429: don't retry, it won't help
    }
  }
  throw lastErr;
}
```

**Cache every ISRC→platform-ID resolution in Redis, 30-day TTL.** Popular playlists overlap heavily; this is the single biggest cost lever. For YouTube, cache the `{normalized title + artist} → videoId` mapping on the same TTL — each hit saves 100 quota units.

```typescript
// lib/cache.ts
const isrcKey = (p: Platform, isrc: string) => `isrc:${p}:${isrc}`;
const textKey = (p: Platform, t: string, a: string) =>
  `txt:${p}:${sha1(`${t}|${a}`).slice(0, 16)}`;

const TTL = 60 * 60 * 24 * 30;

// Cache negatives too, but shorter — catalogs change
const NEG_TTL = 60 * 60 * 24 * 3;
```

Caching negative results matters more than it sounds: without it, a playlist with 20 genuinely-unavailable tracks re-burns full search cost on every retry.

### YouTube quota accounting

```typescript
// lib/quota.ts

const COSTS = {
  search: 100,
  playlistInsert: 50,
  playlistItemsInsert: 50,
  playlistItemsList: 1,
  playlistsList: 1,
} as const;

/** Google resets quota at midnight Pacific, NOT UTC. */
function quotaKey(): string {
  const pacific = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return `quota:youtube:${pacific}`;
}

export async function consumed(): Promise<number> {
  return (await redis.get<number>(quotaKey())) ?? 0;
}

export async function canAfford(units: number): Promise<boolean> {
  const budget = Number(process.env.YOUTUBE_DAILY_QUOTA ?? 10000);
  const reserve = 500;   // headroom so reads never starve
  return (await consumed()) + units <= budget - reserve;
}

export async function charge(units: number): Promise<void> {
  const key = quotaKey();
  await redis.incrby(key, units);
  await redis.expire(key, 60 * 60 * 36);
}
```

**Preflight before enqueuing, not during.** `estimateWriteCost(trackCount)` for YouTube is `50 * trackCount + 50`, plus `100 * unmatchedCount` for searches. If `canAfford` returns false, refuse the job up front with a clear message and the reset time. A job that dies at track 60 of 100 leaves a half-built playlist and no recovery path.

---

## Job Flow

```
1. Parse input link → { platform, playlistId }  (or accept exported JSON as source)
2. Fetch playlist metadata + all tracks (paginate; Spotify 100/page, Apple 100/page, YouTube 50/page)
3. Enqueue match job → Inngest
4. Per track: Redis cache → Tier 1 (ISRC) → Tier 2 (fuzzy) → Tier 3 (unmatched)
5. Stream progress to client (SSE or polling)
6. Render review screen: auto-matched (collapsed), needs-review (expanded), unmatched
   → Export available here, no destination auth required
7. Quota preflight if destination is YouTube — refuse up front if insufficient, don't fail mid-job
8. User confirms → auth destination → create playlist → batch add
9. Return destination link + export in all three formats
```

Job state lives in Redis with a 24hr TTL. Idempotency key on the write step so a retry never creates duplicate playlists.

### Job state shape

```typescript
interface Job {
  id: string;                        // nanoid
  status: 'pending' | 'matching' | 'awaiting_review'
        | 'writing' | 'complete' | 'failed';
  source: { platform: Platform; playlistId: string; name: string };
  destination?: {
    platform: Platform;
    mode: 'create' | 'append';
    playlistId?: string;             // set when mode === 'append'
    name?: string;
  };
  progress: { done: number; total: number };
  results: MatchResult[];
  skipped: { local: number; episodes: number; unavailable: number };
  error?: { code: ErrorCode; message: string; retryable: boolean };
  createdAt: number;
  writeIdempotencyKey?: string;
}
```

Redis keys: `job:{id}` (the object, 24h TTL), `job:{id}:progress` (hot counter, updated frequently to avoid rewriting the whole object per track).

### Error taxonomy

Give every failure a code. Vague errors are the main reason these tools feel broken.

```typescript
type ErrorCode =
  | 'INVALID_URL'            // couldn't parse
  | 'PLAYLIST_NOT_FOUND'     // 404 or private without auth
  | 'PLAYLIST_PRIVATE'       // needs source auth
  | 'AUTH_REQUIRED'
  | 'AUTH_EXPIRED'           // Apple user token — distinct message
  | 'QUOTA_EXCEEDED'         // YouTube, include reset time
  | 'RATE_LIMITED'           // exhausted retries
  | 'DEST_NOT_WRITABLE'      // not owner / collaborative
  | 'PLAYLIST_TOO_LARGE'     // >5000 tracks, refuse
  | 'PLATFORM_ERROR'         // 5xx after retries
  | 'PARTIAL_WRITE';         // some tracks added, then failed
```

`PARTIAL_WRITE` is the important one. If the write fails halfway, report exactly which tracks made it and offer to resume — never silently retry the whole thing, or the user gets duplicates.

**User-facing messages should say what to do**, not what broke:
- `AUTH_EXPIRED` → "Your Apple Music connection expired. Reconnect to continue." not "401 Unauthorized"
- `QUOTA_EXCEEDED` → "YouTube's daily limit is used up. Resets at midnight Pacific (in 4h)."

---

## Append to Existing Playlist

Cheap to build — the write path already takes a playlist ID, so accepting an existing one instead of creating a new one is mostly UI. Build it in v1.

**Flow:** at the destination step, offer "create new playlist" or "add to existing." For existing, list the user's writable playlists (`GET /v1/me/playlists` on Spotify, `GET /v1/me/library/playlists` on Apple) and let them pick — or accept a pasted playlist URL.

**Dedup is required.** Fetch the destination playlist's current track IDs before writing, and skip anything already present. Without this, appending the same source twice silently doubles the playlist. Match on platform ID first, ISRC second.

**Write permission check:** Spotify collaborative playlists and playlists owned by others are not writable. Filter the picker to playlists where `owner.id` matches the authed user. Apple's library playlists are all user-owned, but `canEdit` should still be checked.

Report back: `N added, M skipped as duplicates, K unmatched`.

---

## Playlist Export

A first-class output, not a fallback. Available from the review screen and from a standalone "just export this" entry point that skips the destination auth entirely.

**Why it matters:** the export is the user's portable, platform-independent record of a playlist. It works when a transfer fails, when the destination catalog is missing half the tracks, and when the user just wants their data. ISRCs make it re-importable by any other tool, now or years from now.

### Formats

**CSV** — the default. One row per track:
```
position,title,artist,album,isrc,duration_ms,source_url,spotify_id,apple_id,youtube_id,match_confidence
```
Only populate destination ID columns that were actually resolved. Empty cell means unmatched, not zero.

**JSON** — richer, for programmatic re-import:
```json
{
  "name": "...",
  "description": "...",
  "source_platform": "spotify",
  "source_url": "...",
  "exported_at": "2026-07-24T00:00:00Z",
  "track_count": 100,
  "tracks": [
    {
      "position": 1,
      "title": "...",
      "artists": ["..."],
      "album": "...",
      "isrc": "...",
      "duration_ms": 210000,
      "platform_ids": { "spotify": "...", "apple": "...", "youtube": null },
      "match_confidence": "high"
    }
  ]
}
```

**M3U8** — plain text, one track per line as `#EXTINF:{seconds},{artist} - {title}`. Universally understood by local players and other import tools. No URIs, metadata only.

### Rules
- Export must work with **zero destination auth** — it's derived entirely from the source read
- Include unmatched tracks with their original metadata; never filter them out
- UTF-8 with BOM on the CSV so Excel doesn't mangle non-Latin titles
- Filename: `{sanitized-playlist-name}-{yyyy-mm-dd}.{ext}`
- Generate server-side, stream as a download; do not build it in the browser from job state

### Re-import
Accept the JSON format back as an input source alongside platform links. This closes the loop: export from anywhere, import to anywhere, and the ISRCs make the second hop as accurate as the first. Treat it as a fourth `MusicProvider` with a read-only adapter.

---

## Explicitly Not Building

**No audio downloading, ripping, or MP3 extraction, in any form.** This includes stream capture, DRM circumvention, `yt-dlp` or equivalents, and any "convert to file" feature. It is copyright infringement, it is a DMCA circumvention issue on the DRM-protected services, and it would get the Spotify, Apple, and Google developer accounts this project depends on terminated. The playlist export above is the supported way to get portable data out. If a request seems to call for audio files, stop and escalate.

---

## v2 — Linked Playlist Sync (do not build yet)

Sketched here so v1 doesn't paint us into a corner. **Do not implement without an explicit go-ahead.**

The feature: link a source playlist to a destination playlist once; new tracks added to source get appended to destination automatically on a schedule.

### What this breaks

Statelessness. That's the whole cost, and it isn't small:

- Needs Postgres — persisted links, stored refresh tokens, per-link sync history.
- Needs encrypted-at-rest token storage, the exact risk v1 avoids by holding nothing. At ~10 known users this is bounded and acceptable. It would not be at 10,000.
- Needs a scheduled function per link. Neither Spotify nor Apple offers webhooks for playlist changes, so this is polling. Cost scales with users × links, not with actual usage.
- Needs token re-auth flows. **Apple Music user tokens expire in ~6 months and fail silently.** A sync that quietly stops working is worse than no sync — email on auth failure and mark the link visibly broken in the UI.

### Not for YouTube
At 50 quota units per track insert against a 10,000/day project-wide cap, ongoing YouTube-destination sync is not viable. YouTube can be a sync *source* only.

### Schema sketch

```sql
users            (id, email, created_at)
connections      (id, user_id, platform, encrypted_refresh_token,
                  token_expires_at, status, last_error_at)
playlist_links   (id, user_id, source_connection_id, source_playlist_id,
                  dest_connection_id, dest_playlist_id, schedule,
                  last_run_at, last_run_status, enabled)
synced_tracks    (link_id, source_track_id, dest_track_id, isrc,
                  synced_at, PRIMARY KEY (link_id, source_track_id))
```

`synced_tracks` is the important one. Without it, unmatched tracks get retried forever and a track the user deliberately deleted from the destination gets silently re-added on the next run. Both are trust-destroying bugs.

### Design notes
- **Append-only.** Never delete from the destination. A user removing a track downstream must not have it reappear, and deletions must not propagate upstream either.
- **Offer on-demand "sync now."** The incumbents run on fixed daily/weekly/monthly schedules with no manual trigger — a common complaint and a cheap win.
- Daily is a sensible default. Anything more frequent wastes API budget for a friend group.
- Keep the v1 `MusicProvider` interface unchanged. Sync is a scheduler wrapped around the existing match + append path, not a new engine.

---

## Security

- `.p8` private key server-side only, never in a client bundle or a `NEXT_PUBLIC_` var
- Tokens in encrypted httpOnly session cookies, `SameSite=Lax`, `Secure`
- No token ever persisted to a database in v1 — this is the main reason v1 is stateless, and it's a real advantage: a breach exposes nothing durable
- Validate playlist IDs against a strict regex before interpolating into any URL
- Rate limit by IP on the job-creation endpoint

---

## Legal / Platform Risk

- Spotify Developer ToS: no using platform data to train models, no manipulating streaming ratios. Both easy to comply with — just don't drift.
- Spotify quota extension required beyond 25 users. Apply early; approval is slow.
- Apple Developer Program membership must stay current or the developer token stops validating.
- YouTube: compliance audit required for any quota increase. Using an unofficial API client would fail that audit and risks project termination — see the hard rule in the YouTube section.
- No audio downloading, ever. See "Explicitly Not Building."
- Any platform can revoke access. Keep the matching engine isolated behind a `MusicProvider` interface so a fourth provider is a new adapter, not a rewrite. The export feature is also the hedge here — if a platform cuts you off, users can still get their data out.

---

## Build Order

1. `MusicProvider` interface + Spotify adapter (read public playlist)
2. Apple developer token generation + catalog ISRC lookup
3. Matching engine as a pure, standalone module with unit tests
4. Fixture test set: 50 hand-verified track pairs including 10 known-hard cases. **Write this before tuning thresholds.**
5. **Export (CSV/JSON/M3U8)** — build early, it's the cheapest useful thing and it's independent of every write path
6. Inngest job wiring + progress streaming
7. Review UI
8. Apple write path (MusicKit JS auth → create → batch add)
9. Spotify write path
10. Append-to-existing-playlist (picker + dedup) — small, high-value
11. YouTube read adapter (cheap quota, ships easily)
12. Redis cache + rate limiters + YouTube quota tracker
13. YouTube write path, behind `YOUTUBE_WRITE_ENABLED` flag
14. Exported-JSON re-import adapter
15. Error states

Ship to yourself after step 9. Steps 10, 12, and 15 before handing it to friends. Step 13 last — YouTube writes are quota-starved and will frustrate people if exposed before the budget UI exists.

---

## Testing Notes

- The matching module must be testable with zero network calls — inject the provider.
- Assert on confidence tiers, not just match/no-match. A `medium` that should have been `high` is a real regression. Any YouTube match marked `high` is a bug — assert against it.
- Export: round-trip test. Export a playlist to JSON, re-import it, confirm track-for-track identity including ISRCs.
- Quota accounting: unit-test the estimator against a known track count before trusting it to gate real jobs.

### Fixture format

`tests/fixtures/tracks.json` — 50 hand-verified entries. **Build this before tuning thresholds**, or you'll tune to your own music taste and ship something that fails on everyone else's.

```json
{
  "id": "classical-performer-ambiguity",
  "note": "Composer in title field, performer in artist — the classic failure",
  "source": {
    "platform": "spotify",
    "title": "Piano Concerto No. 21 in C Major, K. 467: II. Andante",
    "artists": ["Wolfgang Amadeus Mozart", "Vladimir Ashkenazy"],
    "isrc": "GBAAA7300123",
    "durationMs": 415000
  },
  "expect": {
    "apple":   { "confidence": "high", "viaTier": 1 },
    "youtube": { "confidence": "medium", "minScore": 0.75 }
  }
}
```

### Required hard cases

Cover at minimum:

1. **Classical** — composer vs performer in the artist field
2. **Live version** — must NOT match the studio version
3. **Remaster** — `(2011 Remaster)` should match the plain original at high confidence
4. **Featured artist formatted differently** — `Song (feat. X)` vs `Song` with X in the artists array
5. **Track absent from one catalog** — must return unmatched, not a wrong match
6. **Messy YouTube title** — `Artist - Song (Official Video) [HD] 4K` 
7. **Non-Latin script** — Korean/Japanese/Cyrillic title; catches ASCII-stripping bugs
8. **Karaoke trap** — a search where "Made Famous By" results rank above the real track
9. **Same title, different artists** — e.g. multiple songs called "Alive"
10. **Local file** — `is_local: true`, must be skipped and counted, not crash

### Regression harness

```bash
npm run test:matching        # pure, fast, no network
npm run test:matching -- --report   # prints accuracy table by case type
```

The report should show accuracy per category so a normalization change that fixes remasters but breaks classical is visible immediately. Track the aggregate number in the README and don't let it drop.

### Manual smoke test before sharing with anyone

1. A 200+ track playlist (pagination)
2. A playlist with a local file and a podcast episode in it
3. An expired Apple user token (delete it from the session and confirm the error message is human)
4. Append to a playlist that already contains half the source tracks (dedup)
5. A YouTube-destination transfer that exceeds remaining quota (preflight refusal)

---

## Operational Notes

### Local development

```bash
# .env.local — never commit
cp .env.example .env.local

npx inngest-cli@latest dev     # local Inngest, port 8288
npm run dev
```

Spotify redirect URI must be registered exactly, including port. Add both `http://localhost:3000/api/auth/spotify/callback` and the production URL in the Spotify dashboard.

Apple's MusicKit requires HTTPS **except** on `localhost`. If testing on a LAN device, use a tunnel (`ngrok`, `cloudflared`) or MusicKit auth silently fails.

### The `.p8` key

Downloadable exactly once from the Apple Developer portal. Store it in a password manager immediately. Losing it means revoking and regenerating, which invalidates every issued developer token.

For env vars, convert to single-line: `awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' AuthKey_XXX.p8`

### Adding a friend

1. Spotify dashboard → add their email to the app's user list (25 max, and this is a hard wall)
2. Apple Music needs no allowlist — any Apple Music subscriber can auth
3. YouTube: while the OAuth app is unverified, add them as a test user in Google Cloud Console (100 max)

Track who's added somewhere, because the Spotify list is easy to lose sight of and the 25-user error message is not obvious.

### Monitoring, such as it is

At this scale, skip observability tooling. Do log:
- Every job with its match rate — a sudden drop means a platform changed something
- Every quota charge for YouTube
- Every `AUTH_EXPIRED` — this is the silent-failure canary

A weekly glance at match rates catches most platform-side breakage before a friend reports it.
