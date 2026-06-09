'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { LISTING_STATUSES } from '@/lib/dealKind';
import {
  updateSellerListingAction,
  removeSellerListingAction,
} from '@/app/client/listingActions';

type House = {
  id: string;
  address: string | null;
  list_price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  photo_url: string | null;
  notes: string | null;
  listing_status: string | null;
};

/**
 * Seller self-service controls on their own listing: edit the details +
 * status inline, or remove the listing entirely.
 */
export function SellerListingControls({
  house,
  brandColor,
}: {
  house: House;
  brandColor?: string | null;
}) {
  const accent = brandColor || '#0F172A';
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [pending, start] = useTransition();

  const [address, setAddress] = useState(house.address || '');
  const [price, setPrice] = useState(
    house.list_price != null ? String(house.list_price) : ''
  );
  const [beds, setBeds] = useState(
    house.bedrooms != null ? String(house.bedrooms) : ''
  );
  const [baths, setBaths] = useState(
    house.bathrooms != null ? String(house.bathrooms) : ''
  );
  const [sqft, setSqft] = useState(
    house.square_feet != null ? String(house.square_feet) : ''
  );
  const [photo, setPhoto] = useState(house.photo_url || '');
  const [notes, setNotes] = useState(house.notes || '');
  const [status, setStatus] = useState(house.listing_status || 'coming_soon');

  const save = () => {
    if (!address.trim()) {
      toast.show('Enter the address.', { variant: 'error' });
      return;
    }
    const fd = new FormData();
    fd.set('house_id', house.id);
    fd.set('address', address.trim());
    fd.set('list_price', price);
    fd.set('photo_url', photo.trim());
    fd.set('bedrooms', beds);
    fd.set('bathrooms', baths);
    fd.set('square_feet', sqft);
    fd.set('notes', notes.trim());
    fd.set('listing_status', status);
    start(async () => {
      try {
        const r = await updateSellerListingAction(fd);
        if (!r || !r.ok) {
          toast.show((r && (r as any).error) || 'Could not save.', {
            variant: 'error',
          });
          return;
        }
        toast.show('Listing updated.', { variant: 'success' });
        setEditing(false);
        router.refresh();
      } catch (e: any) {
        toast.show(e?.message || 'Could not save.', { variant: 'error' });
      }
    });
  };

  const remove = () => {
    start(async () => {
      try {
        const r = await removeSellerListingAction(house.id);
        if (!r || !r.ok) {
          toast.show((r && (r as any).error) || 'Could not remove.', {
            variant: 'error',
          });
          return;
        }
        toast.show('Listing removed.', { variant: 'success' });
        router.push('/client/houses');
        router.refresh();
      } catch (e: any) {
        toast.show(e?.message || 'Could not remove.', { variant: 'error' });
      }
    });
  };

  if (!editing) {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-soft-sm transition active:scale-[0.98]"
          style={{ backgroundColor: accent }}
        >
          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 13.5V16h2.5l7-7L11 6.5l-7 7Z" strokeLinejoin="round" />
            <path d="M12.5 5 14 6.5" strokeLinecap="round" />
          </svg>
          Edit details
        </button>
        {!confirmingRemove ? (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-300 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 transition hover:border-rose-300 hover:text-rose-600"
          >
            Remove listing
          </button>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm">
            <span className="font-medium text-rose-800">Remove this listing?</span>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
            >
              {pending ? 'Removing…' : 'Yes, remove'}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRemove(false)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-ink-500 hover:text-ink-800"
            >
              Cancel
            </button>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-ink-200 bg-white p-4">
      <div className="text-sm font-semibold text-ink-900">Edit your listing</div>
      <label className="block text-sm">
        <span className="label">Address</span>
        <input className="input mt-1" value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="label">List price</span>
          <input type="number" className="input mt-1" value={price} onChange={(e) => setPrice(e.target.value)} />
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
        <span className="label">Status</span>
        <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
          {LISTING_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="label">Photo URL</span>
        <input className="input mt-1" value={photo} onChange={(e) => setPhoto(e.target.value)} placeholder="https://…" />
      </label>
      <label className="block text-sm">
        <span className="label">Notes</span>
        <textarea rows={2} className="input mt-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !address.trim()}
          className="btn-primary disabled:opacity-50"
          style={{ backgroundColor: accent }}
        >
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );
}
