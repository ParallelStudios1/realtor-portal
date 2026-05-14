import { redirect } from 'next/navigation';

/**
 * Legacy /attorney/deals/[id] route. The canonical multi-party deal page at
 * /deal/[id] now handles attorney rendering with role-scoped sections, so we
 * just redirect.
 */
export default function AttorneyDealRedirect({
  params,
}: {
  params: { id: string };
}) {
  redirect('/deal/' + params.id);
}
