import type { Metadata } from 'next';
import { PassFlow } from '@/components/pass-flow';

export const metadata: Metadata = {
  title: 'Pass this Drawmory on',
  robots: { index: false, follow: false, noarchive: true },
  openGraph: { images: [] },
  twitter: { images: [] },
};

export default async function PassPage({
  params,
}: {
  params: Promise<{ journeyId: string }>;
}) {
  const { journeyId } = await params;
  return <PassFlow journeyId={journeyId} />;
}
