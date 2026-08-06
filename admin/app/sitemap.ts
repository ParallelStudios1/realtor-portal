import type { MetadataRoute } from 'next';

/**
 * Generates /sitemap.xml.
 *
 * Only genuinely public, indexable pages belong here. Listing a page in the
 * sitemap while robots.txt disallows it sends Google contradictory signals, so
 * this list deliberately mirrors what robots.ts permits.
 */
const SITE_URL = 'https://realtorportal.parallelstudios.co';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: SITE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/signup`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/login`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/sms-consent`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.1,
    },
  ];
}
