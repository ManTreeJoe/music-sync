import { SiteHeader } from '@/components/SiteHeader';
import { LinkForm } from '@/components/LinkForm';

const TIERS = [
  {
    k: 'Tier 1 // authoritative',
    name: 'ISRC',
    desc: 'The recording code both catalogs share. An exact, high-confidence match.',
  },
  {
    k: 'Tier 2 // fuzzy',
    name: 'Matched',
    desc: 'Titles and artists normalized and scored — remaster noise stripped, karaoke traps rejected.',
  },
  {
    k: 'Tier 3 // unresolved',
    name: 'Unmatched',
    desc: 'Never guessed at. Kept with its original metadata and a search link, so nothing is lost.',
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />

      <section className="hero wrap">
        <p className="eyebrow glow-red">Spotify // Apple Music // YouTube Music</p>
        <h1>
          Move the playlist.
          <br />
          <span className="thin">Keep the record.</span>
        </h1>
        <p className="hero-lede">
          Paste a link and Playlist Bridge matches every track across catalogs —
          by ISRC first, then by a tuned fuzzy pass — so a hundred songs land on
          the other service in one go. Whatever doesn&apos;t match, you resolve
          in a couple of minutes. Nothing is ever locked in: export the whole
          thing as CSV, JSON, or M3U8 at any point.
        </p>

        {/* Signature: the signal chain. Its connector treatment is the same
            language the review screen uses to encode match confidence. */}
        <div className="chain" aria-hidden="true">
          <div className="node on">
            <span className="dot" />
            <span className="label">
              <b>Source</b>public link
            </span>
          </div>
          <div className="cable live" />
          <div className="node on">
            <span className="dot" />
            <span className="label">
              <b>Match</b>ISRC · fuzzy
            </span>
          </div>
          <div className="cable live" />
          <div className="node on">
            <span className="dot" />
            <span className="label">
              <b>Destination</b>new playlist
            </span>
          </div>
          <div className="cable" />
          <div className="node">
            <span className="dot" />
            <span className="label">
              <b>Export</b>csv · json · m3u8
            </span>
          </div>
        </div>

        <LinkForm />
      </section>

      {/* Electric-block section, echoing the reference's bold color band. */}
      <section className="band-blue">
        <div className="wrap">
          <h2 className="band-title">How it matches</h2>
          <p className="band-lede">
            Three passes, in order. Each track falls through until something
            authoritative sticks — and a wrong track is never better than an
            honest gap.
          </p>
          <div className="tiers">
            {TIERS.map((t) => (
              <div className="tier" key={t.name}>
                <div className="t-k">{t.k}</div>
                <div className="t-name">{t.name}</div>
                <div className="t-desc">{t.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="foot wrap">
        A private tool, built for a handful of friends. Reads public playlists
        without a login; only asks for access at the moment it writes. No
        accounts, no stored tokens ·{' '}
        <span className="mono">matching engine: ISRC → fuzzy → unmatched</span>
      </footer>
    </>
  );
}
