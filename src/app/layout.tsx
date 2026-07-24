import type { Metadata } from 'next';
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

// Display: characterful, used with restraint for headings and the wordmark.
const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['500', '600', '700', '800'],
  display: 'swap',
});

// Body: quiet, legible.
const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
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
