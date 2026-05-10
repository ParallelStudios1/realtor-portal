'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  changePasswordAction,
  saveFirmAction,
  saveProfileAction,
} from './actions';

type Props = {
  fullName: string;
  email: string;
  isFirmAdmin: boolean;
  firm: {
    id: string;
    name: string;
    tagline: string;
    brand_color: string;
    accent_color: string;
    contact_email: string;
    contact_phone: string;
  } | null;
};

export function SettingsForm({ fullName, email, isFirmAdmin, firm }: Props) {
  const router = useRouter();

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

  // Firm state
  const [firmName, setFirmName] = useState(firm?.name || '');
  const [tagline, setTagline] = useState(firm?.tagline || '');
  const [brandColor, setBrandColor] = useState(firm?.brand_color || '#0F172A');
  const [accentColor, setAccentColor] = useState(firm?.accent_color || '#2563EB');
  const [contactEmail, setContactEmail] = useState(firm?.contact_email || '');
  const [contactPhone, setContactPhone] = useState(firm?.contact_phone || '');
  const [firmMsg, setFirmMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [firmPending, startFirm] = useTransition();

  function submitProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const fd = new FormData();
    fd.append('full_name', name);
    startProfile(async () => {
      const r = await saveProfileAction(fd);
      if (r?.error) {
        setProfileMsg({ kind: 'error', text: r.error });
        return;
      }
      setProfileMsg({ kind: 'ok', text: 'Saved.' });
      router.refresh();
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
      const r = await changePasswordAction(fd);
      if (r?.error) {
        setPwMsg({ kind: 'error', text: r.error });
        return;
      }
      setPwMsg({ kind: 'ok', text: 'Password updated.' });
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    });
  }

  function submitFirm(e: React.FormEvent) {
    e.preventDefault();
    if (!firm) return;
    setFirmMsg(null);
    const fd = new FormData();
    fd.append('firm_id', firm.id);
    fd.append('name', firmName);
    fd.append('tagline', tagline);
    fd.append('brand_color', brandColor);
    fd.append('accent_color', accentColor);
    fd.append('contact_email', contactEmail);
    fd.append('contact_phone', contactPhone);
    startFirm(async () => {
      const r = await saveFirmAction(fd);
      if (r?.error) {
        setFirmMsg({ kind: 'error', text: r.error });
        return;
      }
      setFirmMsg({ kind: 'ok', text: 'Saved.' });
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {/* Profile */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-slate-600">
          The name your clients see in the portal.
        </p>
        <form onSubmit={submitProfile} className="mt-5 space-y-4">
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium">Full name</label>
            <input
              id="full_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {profilePending ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      {/* Account */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium">{email}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          To change your email, contact{' '}
          <a href="mailto:turnerlogan@parallelstudios.co" className="underline">support</a>.
        </p>

        <form onSubmit={submitPassword} className="mt-6 space-y-4 border-t border-slate-100 pt-6">
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
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 disabled:opacity-50"
          >
            {pwPending ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>

      {/* Firm */}
      {isFirmAdmin && firm && (
        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold">Firm</h2>
          <p className="mt-1 text-sm text-slate-600">
            How your firm appears in the client portal.{' '}
            <a href="/dashboard/branding" className="text-blue-600 hover:underline">
              Edit logo →
            </a>
          </p>

          <form onSubmit={submitFirm} className="mt-5 space-y-5">
            <div>
              <label htmlFor="firm_name" className="block text-sm font-medium">Firm name</label>
              <input
                id="firm_name"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="firm_tagline" className="block text-sm font-medium">Tagline (optional)</label>
              <input
                id="firm_tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Boston's premier waterfront brokerage"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="brand_color" className="block text-sm font-medium">Brand color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="brand_color"
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-slate-300"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="accent_color" className="block text-sm font-medium">Accent color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="accent_color"
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-slate-300"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact_email" className="block text-sm font-medium">Contact email</label>
                <input
                  id="contact_email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="contact_phone" className="block text-sm font-medium">Contact phone</label>
                <input
                  id="contact_phone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {firmMsg && (
              <div
                className={
                  firmMsg.kind === 'ok'
                    ? 'rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800'
                    : 'rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800'
                }
              >
                {firmMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={firmPending}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {firmPending ? 'Saving…' : 'Save firm'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
