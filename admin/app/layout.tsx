import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Realtor Portal — Admin',
  description: 'Onboard and manage realtor firms',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
