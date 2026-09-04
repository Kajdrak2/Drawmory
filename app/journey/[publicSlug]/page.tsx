import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { JourneyReveal } from '@/components/journey-reveal';
import { getPublicJourney } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

async function getJourneyOrNotFound(publicSlug: string) {
  try {
    return await getPublicJourney(publicSlug);
  } catch {
    notFound();
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}): Promise<Metadata> {
  const { publicSlug } = await params;
  try {
    const journey = await getPublicJourney(publicSlug);
    const shortCode = publicSlug.slice(0, 5).toUpperCase();
    const title = `Journey #${shortCode} — ${journey.participantCount} ${journey.participantCount === 1 ? 'memory' : 'memories'}`;
    const description =
      journey.status === 'COMPLETED'
        ? `A completed collaborative drawing journey with ${journey.participantCount} memories across ${journey.countryCount} ${journey.countryCount === 1 ? 'country' : 'countries'}.`
        : `An ongoing collaborative drawing journey with ${journey.participantCount} ${journey.participantCount === 1 ? 'memory' : 'memories'}.`;
    const previewImage = journey.drawings.at(-1);
    const canonicalPath = `/journey/${encodeURIComponent(publicSlug)}`;
    const images = previewImage
      ? [{
          url: previewImage.imageUrl,
          width: previewImage.width,
          height: previewImage.height,
          alt: `Drawmory journey #${shortCode}`,
        }]
      : [];
    return {
      title,
      description,
      alternates: { canonical: canonicalPath },
      robots: { index: true, follow: true },
      openGraph: { type: 'website', url: canonicalPath, title, description, images },
      twitter: { card: 'summary_large_image', title, description, images },
    };
  } catch {
    return {
      title: 'Journey not found',
      robots: { index: false, follow: false },
      openGraph: { images: [] },
      twitter: { images: [] },
    };
  }
}

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;
  const initialJourney = await getJourneyOrNotFound(publicSlug);
  return <JourneyReveal publicSlug={publicSlug} initialJourney={initialJourney} />;
}
