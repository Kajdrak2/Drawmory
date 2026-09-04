import type { Metadata } from 'next';
import { HandoffFlow } from '@/components/handoff-flow';

export const metadata: Metadata = {
  title: 'Receive this Drawmory',
  robots: { index: false, follow: false, noarchive: true },
  openGraph: { images: [] },
  twitter: { images: [] },
};

export default async function HandoffPage({
  params,
}: {
  params: Promise<{ handoffToken: string }>;
}) {
  const { handoffToken } = await params;
  return <HandoffFlow token={handoffToken} />;
}
