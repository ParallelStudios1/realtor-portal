import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/Toast';
import { NavigationProgress } from '@/components/NavigationProgress';
import { GetTheAppBanner } from '@/components/GetTheAppBanner';
import { Analytics } from '@vercel/analytics/react';

// Inter - one real font, loaded once. Variable-axis means we don't pay for
// extra weight files. display: 'swap' keeps the first paint readable while
// the font streams in. preload puts the font on the critical path.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
});

const SITE_URL = 'https://realtorportal.parallelstudios.co';

export const metadata: Metadata = {
  // Every relative URL below (canonical, OG image) resolves against this.
  // Without it Next emits relative og:url values, which crawlers and social
  // scrapers ignore.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Realtor Portal — Client portal software for real estate firms',
    // Child pages set only their own title; this keeps the brand on the end
    // without every page having to repeat it.
    template: '%s | Realtor Portal',
  },
  description:
    'Run every real estate deal in one place. Shared deadlines, documents with per-file visibility, and a branded portal your buyers, sellers, co-agents and closing attorney can all see. Free trial.',
  applicationName: 'Realtor Portal',
  authors: [{ name: 'Parallel Studios LLC', url: 'https://parallelstudios.co' }],
  creator: 'Parallel Studios LLC',
  publisher: 'Parallel Studios LLC',
  alternates: { canonical: '/' },
  // Tell Google it may show full-size images and long snippets — the default
  // for an unknown site is conservative and truncates rich results.
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    siteName: 'Realtor Portal',
    url: SITE_URL,
    title: 'Realtor Portal — Client portal software for real estate firms',
    description:
      'Shared deadlines, documents with per-file visibility, and a branded portal your clients, co-agents and closing attorney can all see.',
    locale: 'en_US',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Realtor Portal' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Realtor Portal — Client portal software for real estate firms',
    description:
      'Shared deadlines, documents with per-file visibility, and a branded portal your clients, co-agents and closing attorney can all see.',
    images: ['/logo.png'],
  },
  category: 'business',
  // Apple's native Smart App Banner. Safari draws this above the page and,
  // unlike anything we can build, knows whether the app is already installed
  // (it says "Open" rather than "Get"). Its one flaw is that a dismissal is
  // permanent and undetectable, so GetTheAppBanner waits 24h and then takes
  // over as the recoverable fallback.
  // (Next 14.2 has no typed `appleItunesApp` field, so emit the tag directly.)
  other: {
    'apple-itunes-app': 'app-id=6768115138',
  },
};

/**
 * Schema.org structured data.
 *
 * This is invisible to visitors but is how Google understands that Realtor
 * Portal is a paid software product rather than a generic page — it's what
 * makes a listing eligible for a rich result showing price and platform
 * instead of a plain blue link. Everything below is factual; inventing
 * aggregateRating without real reviews is a manual-action risk, so there is
 * none here until there are genuine reviews to cite.
 */
const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Parallel Studios LLC',
      url: 'https://parallelstudios.co',
      logo: `${SITE_URL}/logo.png`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Realtor Portal',
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en-US',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: 'Realtor Portal',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Real Estate Transaction Management',
      operatingSystem: 'iOS, Android, Web',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
      description:
        'Client portal and transaction management software for real estate firms. Shared deadlines, documents with per-file visibility, and a branded portal for buyers, sellers, co-agents and closing attorneys.',
      offers: [
        {
          '@type': 'Offer',
          name: 'Starter',
          price: '99.00',
          priceCurrency: 'USD',
          description: 'Up to 3 agents, billed monthly.',
        },
        {
          '@type': 'Offer',
          name: 'Team',
          price: '299.00',
          priceCurrency: 'USD',
          description: 'Up to 15 agents, billed monthly.',
        },
        {
          '@type': 'Offer',
          name: 'Brokerage',
          price: '799.00',
          priceCurrency: 'USD',
          description: 'Up to 50 agents, billed monthly.',
        },
      ],
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-ink-50 text-ink-900 antialiased leading-[1.55] [font-feature-settings:'cv11','ss01']">
        {/* Top-edge progress bar that fires the moment the user clicks any
            link or data-loading button. Wrapped in Suspense because it
            reads useSearchParams which Next requires to be suspended. */}
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <ToastProvider>{children}</ToastProvider>
        {/* Phones only, and only where Apple's own banner isn't already
            showing. Renders nothing on desktop, tablet, or after dismissal. */}
        <GetTheAppBanner />
        {/* Invisible to visitors; read by search engines. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
        />
        {/* Pageview analytics (Vercel). This is what was missing during the
            first ad campaign: we had no way to know how many clicks actually
            became visitors. Anonymous, cookieless, no consent banner needed. */}
        <Analytics />
      </body>
    </html>
  );
}
