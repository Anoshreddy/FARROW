import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Wheat, Boxes, CalendarClock, PackagePlus, PlusCircle, ArrowLeftRight, ShieldAlert,
  FileBarChart, ArrowRight, CircleCheck,
} from 'lucide-react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import Section from '../components/Section';
import DataTable from '../components/DataTable';
import StatusBadge, { SeverityBadge } from '../components/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState';
import { useApi } from '../api/useApi';
import { useRefData } from '../api/useRefData';
import { api } from '../api/client';
import { expiryBucket } from '../lib/expiry';
import { formatDate, formatNumber, formatUnitTotals, sumByUnit, todayISO } from '../lib/format';

const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, INFO: 2 };

const QUICK_ACTIONS = [
  { to: '/stock-movements?action=record&type=RECEIVE', icon: PlusCircle, label: 'Add inventory', hint: 'Receive stock into a warehouse' },
  { to: '/stock-movements?action=record', icon: ArrowLeftRight, label: 'Record stock movement', hint: 'Receive, consume or write off' },
  { to: '/batches-expiry?status=DUE_30', icon: CalendarClock, label: 'View expiring batches', hint: 'Batches due within 30 days' },
  { to: '/stockout-risk', icon: ShieldAlert, label: 'View stockout risks', hint: 'Coverage against lead time' },
  { to: '/reports', icon: FileBarChart, label: 'View reports', hint: 'Summaries and movement totals' },
];

