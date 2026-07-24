# Getting credentials

What you need to make Playlist Bridge actually read playlists and match them.

## What works today with these keys

With the keys below in `.env.local`, pasting a **public Spotify link** and
choosing **Apple Music** gives you: the tracks read, matched (ISRC → fuzzy), the
**review screen**, and **CSV/JSON/M3U8 export**.

**Private playlists** work too — under the input, "Private playlists? Connect"
offers **Spotify**, **Apple**, and **YouTube**. Connecting logs you in
(Spotify/YouTube via OAuth, Apple via the MusicKit popup) so your own private
playlists can be read. This needs `SESSION_SECRET` set (any 32+ char string) so
the login cookie can be encrypted. YouTube-connect also needs
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (an OAuth client, not just the API
key), and its callback `http://localhost:3000/api/auth/google/callback`
registered in Google Cloud Console.

**Writing works too.** On the review screen, "Send to {destination}" creates a
new playlist or appends to an existing one (deduping what's already there) and
reports `N added · M skipped as duplicates · K unmatched`. Writing needs the
**destination** account connected (the same login as private reads). YouTube
writes stay off until `YOUTUBE_WRITE_ENABLED=true` (quota-gated).

**Re-import closes the loop.** Under the link box, "Have a JSON export?
Re-import it" takes a previously exported `.json` file back in as a *source* —
no link, no login, no credentials. Because the export carries ISRCs, the second
hop matches as accurately as the first, so you can export from anywhere and
re-import to any destination (including restoring back to the origin service).

---

## Spotify

Reading public playlists and searching needs only a **Client ID + Secret**
(client-credentials — no user login).

1. Go to <https://developer.spotify.com/dashboard> and log in.
2. **Create app**. Name/description can be anything.
3. **Redirect URI** — add `http://localhost:3000/api/auth/spotify/callback`
   (the dashboard requires at least one to save; it's used later for writes).
4. Under "APIs used", tick **Web API**. Save.
5. Open the app → **Settings** → copy **Client ID**, and **View client secret**.

```bash
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```

**(later, for writing to a user's Spotify)** you'll add the OAuth flow and, in
the dashboard's **User Management**, add each friend's Spotify email — Spotify
development mode caps at **25 users**.

---

## Apple Music

Catalog search + ISRC lookup (matching *into* Apple, reading Apple catalog
playlists) needs a **MusicKit developer token**, built from three values.

1. You need an **Apple Developer Program** membership ($99/year) —
   <https://developer.apple.com/programs/>.
2. **Team ID** — <https://developer.apple.com/account> → Membership → copy the
   10-character **Team ID**.
3. **MusicKit key** — Account → **Certificates, Identifiers & Profiles** →
   **Keys** → **＋** → name it, tick **MusicKit**, Continue → Register.
   - Copy the **Key ID** (10 chars).
   - **Download the `.p8` file — you can only download it once.** Store it in a
     password manager immediately.
4. Convert the `.p8` to a single-line value for the env var:

   ```bash
   awk 'NF {sub(/\r/, ""); printf "%s\\n", $0}' AuthKey_XXXXXXXXXX.p8
   ```

```bash
APPLE_TEAM_ID=ABCDE12345
APPLE_KEY_ID=FGHIJ67890
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIGT...\n-----END PRIVATE KEY-----\n
DEFAULT_STOREFRONT=us
```

Common cause of a mystery **401**: using an App Store key instead of one with
**MusicKit** enabled, or not restoring the `\n` newlines (the awk command above
handles that).

**(later, for writing to a user's Apple library)** the browser gets a Music
User Token via MusicKit JS — no extra server key needed.

---

## YouTube (optional, reads only)

Reading YouTube playlists is cheap. Matching *into* YouTube burns quota and is
off by default.

1. <https://console.cloud.google.com> → create/select a project.
2. **APIs & Services → Library →** enable **YouTube Data API v3**.
3. **Credentials → Create credentials → API key.**

```bash
YOUTUBE_API_KEY=your_api_key
```

---

## Put it together

```bash
cp .env.example .env.local     # then fill in the values above
npm install
npm run dev                    # http://localhost:3000
```

Set `SESSION_SECRET` to any 32+ character string — it encrypts the login cookie
used by "Connect Spotify" (private playlists). Also register the callback URL
`http://localhost:3000/api/auth/spotify/callback` in the Spotify dashboard (you
already added it above).

Not needed yet (leave blank): `UPSTASH_REDIS_REST_*`, `GOOGLE_CLIENT_*` — those
come online with caching and YouTube writes.

---

## Background matching (large playlists)

Every convert now runs as a **background job**: pasting a link returns a job id
immediately and the review screen **streams live progress** (`12 / 100…`) over
Server-Sent Events while the match runs. Nothing extra is required for this —
it works out of the box.

Two execution backends sit behind it:

- **In-process (default).** The match runs right after the response is sent,
  via Next's `after()`. Fine for the friend-group scale; a very large playlist
  is bounded by the serverless function timeout.
- **Inngest (optional, for large playlists).** Set `INNGEST_ENABLED=true` and
  run `npx inngest-cli dev` locally (or wire Inngest Cloud in prod). Public
  playlist matches are then offloaded to a durable queue that survives past a
  single function's lifetime. Inngest discovers the functions at
  `http://localhost:3000/api/inngest`.

Only **public** source reads use Inngest — a private playlist needs your
connected-account token, which stays in-process and is never put into an
Inngest event.

**Production note:** in-process `after()` and the background worker run in
separate invocations, so they hand off job state through **Upstash Redis**.
Set `UPSTASH_REDIS_REST_*` before deploying, or progress/streaming won't be
visible across invocations. Local dev uses an in-memory store and needs
nothing.
