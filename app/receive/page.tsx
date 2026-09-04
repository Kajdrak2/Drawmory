import type { Metadata } from 'next';
import { ReceiveFlow } from '@/components/receive-flow';

const title = 'Receive a Drawmory';
const description = 'Continue a collaborative drawing journey from a link, passcode, or the world queue.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/receive' },
  openGraph: {
    type: 'website',
    url: '/receive',
    siteName: 'Drawmory',
    title: `${title} | Drawmory`,
    description,
    images: [{ url: '/og.png', width: 1730, height: 909, alt: 'Drawmory' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${title} | Drawmory`,
    description,
    images: ['/og.png'],
  },
};

export default function ReceivePage() {
  return <ReceiveFlow />;
}
