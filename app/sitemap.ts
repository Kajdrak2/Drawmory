import type { MetadataRoute } from 'next';
import { CANONICAL_ORIGIN } from '@/lib/brand';
import { listPublicJourneyIndexEntries } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let journeys: Awaited<ReturnType<typeof listPublicJourneyIndexEntries>> = [];
  try {
    journeys = await listPublicJourneyIndexEntries();
  } catch {
    // The stable public routes remain discoverable if storage is temporarily unavailable.
  }

  return [
    {
      url: `${CANONICAL_ORIGIN}/`,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${CANONICAL_ORIGIN}/how-it-works`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${CANONICAL_ORIGIN}/create`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${CANONICAL_ORIGIN}/receive`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    ...journeys.map((journey) => ({
      url: `${CANONICAL_ORIGIN}/journey/${encodeURIComponent(journey.publicSlug)}`,
      lastModified: new Date(journey.updatedAt),
      changeFrequency: 'daily' as const,
      priority: 0.7,
    })),
  ];
}
