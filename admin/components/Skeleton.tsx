/**
 * Tailwind animate-pulse placeholder. Use to occupy the space a list/card will
 * fill so the page doesn't reflow when data arrives.
 */
export function Skeleton({
  className = '',
  width,
  height,
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
}) {
  const style: React.CSSProperties = {};
  if (width != null) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height != null) style.height = typeof height === 'number' ? `${height}px` : height;
  return (
    <div
      className={'animate-pulse rounded bg-slate-200 ' + className}
      style={style}
    />
  );
}

/**
 * Two-line list-row skeleton (title + sub). Designed to sit inside the same
 * containers our real rows do, so swap-in is layout-stable.
 */
export function SkeletonRow({ withChip = false }: { withChip?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
      {withChip && <Skeleton className="ml-3 h-5 w-16" />}
    </div>
  );
}

/**
 * Card-shaped skeleton — for grid items like houses that show a photo + body.
 */
export function SkeletonCard() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}
