'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import {
  addSellerListingAction,
  prepareSellerListingUploads,
} from './listingActions';

/**
 * Seller self-service: add the home you're selling, with optional related
 * documents attached right at creation (disclosures, survey, HOA, photos).
 */
export function SellerAddListing({
  brandColor,
  hasListings,
}: {
  brandColor?: string | null;
  hasListings: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [sqft, setSqft] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const accent = brandColor || '#0F172A';

  const submit = () => {
    if (!address.trim()) {
      toast.show('Enter the address.', { variant: 'error' });
      return;
    }
    start(async () => {
      try {
        // Upload any attached documents DIRECTLY to storage first (via signed
        // URLs), so big PDFs/photos never travel through the server action's
        // ~1MB body limit. Only metadata is sent to create the listing.
        let docsMeta: {
          name: string;
          path: string;
          size: number;
          type: string;
        }[] = [];

        if (files.length > 0) {
          const prep = await prepareSellerListingUploads(
            files.map((f) => ({ name: f.name, size: f.size, type: f.type }))
          );
          if (!prep || !prep.ok) {
            toast.show(
              (prep && (prep as any).error) || 'Could not prepare the upload.',
              { variant: 'error' }
            );
            return;
          }
          const supabase = getSupabaseBrowserClient();
          for (let i = 0; i < prep.targets.length; i++) {
            const t = prep.targets[i];
            const file = files[i];
            const { error: upErr } = await supabase.storage
              .from('client-docs')
              .uploadToSignedUrl(t.path, t.token, file, {
                contentType: file.type || undefined,
              });
            if (upErr) {
              toast.show(`Couldn't upload ${file.name}: ${upErr.message}`, {
                variant: 'error',
              });
              return;
            }
          }
          docsMeta = prep.targets.map((t) => ({
            name: t.name,
            path: t.path,
            size: t.size,
            type: t.type,
          }));
        }

        const fd = new FormData();
        fd.set('address', address.trim());
        fd.set('list_price', price);
        fd.set('photo_url', photo.trim());
        fd.set('bedrooms', beds);
        fd.set('bathrooms', baths);
        fd.set('square_feet', sqft);
        fd.set('notes', notes.trim());
        fd.set('docs_meta', JSON.stringify(docsMeta));

        const r = await addSellerListingAction(fd);
        if (!r || !r.ok) {
          toast.show((r && (r as any).error) || 'Could not add the home.', {
            variant: 'error',
          });
          return;
        }
        toast.show(
          'Home added' +
            (r.docsAttached ? ` · ${r.docsAttached} doc(s) attached` : '') +
            '.',
          { variant: 'success' }
        );
        setOpen(false);
        setAddress('');
        setPrice('');
        setPhoto('');
        setBeds('');
        setBaths('');
        setSqft('');
        setNotes('');
        setFiles([]);
        router.refresh();
      } catch (e: any) {
        toast.show(e?.message || 'Something went wrong adding the home.', {
          variant: 'error',
        });
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-soft-sm transition active:scale-[0.98]"
        style={{ backgroundColor: accent }}
      >
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
          <path d="M10 4v12M4 10h12" strokeLinecap="round" />
        </svg>
        {hasListings ? 'Add another home' : "Add the home you're selling"}
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-sm font-semibold text-ink-900">
        Add the home you&apos;re selling
      </div>
      <label className="block text-sm">
        <span className="label">Address</span>
        <input
          className="input mt-1"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="123 Main St, City ST"
          autoFocus
        />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="label">List price</span>
          <input type="number" className="input mt-1" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
        </label>
        <label className="block text-sm">
          <span className="label">Beds</span>
          <input type="number" className="input mt-1" value={beds} onChange={(e) => setBeds(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="label">Baths</span>
          <input type="number" className="input mt-1" value={baths} onChange={(e) => setBaths(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="label">Sq ft</span>
          <input type="number" className="input mt-1" value={sqft} onChange={(e) => setSqft(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="label">Photo URL (optional)</span>
        <input className="input mt-1" value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" />
      </label>
      <label className="block text-sm">
        <span className="label">Notes (optional)</span>
        <textarea rows={2} className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything your agent should know" />
      </label>

      {/* Optional related documents */}
      <div>
        <span className="label">Attach related documents (optional)</span>
        <p className="mt-0.5 text-[11px] text-ink-500">
          Disclosures, survey, HOA papers, extra photos - anything about this
          home. Your agent will see them on the deal.
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="btn-secondary mt-2 text-xs"
        >
          Choose files
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.heic"
          onChange={(e) =>
            e.target.files && setFiles((p) => [...p, ...Array.from(e.target.files!)])
          }
        />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-2 rounded-md bg-ink-50 px-2 py-1">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                  className="text-ink-400 hover:text-rose-600"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || !address.trim()}
          className="btn-primary disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {pending ? 'Adding…' : 'Add home'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}
