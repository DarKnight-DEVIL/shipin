import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/verify-email/', '/api/'],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
