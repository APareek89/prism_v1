// app/layout.tsx
//
// Root layout. Loads the three Google fonts via next/font and binds them to CSS
// variables so the --disp / --body / --mono families in globals.css resolve. Imports
// the design tokens and renders the AppShell (Sidebar + main) around every route.

import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

// Font CSS variables. globals.css :root sets --disp/--body/--mono to the family
// names; next/font injects the @font-face under these variable names so they resolve.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Prism — AI-Native Engineering Index',
  description: 'One light · four signals. Measure and improve the ROI of Claude Code spend.',
};

export const viewport: Viewport = {
  themeColor: '#0d111c',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${jetBrainsMono.variable}`}
    >
      <head>
        {/*
          globals.css defines --disp/--body/--mono using the literal family names.
          next/font hashes the real family names, so we re-point those three CSS vars
          to the next/font variables here (layering on top of globals.css, not editing
          it). The literal names remain as graceful fallbacks if a font fails to load.
        */}
        <style>{`
          :root {
            --disp: var(--font-space-grotesk), 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
            --body: var(--font-ibm-plex-sans), 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif;
            --mono: var(--font-jetbrains-mono), 'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
          }
        `}</style>
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
