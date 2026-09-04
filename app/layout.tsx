import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BRAND, CANONICAL_ORIGIN } from '../lib/brand';
import { LanguageProvider } from '@/components/language-provider';
import { ContentPreferencesProvider } from '@/components/content-preferences';

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_ORIGIN),
  applicationName: BRAND.name,
  title: {
    default: 'Drawmory — Collaborative Drawing Game',
    template: '%s | Drawmory',
  },
  description: BRAND.description,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico?v=7', type: 'image/x-icon', sizes: 'any' },
      { url: '/favicon-256.png?v=7', type: 'image/png', sizes: '256x256' },
    ],
    shortcut: '/favicon.ico?v=7',
    apple: [{ url: '/apple-touch-icon.png?v=7', type: 'image/png', sizes: '180x180' }],
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: BRAND.name,
    locale: 'en_GB',
    title: 'Drawmory — Collaborative Drawing Game',
    description: BRAND.description,
    images: [{ url: '/og.png', width: 1730, height: 909, alt: BRAND.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Drawmory — Collaborative Drawing Game',
    description: BRAND.description,
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#f6f2e9',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <ContentPreferencesProvider>{children}</ContentPreferencesProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
