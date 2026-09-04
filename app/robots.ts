import type { MetadataRoute } from 'next';
import { CANONICAL_ORIGIN } from '@/lib/brand';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/public/journeys/'],
      disallow: ['/api/', '/manage', '/memories'],
    },
    sitemap: `${CANONICAL_ORIGIN}/sitemap.xml`,
    host: CANONICAL_ORIGIN,
  };
}
