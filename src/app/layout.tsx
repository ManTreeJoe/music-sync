import type { Metadata } from 'next';
import { Anton, Archivo, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Display: ultra-condensed heavy caps — the stadium-poster voice.
const display = Anton({
  subsets: ['latin'],
  variable: '--font-display',
  weight: '400',
  display: 'swap',
});

// Body/UI: an industrial grotesque with range.
const body = Archivo({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

// Mono: reserved for machine artifacts — ISRCs, durations, platform IDs.
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '700'],
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
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
