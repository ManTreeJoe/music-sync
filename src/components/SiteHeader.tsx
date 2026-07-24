import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="site-header wrap">
      <Link href="/" className="wordmark">
        Playlist<b>Bridge</b>
        <span className="mono">v0.1</span>
      </Link>
      <span className="header-note">Spotify · Apple Music · YouTube Music</span>
    </header>
  );
}
