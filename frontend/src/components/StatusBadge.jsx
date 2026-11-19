// One status system for the whole product: healthy / warning / critical (+ accent, neutral).
// Backend strings are mapped to a tone here and nowhere else.
const STATUS = {
  // stock health
  HEALTHY: ['healthy', 'Healthy'],
  LOW: ['warning', 'Low'],
  CRITICAL: ['critical', 'Critical'],
  EXPIRING: ['warning', 'Expiring'],
  DEPLETED: ['neutral', 'Depleted'],
  // expiry buckets (see lib/expiry.js)
  EXPIRED: ['critical', 'Expired'],
  DUE_7: ['warning', 'Within 7 days'],
  DUE_30: ['warning', 'Within 30 days'],
  SAFE: ['healthy', 'Safe'],
  NO_EXPIRY: ['neutral', 'No expiry date'],
  // stock movements (backend values)
  RECEIVE: ['healthy', 'Receive'],
  CONSUME: ['neutral', 'Consume'],
  WASTAGE: ['critical', 'Wastage'],
  TRANSFER_IN: ['accent', 'Transfer in'],
  TRANSFER_OUT: ['accent', 'Transfer out'],
  // reorder recommendation
  REORDER: ['warning', 'Reorder'],
  NO_REORDER: ['healthy', 'No reorder'],
  // inventory presence
  IN_STOCK: ['healthy', 'In stock'],
  OUT_OF_STOCK: ['critical', 'Out of stock'],
};

const RISK = { HIGH: ['critical', 'High'], MEDIUM: ['warning', 'Medium'], LOW: ['healthy', 'Low'] };
const SEVERITY = { HIGH: ['critical', 'Critical'], MEDIUM: ['warning', 'Warning'], INFO: ['neutral', 'Information'] };

function Badge({ tone, label }) {
  return <span className={`badge badge--${tone}`}>{label}</span>;
}

export default function StatusBadge({ status, label }) {
  const [tone, text] = STATUS[status] || ['neutral', status || '—'];
  return <Badge tone={tone} label={label || text} />;
}

// Stockout risk level returned by /api/stockout-risk (HIGH | MEDIUM | LOW).
export function RiskBadge({ level }) {
  const [tone, text] = RISK[level] || ['neutral', level || '—'];
  return <Badge tone={tone} label={text} />;
}

// Alert severity returned by /api/reports/alerts (HIGH | MEDIUM | INFO).
export function SeverityBadge({ severity }) {
  const [tone, text] = SEVERITY[severity] || ['neutral', severity || '—'];
  return <Badge tone={tone} label={text} />;
}
