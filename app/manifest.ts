import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Drawmory — Collaborative Drawing Game',
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f2e9',
    theme_color: '#f6f2e9',
    icons: [
      {
        src: '/favicon-256.png?v=7',
        sizes: '256x256',
        type: 'image/png',
      },
    ],
  };
}