export default function Dashboard() {
  const asOf = todayISO();
  const ref = useRefData();
  const summary = useApi(() => api.getInventorySummary({ prediction_date: asOf }), []);
  const inventory = useApi(() => api.getInventoryReport(), []);
  const batches = useApi(async () => {
    const [list, expiry] = await Promise.all([api.getInventoryBatches(), api.getExpiryReport()]);
    return { list, expiry };
  }, []);
  const alerts = useApi(() => api.getAlerts({ prediction_date: asOf }), []);

  const refresh = () => [ref, summary, inventory, batches, alerts].forEach((s) => s.reload());

  const unitTotals = useMemo(
    () => (inventory.data ? sumByUnit(inventory.data, (r) => r.unit, (r) => r.current_stock) : {}),
    [inventory.data]
  );

  const snapshotRows = useMemo(() => {
    if (!batches.data) return [];
    const mats = new Map(ref.materials.map((m) => [m.id, m]));
    const whs = new Map(ref.warehouses.map((w) => [w.id, w]));
    const expiryById = new Map(batches.data.expiry.map((e) => [e.batch_id, e]));
    return batches.data.list
      .filter((b) => b.quantity > 0)
      .map((b) => ({
        ...b,
        material_name: mats.get(b.raw_material_id)?.name ?? `#${b.raw_material_id}`,
        unit: mats.get(b.raw_material_id)?.unit ?? '',
        warehouse_name: whs.get(b.warehouse_id)?.name ?? `#${b.warehouse_id}`,
        bucket: expiryBucket(expiryById.get(b.id)),
      }));
  }, [batches.data, ref.materials, ref.warehouses]);

  const attention = useMemo(
    () => [...(alerts.data || [])].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)),
    [alerts.data]
  );

  const units = Object.keys(unitTotals).filter((u) => unitTotals[u] > 0);
  const s = summary.data;

  const snapshotCols = [
    { key: 'material_name', header: 'Raw Material', sortValue: (r) => r.material_name, render: (r) => <strong>{r.material_name}</strong> },
    { key: 'warehouse_name', header: 'Warehouse', sortValue: (r) => r.warehouse_name },
    { key: 'quantity', header: 'Quantity', align: 'right', sortValue: (r) => r.quantity, render: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
    { key: 'batch_number', header: 'Batch', render: (r) => <span className="muted">{r.batch_number}</span> },
    { key: 'expiry_date', header: 'Expiry', sortValue: (r) => r.expiry_date, render: (r) => (r.expiry_date ? formatDate(r.expiry_date) : <span className="muted">—</span>) },
    { key: 'bucket', header: 'Status', render: (r) => <StatusBadge status={r.bucket} /> },
  ];

  return (
    <AppShell
      title="Overview"
      description={`Current stock position across your materials and warehouses, as of ${formatDate(asOf)}.`}
      onRefresh={refresh}
    >
      {summary.status === 'error' ? (
        <div style={{ marginBottom: 20 }}>
          <ErrorState message={summary.error.message} onRetry={summary.reload} />
        </div>
      ) : (
        <div className="kpi-row kpi-row--4">
          <KpiCard
            label="Raw Materials"
            icon={Wheat}
            value={s ? s.total_raw_materials : '…'}
            hint={s ? `Tracked across ${s.total_warehouses} warehouses` : 'Loading…'}
          />
          <KpiCard
            label="Inventory Quantity"
            icon={Boxes}
            value={s ? formatNumber(s.total_inventory_quantity) : '…'}
            unit={units.length === 1 ? units[0] : undefined}
            hint={s ? `${units.length > 1 ? `${formatUnitTotals(unitTotals)} · ` : ''}${s.active_inventory_batches} active ${s.active_inventory_batches === 1 ? 'batch' : 'batches'}` : 'Loading…'}
          />
          <KpiCard
            label="Expiring Soon"
            icon={CalendarClock}
            tone={s && (s.batches_expiring_soon > 0 || s.expired_batches > 0) ? (s.expired_batches > 0 ? 'critical' : 'warning') : 'default'}
            value={s ? s.batches_expiring_soon : '…'}
            hint={s ? `Within 30 days · ${s.expired_batches} already expired` : 'Loading…'}
          />
          <KpiCard
            label="Reorder Required"
            icon={PackagePlus}
            tone={s && s.materials_requiring_reorder > 0 ? 'warning' : 'default'}
            value={s ? s.materials_requiring_reorder : '…'}
            hint={s ? `Material/warehouse pairs · ${s.high_risk_materials} at high stockout risk` : 'Loading…'}
          />
        </div>
      )}

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <Section title="Inventory Snapshot" subtitle="Batches currently holding stock, soonest expiry first.">
          <DataTable
            columns={snapshotCols}
            rows={snapshotRows}
            rowKey={(r) => r.id}
            loading={batches.status === 'loading' || ref.status === 'loading'}
            error={batches.error || ref.error}
            onRetry={() => {
              batches.reload();
              ref.reload();
            }}
            initialSort={{ key: 'expiry_date', dir: 'asc' }}
            pageSize={8}
            emptyTitle="No stock on hand"
            emptyMessage="No batch currently holds stock. Receive stock to see it here."
            emptyAction={<Link className="btn btn--primary" to="/stock-movements?action=record&type=RECEIVE">Add inventory</Link>}
          />
          <Link className="link-more" to="/inventory">
            View all inventory <ArrowRight size={14} />
          </Link>
        </Section>

        <Section title="Attention Needed" subtitle="Expiry, stockout risk and reorder alerts from the backend.">
          {alerts.status === 'loading' && <LoadingState label="Evaluating alerts…" />}
          {alerts.status === 'error' && <ErrorState message={alerts.error.message} onRetry={alerts.reload} />}
          {alerts.status === 'success' &&
            (attention.length === 0 ? (
              <EmptyState icon={CircleCheck} tone="ok" title="No active alerts" message="Everything currently looks clear." />
            ) : (
              <>
                <ul className="attention-list">
                  {attention.slice(0, 6).map((a, i) => (
                    <li key={i} className="attention-item">
                      <SeverityBadge severity={a.severity} />
                      <span>{a.message}</span>
                    </li>
                  ))}
                </ul>
                <Link className="link-more" to="/alerts">
                  {attention.length > 6 ? `View all ${attention.length} alerts` : 'View alerts'} <ArrowRight size={14} />
                </Link>
              </>
            ))}
        </Section>
      </div>

      <Section title="Quick Actions">
        <div className="quick-actions">
          {QUICK_ACTIONS.map(({ to, icon: Icon, label, hint }) => (
            <Link key={label} to={to} className="quick-action">
              <span className="quick-action-icon">
                <Icon size={16} />
              </span>
              <span>
                {label}
                <small>{hint}</small>
              </span>
            </Link>
          ))}
        </div>
      </Section>
    </AppShell>
  );
}
