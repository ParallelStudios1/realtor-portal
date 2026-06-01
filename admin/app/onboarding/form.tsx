'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveBrandingAction } from './actions';

type Initial = {
  name: string;
  tagline: string;
  brand_color: string;
  accent_color: string;
  contact_email: string;
  contact_phone: string;
  website_url: string;
  logo_url: string | null;
};

export function OnboardingForm({ firmId, initial }: { firmId: string; initial: Initial }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initial.name);
  const [tagline, setTagline] = useState(initial.tagline);
  const [brandColor, setBrandColor] = useState(initial.brand_color);
  const [accentColor, setAccentColor] = useState(initial.accent_color);
  const [email, setEmail] = useState(initial.contact_email);
  const [phone, setPhone] = useState(initial.contact_phone);
  const [website, setWebsite] = useState(initial.website_url);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initial.logo_url);

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) {
      setError('Logo must be under 2MB.');
      return;
    }
    setLogoFile(f);
    setLogoPreview(URL.createObjectURL(f));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.append('firm_id', firmId);
    fd.append('name', name);
    fd.append('tagline', tagline);
    fd.append('brand_color', brandColor);
    fd.append('accent_color', accentColor);
    fd.append('contact_email', email);
    fd.append('contact_phone', phone);
    fd.append('website_url', website);
    if (logoFile) fd.append('logo', logoFile);

    start(async () => {
      const result = await saveBrandingAction(fd);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-6">
      {/* Logo */}
      <div>
        <label className="block text-sm font-medium">Firm logo</label>
        <div className="mt-2 flex items-center gap-4">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-lg border-2 border-dashed border-ink-300 bg-ink-50 text-xs text-ink-400"
            style={logoPreview ? { backgroundColor: brandColor, borderStyle: 'solid' } : undefined}
          >
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="logo" className="h-full w-full rounded-lg object-contain p-2" />
            ) : (
              'No logo'
            )}
          </div>
          <label className="cursor-pointer rounded-md border border-ink-300 bg-white px-4 py-2 text-sm font-medium hover:border-ink-400">
            {logoPreview ? 'Replace' : 'Upload'} logo
            <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
          </label>
        </div>
        <p className="mt-1 text-xs text-ink-500">PNG or SVG, square, under 2MB.</p>
      </div>

      {/* Firm name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium">Firm name (as shown to clients)</label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
        />
      </div>

      {/* Tagline */}
      <div>
        <label htmlFor="tagline" className="block text-sm font-medium">Tagline (optional)</label>
        <input
          id="tagline"
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="e.g. Boston's premier waterfront brokerage"
          className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
        />
      </div>

      {/* Colors */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="brand_color" className="block text-sm font-medium">Brand color</label>
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
              className="flex-1 rounded-md border border-ink-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
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
              className="h-10 w-14 cursor-pointer rounded border border-ink-300"
            />
            <input
              type="text"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="flex-1 rounded-md border border-ink-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
            />
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact_email" className="block text-sm font-medium">Contact email</label>
          <input
            id="contact_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
          />
        </div>
        <div>
          <label htmlFor="contact_phone" className="block text-sm font-medium">Contact phone</label>
          <input
            id="contact_phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
          />
        </div>
      </div>

      <div>
        <label htmlFor="website_url" className="block text-sm font-medium">Website (optional)</label>
        <input
          id="website_url"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://..."
          className="mt-1 w-full rounded-md border border-ink-300 px-3 py-2 text-sm shadow-sm focus:border-ink-500 focus:outline-none focus:ring-1 focus:ring-ink-200"
        />
      </div>

      {/* Live preview */}
      <div>
        <label className="block text-sm font-medium">Live preview</label>
        <div className="mt-2 rounded-lg border border-ink-200 p-4" style={{ backgroundColor: brandColor }}>
          <div className="flex items-center gap-3">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="" className="h-10 w-10 rounded bg-white object-contain p-1" />
            ) : (
              <div className="h-10 w-10 rounded bg-white/20" />
            )}
            <div className="text-white">
              <div className="text-sm font-semibold">{name || 'Your Firm Name'}</div>
              {tagline && <div className="text-xs opacity-80">{tagline}</div>}
            </div>
          </div>
          <button
            type="button"
            className="mt-3 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
            style={{ backgroundColor: accentColor }}
          >
            Sample button
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
      )}

      <div className="flex items-center justify-between border-t border-ink-200 pt-6">
        <a href="/dashboard" className="text-sm text-ink-500 hover:text-ink-700">Skip for now</a>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ink-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-ink-700 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save & continue →'}
        </button>
      </div>
    </form>
  );
}
