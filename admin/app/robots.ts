import type { MetadataRoute } from 'next';

/**
 * Generates /robots.txt.
 *
 * The point here is as much about what NOT to index as what to index. Every
 * signed-in surface (deals, client portals, attorney views, invites) is either
 * private or thin, and letting Google crawl it wastes crawl budget on pages
 * that can never rank — and risks surfacing a URL that should stay private.
 *
 * Note: disallowing a path stops crawling, not indexing of a URL someone links
 * to. Anything genuinely sensitive is already behind auth; this is hygiene.
 */
const SITE_URL = 'https://realtorportal.parallelstudios.co';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/deal',
          '/attorney',
          '/client',
          '/superadmin',
          '/welcome',
          '/invite',
          '/participant',
          '/onboarding',
          '/firms',
          // Per-firm landing pages: near-duplicate content across firms, which
          // is exactly what thin-content penalties are for.
          '/value',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
