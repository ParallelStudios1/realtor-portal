import { redirect } from 'next/navigation';

// Legacy super-admin firm detail. Replaced by self-serve realtor dashboard.
// TODO: rebuild as a god-mode firm inspector once we have multiple support staff.
export default function LegacyFirmDetailPage() {
  redirect('/superadmin');
}
