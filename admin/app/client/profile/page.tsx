import { redirect } from 'next/navigation';
import { getMe } from '@/lib/supabaseSsr';
import { ClientProfileForm } from './ClientProfileForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profile' };

export default async function ClientProfilePage() {
  const me = await getMe();
  if (!me) {
    redirect('/login');
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Profile</h1>
      <p className="mt-1 text-sm text-slate-600">
        Update your name and password.
      </p>

      <div className="mt-8">
        <ClientProfileForm fullName={me.full_name ?? ''} email={me.email ?? ''} />
      </div>
    </main>
  );
}
