import type { Metadata } from 'next';
import { JourneyReveal } from '@/components/journey-reveal';
import { getPublicJourney } from '@/lib/server/repository';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}): Promise<Metadata> {
  const { publicSlug } = await params;
  try {
    const journey = await getPublicJourney(publicSlug);
    const title =
      journey.status === 'COMPLETED'
        ? `${journey.participantCount} memories — Drawmory`
        : `${journey.redrawCount} of ${journey.targetRedraws} redraws — Drawmory`;
    const description =
      journey.status === 'COMPLETED'
        ? 'Completed Drawmory.'
        : 'Drawmory in progress.';
    const firstImage = journey.drawings[0]?.imageUrl;
    return {
      title,
      description,
      openGraph: { title, description, images: firstImage ? [firstImage] : [] },
      twitter: { title, description, images: firstImage ? [firstImage] : [] },
    };
  } catch {
    return { title: 'Drawmory journey', openGraph: { images: [] }, twitter: { images: [] } };
  }
}

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ publicSlug: string }>;
}) {
  const { publicSlug } = await params;
  return <JourneyReveal publicSlug={publicSlug} />;
}
