import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { BRAND } from '../lib/brand';
import { LanguageProvider } from '@/components/language-provider';

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || requestHeaders.get('host') || 'localhost:3000';
  const forwardedProtocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProtocol || (host.startsWith('localhost') ? 'http' : 'https');
  const metadataBase = new URL(process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`);

  return {
    metadataBase,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    openGraph: {
      title: `${BRAND.name} — ${BRAND.tagline}`,
      description: BRAND.description,
      images: [{ url: '/og.png', width: 1730, height: 909, alt: BRAND.tagline }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${BRAND.name} — ${BRAND.tagline}`,
      description: BRAND.description,
      images: ['/og.png'],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
