import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="Playlist Bridge home">
        <span className="brandmark" aria-hidden>
          →
        </span>
        Playlist<b>Bridge</b>
        <span className="ver">v0.1</span>
      </Link>
      <span className="header-note">Spotify // Apple // YouTube</span>
    </header>
  );
}
