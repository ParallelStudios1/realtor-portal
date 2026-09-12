/**
 * FMLS display-compliance components, per FMLS review requirements:
 *  1. "FMLS# <number>" prominently inside each FMLS listing display.
 *  2. Identity + contact of the technical entity responsible for the
 *     functionality and support.
 *  3. When the listing content was last updated.
 *  4. "Information Deemed Reliable But Not Guaranteed" + DMCA takedown link
 *     + © [year] FMLS.
 * Render FmlsListingLine inside every FMLS-sourced listing row, and
 * FmlsDisclaimer once under any section that shows FMLS listing content.
 */

export function FmlsListingLine({
  mlsNumber,
  updatedAt,
}: {
  mlsNumber: string;
  updatedAt?: string | Date | null;
}) {
  const when = updatedAt ? new Date(updatedAt) : null;
  return (
    <div className="mt-1 text-[11px] text-ink-600">
      <span className="font-bold text-ink-800">FMLS# {mlsNumber}</span>
      {when && !Number.isNaN(when.getTime()) && (
        <span>
          {' '}
          · Listing content last updated{' '}
          {when.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </span>
      )}
    </div>
  );
}

export function FmlsDisclaimer() {
  const year = new Date().getFullYear();
  return (
    <div className="border-t border-ink-100 px-5 py-3 text-[11px] leading-relaxed text-ink-500">
      <p>
        FMLS listing data functionality is provided and supported by Parallel
        Studios LLC · turnerlogan@parallelstudios.co · (678) 822-6564.
      </p>
      <p className="mt-1">
        Information Deemed Reliable But Not Guaranteed. If you believe any FMLS
        listing contains material that infringes your copyrighted work please{' '}
        <a
          href="https://www.fmls.com/dmca.htm"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2"
        >
          click here
        </a>{' '}
        to review our DMCA policy and learn how to submit a takedown request. ©{' '}
        {year} FMLS.
      </p>
    </div>
  );
}
