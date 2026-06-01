'use client';

/**
 * Renders a genuine `timestamptz` value (e.g. showings.scheduled_at,
 * created_at) in the VIEWER'S local timezone — without a hydration mismatch.
 *
 * The problem: a datetime formatted with toLocaleString/toLocaleDateString
 * renders in UTC on the server but in the viewer's local zone on the client,
 * so the two HTML strings differ and React throws #418/#422/#425.
 *
 * The fix: format only after mount (client-side), where the local timezone is
 * known. Until then we render the same neutral placeholder the server emits,
 * so the server HTML and the first client render match exactly. This is for
 * values that *should* depend on the viewer's timezone. For DATE-ONLY values
 * use `formatDateOnly` from '@/lib/dates' instead (those must NOT shift).
 */

import { useEffect, useState } from 'react';

type Props = {
  /** ISO timestamptz string. */
  value: string | null | undefined;
  /** Intl options for the date portion (toLocaleDateString). */
  dateOptions?: Intl.DateTimeFormatOptions;
  /** Intl options for the time portion (toLocaleTimeString). */
  timeOptions?: Intl.DateTimeFormatOptions;
  /** Separator between date and time when both are shown. Default ' @ '. */
  separator?: string;
  /** Shown before mount / for empty input. Default ''. */
  placeholder?: string;
};

export function LocalDateTime({
  value,
  dateOptions,
  timeOptions,
  separator = ' @ ',
  placeholder = '',
}: Props) {
  const [text, setText] = useState<string>(placeholder);

  useEffect(() => {
    if (!value) {
      setText('');
      return;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      setText('');
      return;
    }
    const parts: string[] = [];
    if (dateOptions) parts.push(d.toLocaleDateString(undefined, dateOptions));
    if (timeOptions) parts.push(d.toLocaleTimeString(undefined, timeOptions));
    if (parts.length === 0) parts.push(d.toLocaleString());
    setText(parts.join(separator));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // suppressHydrationWarning is a belt-and-suspenders guard: the first client
  // render already matches the server (both emit `placeholder`), but this also
  // covers the post-mount text swap cleanly.
  return <span suppressHydrationWarning>{text}</span>;
}
