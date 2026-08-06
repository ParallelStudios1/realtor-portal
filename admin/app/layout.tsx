import './globals.css';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/Toast';
import { NavigationProgress } from '@/components/NavigationProgress';
import { GetTheAppBanner } from '@/components/GetTheAppBanner';

// Inter - one real font, loaded once. Variable-axis means we don't pay for
// extra weight files. display: 'swap' keeps the first paint readable while
// the font streams in. preload puts the font on the critical path.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
});

export const metadata: Metadata = {
  title: 'Realtor Portal',
  description: 'A branded portal for real estate clients and their realtor.',
  // Apple's native Smart App Banner. Safari on iPhone renders this itself,
  // above the page, and it knows whether the app is already installed — so it
  // says "Open" instead of "Get" for existing users, which our own banner
  // can't detect. GetTheAppBanner stands down on iOS Safari to avoid stacking.
  // (Next 14.2 has no typed `appleItunesApp` field, so emit the tag directly.)
  other: {
    'apple-itunes-app': 'app-id=6768115138',
  },
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
      </body>
    </html>
  );
}
