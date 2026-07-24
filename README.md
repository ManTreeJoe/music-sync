# Playlist Bridge

Cross-platform playlist transfer between Spotify, Apple Music, and YouTube Music.
Paste a playlist link, get a converted playlist on the other service.

The full product brief lives in [`CLAUDE.md`](./CLAUDE.md). This README covers
what's implemented today and how to work on it.

## What's built

The foundation is the **pure, testable core** — the matching engine and export
pipeline — plus the project scaffolding. These are the pieces the brief flags as
buildable without any platform credentials or network access, and they're fully
covered by tests.

```
src/lib/
  providers/
    types.ts          # MusicProvider interface + shared Track/Playlist/MatchResult types
    index.ts          # provider registry (platform → provider)
    spotifyItems.ts   # pure Spotify item → Track normalization (local/episode/relink rules)
    jsonFile.ts       # read-only re-import adapter for exported JSON
  matching/           # ← zero imports from providers/ (the key structural rule)
    jaroWinkler.ts    # vendored Jaro-Winkler similarity
    normalize.ts      # pure title/artist normalization
    score.ts          # scoring + negative-signal rejection
    engine.ts         # Tier 1 (ISRC) → Tier 2 (fuzzy) → Tier 3 (unmatched)
    index.ts          # public surface
  export/
    model.ts          # match results → export model
    csv.ts json.ts m3u8.ts index.ts
tests/
  fixtures/tracks.json # hand-verified hard cases (injected candidates, no network)
  matching/  export/
```

### Matching engine

- **Tier 1 — ISRC** (authoritative, `high`). Prefers the exact-duration edition
  among multiple ISRC hits.
- **Tier 2 — normalized fuzzy** (`medium` ≥ 0.90, `low` 0.70–0.90). Jaro-Winkler
  on normalized titles/artists + duration, with featured-artist bonus.
- **Tier 3 — unmatched** (`none`). Never silently dropped.
- **Negative signals** — `live`, `remix`, `karaoke`, `made famous by`, … are
  rejected unless the same term is in the source title.
- **YouTube ceiling** — any match involving YouTube is capped at `medium`
  (no ISRC available).

The engine operates only on the normalized `Track` type. It never imports from
`providers/`, so it's tested by **injecting** the candidate lists a provider
would return — zero network.

### Export

CSV (UTF-8 BOM), JSON (re-importable), and M3U8, rendered server-side. Unmatched
tracks are always included with their original metadata. The JSON round-trips:
export → re-import preserves track identity including ISRCs.

## Testing

```bash
npm install
npm test                     # full suite (185 tests, no network)
npm run test:matching        # matching engine only
npm run test:matching:report # + per-category accuracy table
npm run typecheck            # tsc --noEmit
```

The fixtures in `tests/fixtures/tracks.json` are **50 hand-verified cases**
across 23 categories, injecting the candidate lists a provider would return so
the engine runs with zero network. Current matching accuracy:

```
AGGREGATE   50/50   100.0%
```

`npm run test:matching:report` prints the full breakdown by category, so a
normalization change that fixes remasters but breaks classical is visible
immediately. **Don't let the aggregate drop, and extend the fixtures before
tuning thresholds.**

They cover the brief's required hard cases: classical composer/performer
ambiguity, live-vs-studio, remaster, featured-artist formatting, catalog-absent,
messy YouTube titles, non-Latin script, the karaoke "made famous by" trap, and
same-title/different-artist — plus local-file skipping (hard case 10), which is
a read-layer concern covered in `tests/matching/spotifyItems.test.ts`.

## Built

- Provider adapters — Spotify, Apple (developer-token JWT + MusicKit), YouTube
  read; JSON re-import as a fourth read-only source.
- Matching engine (Tier 1/2/3) with the 50-case fixture harness above.
- OAuth (Spotify/Google PKCE, Apple MusicKit) for private reads and writes.
- Background jobs via Next `after()` / Inngest, with SSE progress streaming for
  both matching and writing.
- Write paths (create + append-with-dedup) for Spotify and Apple; YouTube behind
  `YOUTUBE_WRITE_ENABLED`.
- Redis cache (ISRC/text), sliding-window rate limiters, YouTube quota
  accounting, write idempotency.
- `PARTIAL_WRITE` recovery — a write interrupted mid-batch hands back a resume
  plan (which tracks landed, which remain) and the UI appends only the rest.
- Export (CSV/JSON/M3U8) and the review UI.

Configuration lives in [`.env.example`](./.env.example); setup steps in
[`docs/SETUP.md`](./docs/SETUP.md). No secrets are committed; `.p8` keys and
`.env*.local` are gitignored.

## Not yet built

- v2 linked-playlist sync (needs Postgres — deliberately out of v1 scope).

## Hard rules from the brief

- `lib/matching/` must never import from `lib/providers/`.
- No reverse-engineered API clients (e.g. `ytmusicapi`) — YouTube uses the
  official Data API v3 only.
- No audio downloading/ripping in any form.
- Stay under 25 Spotify users (development mode).
