'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  changePasswordAction,
  saveFirmAction,
  saveProfileAction,
} from './actions';
import { useToast } from '@/components/Toast';
import { humanError } from '@/lib/humanError';

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
      try {
        const r = await saveProfileAction(fd);
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
        const r = await changePasswordAction(fd);
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
      try {
        const r = await saveFirmAction(fd);
        if (r?.error) {
          const msg = humanError(r.error);
          setFirmMsg({ kind: 'error', text: msg });
          toast.show(msg, { variant: 'error' });
          return;
        }
        setFirmMsg({ kind: 'ok', text: 'Saved.' });
        toast.show('Firm settings saved.', { variant: 'success' });
        router.refresh();
      } catch (err) {
        const msg = humanError(err);
        setFirmMsg({ kind: 'error', text: msg });
        toast.show(msg, { variant: 'error' });
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Profile */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft-sm">
        <h2 className="text-lg font-semibold text-ink-900">Profile</h2>
        <p className="mt-1 text-sm text-ink-600">
          The name your clients see in the portal.
        </p>
        <form onSubmit={submitProfile} className="mt-5 space-y-4">
          <div>
            <label htmlFor="full_name" className="label">Full name</label>
            <input
              id="full_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="input mt-1"
            />
          </div>
          {profileMsg && (
            <div
              className={
                profileMsg.kind === 'ok'
                  ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'
                  : 'rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800'
              }
            >
              {profileMsg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={profilePending}
            data-loading={profilePending ? 'true' : undefined}
            className="btn-primary"
          >
            {profilePending ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      {/* Account */}
      <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft-sm">
        <h2 className="text-lg font-semibold text-ink-900">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between border-b border-ink-100 pb-2">
            <dt className="text-ink-500">Email</dt>
            <dd className="font-medium">{email}</dd>
          </div>
        </dl>
        <p className="mt-2 text-xs text-ink-500">
          To change your email, contact{' '}
          <a href="mailto:turnerlogan@parallelstudios.co" className="underline">support</a>.
        </p>

        <form onSubmit={submitPassword} className="mt-6 space-y-4 border-t border-ink-100 pt-6">
          <h3 className="text-sm font-semibold">Change password</h3>
          <div>
            <label htmlFor="current_password" className="label">Current password</label>
            <input
              id="current_password"
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              autoComplete="current-password"
              required
              className="input mt-1"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new_password" className="label">New password</label>
              <input
                id="new_password"
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="input mt-1"
              />
            </div>
            <div>
              <label htmlFor="confirm_password" className="label">Confirm new password</label>
              <input
                id="confirm_password"
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="input mt-1"
              />
            </div>
          </div>
          {pwMsg && (
            <div
              className={
                pwMsg.kind === 'ok'
                  ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'
                  : 'rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800'
              }
            >
              {pwMsg.text}
            </div>
          )}
          <button
            type="submit"
            disabled={pwPending}
            data-loading={pwPending ? 'true' : undefined}
            className="btn-secondary"
          >
            {pwPending ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </section>

      {/* Firm */}
      {isFirmAdmin && firm && (
        <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-soft-sm">
          <h2 className="text-lg font-semibold text-ink-900">Firm</h2>
          <p className="mt-1 text-sm text-ink-600">
            How your firm appears in the client portal.{' '}
            <a href="/dashboard/branding" className="font-semibold text-ink-700 underline-offset-2 hover:text-ink-900 hover:underline">
              Edit logo →
            </a>
          </p>

          <form onSubmit={submitFirm} className="mt-5 space-y-5">
            <div>
              <label htmlFor="firm_name" className="label">Firm name</label>
              <input
                id="firm_name"
                value={firmName}
                onChange={(e) => setFirmName(e.target.value)}
                required
                className="input mt-1"
              />
            </div>

            <div>
              <label htmlFor="firm_tagline" className="label">Tagline (optional)</label>
              <input
                id="firm_tagline"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Boston's premier waterfront brokerage"
                className="input mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="brand_color" className="label">Brand color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="brand_color"
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-ink-300"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                    className="input flex-1 font-mono"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="accent_color" className="label">Accent color</label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="accent_color"
                    type="color"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded border border-ink-300"
                  />
                  <input
                    type="text"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                    className="input flex-1 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact_email" className="label">Contact email</label>
                <input
                  id="contact_email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="input mt-1"
                />
              </div>
              <div>
                <label htmlFor="contact_phone" className="label">Contact phone</label>
                <input
                  id="contact_phone"
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="input mt-1"
                />
              </div>
            </div>

            {firmMsg && (
              <div
                className={
                  firmMsg.kind === 'ok'
                    ? 'rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'
                    : 'rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800'
                }
              >
                {firmMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={firmPending}
              data-loading={firmPending ? 'true' : undefined}
              className="btn-primary"
            >
              {firmPending ? 'Saving…' : 'Save firm'}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
