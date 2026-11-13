import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

type ChangeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url;
  const now = new Date();

  const routes: Array<{
    url: string;
    lastModified: Date;
    changeFrequency: ChangeFrequency;
    priority: number;
  }> = [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/track`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/privacy-policy`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/support`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/requests`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/wallet`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${base}/addresses`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
    { url: `${base}/settings`, lastModified: now, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${base}/notifications`, lastModified: now, changeFrequency: 'weekly', priority: 0.5 },
  ];

  // Admin routes are intentionally excluded: robots.ts disallows /admin/, and
  // listing a robots-blocked URL in the sitemap produces "blocked by robots.txt"
  // errors in Search Console instead of indexing anything.

  return routes;
}
