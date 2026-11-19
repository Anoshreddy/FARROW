// Display buckets for batch expiry. The inputs (expiry_status, days_until_expiry) come
// from /api/reports/expiry; the 7-day bucket is just a finer split of the backend's
// "expiring soon" (within 30 days) status.
export const EXPIRY_OPTIONS = [
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'DUE_7', label: 'Expiring within 7 days' },
  { value: 'DUE_30', label: 'Expiring within 30 days' },
  { value: 'SAFE', label: 'Safe' },
  { value: 'NO_EXPIRY', label: 'No expiry date' },
  { value: 'DEPLETED', label: 'Depleted (0 qty)' },
];

export function expiryBucket(entry) {
  if (!entry) return 'DEPLETED'; // the expiry report only lists batches with stock
  switch (entry.expiry_status) {
    case 'EXPIRED':
      return 'EXPIRED';
    case 'EXPIRING_SOON':
      return entry.days_until_expiry !== null && entry.days_until_expiry <= 7 ? 'DUE_7' : 'DUE_30';
    case 'VALID':
      return 'SAFE';
    default:
      return 'NO_EXPIRY';
  }
}

export function daysLabel(days) {
  if (days === null || days === undefined) return '—';
  if (days < 0) return `${Math.abs(days)} overdue`;
  return String(days);
}
