'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  changeClientPasswordAction,
  saveClientProfileAction,
} from './actions';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

type Props = {
  fullName: string;
  email: string;
};

export function ClientProfileForm({ fullName, email }: Props) {
  const router = useRouter();
  const toast = useToast();

  // Profile state
  const [name, setName] = useState(fullName);
  const [profileMsg, setProfileMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [profilePending, startProfile] = useTransition();

  // Password state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pwPending, startPw] = useTransition();

  function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const fd = new FormData();
    fd.append('full_name', name);
    startProfile(async () => {
      try {
        const r = await saveClientProfileAction(fd);
        if (r?.error) {
          const msg = humanError(r.error);
          setProfileMsg({ kind: 'error', text: msg });
          toast.show(msg, { variant: 'error' });
          return;
        }
        setProfileMsg({ kind: 'ok', text: 'Saved.' });
        toast.show('Profile saved.', { variant: 'success' });
        router.refresh();
      } catch (err) {
        const msg = humanError(err);
        setProfileMsg({ kind: 'error', text: msg });
        toast.show(msg, { variant: 'error' });
      }
    });
  }

  function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    const fd = new FormData();
    fd.append('current_password', currentPw);
    fd.append('new_password', newPw);
    fd.append('confirm_password', confirmPw);
    startPw(async () => {
      try {
        const r = await changeClientPasswordAction(fd);
        if (r?.error) {
          const msg = humanError(r.error);
          setPwMsg({ kind: 'error', text: msg });
          toast.show(msg, { variant: 'error' });
          return;
        }
        setPwMsg({ kind: 'ok', text: 'Password updated.' });
        toast.show('Password updated.', { variant: 'success' });
        setCurrentPw('');
        setNewPw('');
        setConfirmPw('');
      } catch (err) {
        const msg = humanError(err);
        setPwMsg({ kind: 'error', text: msg });
        toast.show(msg, { variant: 'error' });
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-ink-600">The name your realtor sees.</p>
        <form onSubmit={submitProfile} className="mt-5 space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium">Full name</label>
            <input
              id="full_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
            />
          </div>
          {profileMsg && (
            <div
              className={
                profileMsg.kind === 'ok'
                  ? 'rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800'
                  : 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800'
              }
            >
              {profileMsg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={profilePending}
            className="rounded-md bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
          >
            {profilePending ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between border-b border-ink-100 pb-2">
            <dt className="text-ink-500">Email</dt>
            <dd className="font-medium">{email}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-500">
          To change your email, contact your realtor.
        </p>

        <form onSubmit={submitPassword} className="mt-6 space-y-4 border-t border-ink-100 pt-6">
          <h3 className="text-sm font-semibold">Change password</h3>
          <div>
            <label htmlFor="current_password" className="block text-sm font-medium">Current password</label>
            <input
              id="current_password"
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new_password" className="block text-sm font-medium">New password</label>
              <input
                id="new_password"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
              />
            </div>
            <div>
              <label htmlFor="confirm_password" className="block text-sm font-medium">Confirm new password</label>
              <input
                id="confirm_password"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
              />
            </div>
          </div>
          {pwMsg && (
            <div
              className={
                pwMsg.kind === 'ok'
                  ? 'rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800'
                  : 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800'
              }
            >
              {pwMsg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={pwPending}
            className="rounded-md border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:border-ink-400 disabled:opacity-50"
          >
            {pwPending ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>
    </div>
  );
}
