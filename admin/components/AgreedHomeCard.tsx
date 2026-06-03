import { formatDateOnly } from '@/lib/dates';

/**
 * Prominent "Agreed home" card. Shown on cross-party deal views once the
 * client and realtor have agreed on a house (client_searches.house_agreed_at
 * is set and offer_house_id points at the chosen house).
 *
 * Purely presentational — the caller is responsible for deciding whether the
 * viewer is allowed to see this house (house-scoped privacy). This component
 * NEVER fetches and NEVER widens visibility.
 */
export function AgreedHomeCard({
  address,
  photoUrl,
  listPrice,
  agreedPrice,
  agreedAt,
  brand,
  accent,
}: {
  address: string | null;
  photoUrl?: string | null;
  listPrice?: number | null;
  agreedPrice?: number | null;
  agreedAt?: string | null;
  brand: string;
  accent: string;
}) {
  return (
    <section
      className="overflow-hidden rounded-2xl border bg-white shadow-soft-md"
      style={{ borderColor: brand + '33' }}
    >
      <div
        className="flex items-center gap-2 px-5 py-2.5"
        style={{ backgroundColor: brand + '0F' }}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="h-4 w-4"
          style={{ color: brand }}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3 10 9-7 9 7" />
          <path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
          <path d="M9 21v-6h6v6" />
        </svg>
        <span
          className="text-[11px] font-bold uppercase tracking-[0.14em]"
          style={{ color: brand }}
        >
          Agreed home
        </span>
      </div>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt=""
            className="h-28 w-full shrink-0 rounded-xl object-cover sm:h-24 sm:w-40"
            loading="lazy"
          />
        ) : (
          <div className="flex h-28 w-full shrink-0 items-center justify-center rounded-xl bg-ink-100 sm:h-24 sm:w-40">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="h-7 w-7 text-ink-300"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 10 9-7 9 7" />
              <path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
            </svg>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold leading-snug tracking-tight text-ink-900">
            {address || 'Address pending'}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {agreedPrice != null ? (
              <span className="font-semibold" style={{ color: accent }}>
                ${Number(agreedPrice).toLocaleString()}
                <span className="ml-1 text-xs font-medium text-ink-400">
                  agreed
                </span>
              </span>
            ) : listPrice != null ? (
              <span className="font-semibold text-ink-700">
                ${Number(listPrice).toLocaleString()}
                <span className="ml-1 text-xs font-medium text-ink-400">
                  listed
                </span>
              </span>
            ) : null}
            {agreedAt && (
              <span className="text-xs text-ink-500">
                Confirmed {formatDateOnly(agreedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
