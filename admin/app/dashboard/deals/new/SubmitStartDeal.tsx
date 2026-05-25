'use client';

import { useFormStatus } from 'react-dom';

/**
 * Submit button for the "Start a new deal" form.
 *
 * The global CSS rule `[data-loading='true'] { pointer-events: none; }`
 * permanently disabled the old hardcoded `data-loading="true"` button.
 * This component toggles `data-loading` only while the server action is
 * actually pending, restoring click-ability and adding real feedback.
 */
export function SubmitStartDeal() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className="btn-primary w-full"
      data-loading={pending ? 'true' : undefined}
      disabled={pending}
      aria-busy={pending}
    >
      {pending ? 'Starting…' : 'Start deal'}
    </button>
  );
}
