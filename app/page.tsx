import type { Metadata } from 'next';
import { HomePage } from '@/components/home-page';
import { BRAND, CANONICAL_ORIGIN } from '@/lib/brand';
import { listPublicJourneys } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  verification: { google: '4ZMpJjVh90a7OttfxpVxf-mrcOvNBMnfpfWdSDovpxc' },
  alternates: { canonical: '/' },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

const websiteStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${CANONICAL_ORIGIN}/#website`,
  url: `${CANONICAL_ORIGIN}/`,
  name: BRAND.name,
  description: BRAND.description,
  inLanguage: ['en', 'fr', 'es', 'de', 'pt-BR', 'tr', 'ar', 'ja', 'ko', 'zh-CN'],
};

type HomeJourneyList = Awaited<ReturnType<typeof listPublicJourneys>>;

async function getHomeJourneys(): Promise<[HomeJourneyList, HomeJourneyList]> {
  try {
    return await Promise.all([
      listPublicJourneys({ status: 'all', sort: 'random', limit: 14 }),
      listPublicJourneys({ status: 'all', sort: 'votes', limit: 6 }),
    ]);
  } catch {
    return [[], []];
  }
}

export default async function Home() {
  const [initialLibrary, initialHall] = await getHomeJourneys();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData).replace(/</g, '\\u003c') }}
      />
      <HomePage initialLibrary={initialLibrary} initialHall={initialHall} />
    </>
  );
}
