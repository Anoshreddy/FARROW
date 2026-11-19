// Small formatting helpers shared by every page.

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function formatNumber(n, digits = 2) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// The backend stores naive UTC timestamps (no "Z"); treat them as UTC for range filtering.
export function toDate(iso) {
  if (!iso) return null;
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(iso);
  const d = new Date(hasZone ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function includesText(haystack, needle) {
  if (!needle) return true;
  return String(haystack ?? '').toLowerCase().includes(needle.trim().toLowerCase());
}

// Sum quantities per unit so kg and L are never added together.
export function sumByUnit(items, unitOf, qtyOf) {
  const out = {};
  items.forEach((i) => {
    const u = unitOf(i) || '';
    out[u] = (out[u] || 0) + qtyOf(i);
  });
  return out;
}

export function formatUnitTotals(byUnit) {
  const parts = Object.entries(byUnit).filter(([, q]) => q > 0);
  return parts.length ? parts.map(([u, q]) => `${formatNumber(q)} ${u}`).join(' · ') : '0';
}

// The backend returns 9999.99 coverage days when forecast consumption is 0.
export function coverageLabel(days) {
  return days >= 9999 ? 'No forecast demand' : `${formatNumber(days)} days`;
}
