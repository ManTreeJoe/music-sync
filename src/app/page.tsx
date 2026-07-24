import { SiteHeader } from '@/components/SiteHeader';
import { LinkForm } from '@/components/LinkForm';

export default function Home() {
  return (
    <>
      <SiteHeader />

      <section className="hero wrap">
        <p className="eyebrow">Spotify → Apple Music → YouTube Music</p>
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

        {/* Signature: the signal chain. The connector treatment is the same
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

      <footer className="foot wrap">
        A private tool, built for a handful of friends. Reads public playlists
        without a login; only asks for access at the moment it writes. No
        accounts, no stored tokens ·{' '}
        <span className="mono">matching engine: ISRC → fuzzy → unmatched</span>
      </footer>
    </>
  );
}
