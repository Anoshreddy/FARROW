// Shared by the Alerts page and the alerts report.
export const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, INFO: 2 };
export const SEVERITY_OPTIONS = [
  { value: 'HIGH', label: 'Critical' },
  { value: 'MEDIUM', label: 'Warning' },
  { value: 'INFO', label: 'Information' },
];
export const TYPE_LABELS = {
  EXPIRED_BATCH: 'Expired batch',
  EXPIRING_SOON: 'Expiring soon',
  HIGH_STOCKOUT_RISK: 'High stockout risk',
  MEDIUM_STOCKOUT_RISK: 'Medium stockout risk',
  REORDER_RECOMMENDED: 'Reorder recommended',
};

// The alerts API returns only { type, severity, message }. To fill the material / warehouse
// columns we look for the names of real materials and warehouses inside the message text.
// Longest names first so "Corn Flour" matches before "Flour".
export function findName(message, items) {
  const found = [...items]
    .sort((a, b) => b.name.length - a.name.length)
    .find((it) => message.includes(it.name));
  return found ? found.name : null;
}

export function enrichAlerts(alerts, materials, warehouses) {
  return alerts.map((a, i) => ({
    ...a,
    id: i,
    material: findName(a.message, materials),
    warehouse: findName(a.message, warehouses),
  }));
}
