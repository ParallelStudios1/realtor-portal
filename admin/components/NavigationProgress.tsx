'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Top-edge progress bar that animates as soon as the user clicks a Link or
 * submits a form. Next.js doesn't expose a "navigation started" event the
 * way React Router does, so we hook into:
 *
 *   1. Pointer-down on any <a> or <button data-loading>, which is the
 *      moment the user committed to navigating. We start the bar there so
 *      it feels instant - no dead time while React schedules the route.
 *   2. usePathname / useSearchParams. When either changes the route has
 *      finished rendering; we finish the bar and hide it.
 *
 * The visual: a 2px line that runs across the top, accelerates to ~80% in
 * 200ms, then crawls to 95%, then snaps to 100% and fades out when the
 * pathname actually changes. Same UX as YouTube / GitHub.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  // Start on user interaction.
  useEffect(() => {
    const start = () => {
      setVisible(true);
      setProgress(8);
      // accelerate then crawl
      setTimeout(() => setProgress(40), 50);
      setTimeout(() => setProgress(72), 200);
      setTimeout(() => setProgress(90), 600);
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // anchor (real link, internal only)
      const a = target.closest('a');
      if (a) {
        const href = a.getAttribute('href') || '';
        // ignore external + hash-only + new-tab clicks
        if (
          !href ||
          href.startsWith('http') ||
          href.startsWith('mailto') ||
          href.startsWith('tel:') ||
          href.startsWith('#') ||
          (a as HTMLAnchorElement).target === '_blank' ||
          e.metaKey ||
          e.ctrlKey ||
          e.shiftKey
        )
          return;
        start();
        return;
      }
      // explicit opt-in via data-loading="true" on a button
      const btn = target.closest('[data-loading="true"]');
      if (btn) start();
    };

    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  // Finish when the route resolves.
  useEffect(() => {
    if (!visible) return;
    setProgress(100);
    const t = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 220);
    return () => clearTimeout(t);
    // intentionally re-fire on path / query change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams?.toString()]);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease 60ms',
      }}
    >
      <div
        style={{
          height: '100%',
          width: progress + '%',
          background: '#0F172A',
          boxShadow: '0 0 8px rgba(15,23,42,0.4)',
          transition:
            'width ' +
            (progress === 100 ? '180ms' : '500ms') +
            ' cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  );
}
