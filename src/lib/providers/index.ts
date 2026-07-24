// lib/providers/index.ts
//
// Provider registry: platform → MusicProvider. Network adapters (Spotify,
// Apple, YouTube) register here as they're implemented. Keeping the lookup
// behind this registry is what lets a fourth provider be a new adapter rather
// than a rewrite — the matching engine never imports providers directly.

import type { MusicProvider, Platform } from './types';
import { SpotifyProvider } from './spotify';
import { AppleProvider } from './apple';
import { YouTubeProvider } from './youtube';

const registry = new Map<Platform, MusicProvider>();

export function registerProvider(provider: MusicProvider): void {
  registry.set(provider.platform, provider);
}

// Register the adapters implemented so far. Instantiation is cheap and does no
// network or env access until a method is called. YouTube lands later.
registerProvider(new SpotifyProvider());
registerProvider(new AppleProvider());
// YouTube ships as a read source first; writes are gated by YOUTUBE_WRITE_ENABLED.
registerProvider(new YouTubeProvider());

export function getProvider(platform: Platform): MusicProvider {
  const provider = registry.get(platform);
  if (!provider) {
    throw new Error(`No provider registered for platform: ${platform}`);
  }
  return provider;
}

export function tryGetProvider(platform: Platform): MusicProvider | undefined {
  return registry.get(platform);
}

/** Find the provider whose parseUrl accepts this URL. Null if none match. */
export function resolveProviderForUrl(
  url: string,
): { provider: MusicProvider; playlistId: string } | null {
  for (const provider of registry.values()) {
    const parsed = provider.parseUrl(url);
    if (parsed) return { provider, playlistId: parsed.playlistId };
  }
  return null;
}

export type { MusicProvider, Platform };
