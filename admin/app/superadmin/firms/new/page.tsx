import { redirect } from 'next/navigation';

// Firms now self-serve through /signup. This god-mode "create firm" page is retired.
export default function LegacyNewFirmPage() {
  redirect('/superadmin');
}
