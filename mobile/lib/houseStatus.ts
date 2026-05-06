import type { HouseStatus } from './database.types';

/** Display-friendly label for a house status. */
export function formatHouseStatus(status: HouseStatus): string {
  switch (status) {
    case 'interested':     return 'Interested';
    case 'tour_requested': return 'Tour Requested';
    case 'toured':         return 'Toured';
    case 'offered':        return 'Offer Made';
    case 'passed':         return 'Passed';
  }
}

/**
 * Color hint per status. Keys are tokens callers map onto theme.colors —
 * this file stays theme-free so it's importable anywhere.
 */
export function houseStatusTone(status: HouseStatus): 'neutral' | 'info' | 'warning' | 'success' | 'muted' {
  switch (status) {
    case 'interested':     return 'neutral';
    case 'tour_requested': return 'info';
    case 'toured':         return 'warning';
    case 'offered':        return 'success';
    case 'passed':         return 'muted';
  }
}

export const HOUSE_STATUSES: HouseStatus[] = [
  'interested',
  'tour_requested',
  'toured',
  'offered',
  'passed',
];
