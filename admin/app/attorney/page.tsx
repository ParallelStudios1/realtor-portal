import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Legacy attorney dashboard. Folded into the unified /participant home that
 * covers attorneys, inspectors, lenders, appraisers, and every other deal
 * party. Preserved as a redirect so old emails and bookmarks still resolve.
 */
export default function AttorneyRedirect() {
  redirect('/participant');
}
