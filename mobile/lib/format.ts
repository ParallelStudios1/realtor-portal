import { format, formatDistance, isToday, isTomorrow, isPast } from 'date-fns';
import { DealPhase } from './database.types';

export function formatPhase(phase: DealPhase): string {
  const phaseMap: Record<DealPhase, string> = {
    searching: 'Searching',
    awaiting_offer: 'Awaiting Offer',
    offer_made: 'Offer Made',
    under_contract: 'Under Contract',
    closing: 'Closing',
    closed: 'Closed',
  };
  return phaseMap[phase];
}

export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return format(date, 'MMM d, yyyy');
  } catch {
    return 'Invalid date';
  }
}

export function formatDateShort(dateString: string): string {
  try {
    const date = new Date(dateString);
    return format(date, 'MMM d');
  } catch {
    return 'Invalid date';
  }
}

export function formatDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return format(date, 'MMM d, yyyy h:mm a');
  } catch {
    return 'Invalid date';
  }
}

export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return formatDistance(date, new Date(), { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

export function daysUntil(dateString: string): number {
  try {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    const diff = date.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  } catch {
    return -1;
  }
}

export function isDateOverdue(dateString: string): boolean {
  return daysUntil(dateString) < 0;
}

export function formatPrice(price: number | null | undefined): string {
  if (!price) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return 'N/A';
  return num.toLocaleString();
}
