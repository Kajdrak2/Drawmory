import type { Metadata } from 'next';
import { CarryFlow } from '@/components/carry-flow';

export const metadata: Metadata = {
  title: 'Draw from memory',
  robots: { index: false, follow: false, noarchive: true },
  openGraph: { images: [] },
  twitter: { images: [] },
};

export default async function CarryPage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  return <CarryFlow claimId={claimId} />;
}
