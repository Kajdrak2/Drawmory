import type { Metadata } from 'next';
import { HowItWorks } from '@/components/how-it-works';

const title = 'How it works';
const description = 'See a drawing once, redraw it from memory, and pass the new version to the next player.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/how-it-works' },
  openGraph: {
    type: 'website',
    url: '/how-it-works',
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

export default function HowItWorksPage() {
  return <HowItWorks />;
}
