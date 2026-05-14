import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/Toast';

// Inter — the unofficial standard for modern product UI. Variable axis +
// optical sizing gives crisp text at every size without shipping multiple
// weight files.
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Realtor Portal',
  description: 'A branded portal for real estate clients and their realtor.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-slate-50 text-slate-900 antialiased [font-feature-settings:'cv11','ss01']">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
