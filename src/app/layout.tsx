import type { Metadata } from 'next';
import { Anton, JetBrains_Mono, DotGothic16 } from 'next/font/google';
import './globals.css';

// Display: ultra-condensed heavy caps — the glowing-headline voice.
const display = Anton({
  subsets: ['latin'],
  variable: '--font-display',
  weight: '400',
  display: 'swap',
});

// Body + labels + data: monospace throughout, the way The Send sets everything.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '700'],
  display: 'swap',
});

// Dot-matrix / LED accent for eyebrows and section tags.
const dot = DotGothic16({
  subsets: ['latin'],
  variable: '--font-dot',
  weight: '400',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Playlist Bridge',
  description:
    'Move a playlist between Spotify, Apple Music, and YouTube Music. Paste a link, review the matches, keep a portable copy.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${mono.variable} ${dot.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
