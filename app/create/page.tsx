import type { Metadata } from 'next';
import { CreateFlow } from '@/components/create-flow';

const title = 'Create a drawing journey';
const description = 'Start a new collaborative drawing journey and pass it from memory to memory.';

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: '/create' },
  openGraph: {
    type: 'website',
    url: '/create',
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

export default function CreatePage() {
  return <CreateFlow />;
}
