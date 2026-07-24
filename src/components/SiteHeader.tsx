import Link from 'next/link';
import { BridgeMark } from './BridgeMark';

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="Playlist Bridge home">
        <BridgeMark className="mark" size={30} />
        Playlist<b>Bridge</b>
        <span className="ver">v0.1</span>
      </Link>
      <span className="header-note">Spotify // Apple // YouTube</span>
    </header>
  );
}
