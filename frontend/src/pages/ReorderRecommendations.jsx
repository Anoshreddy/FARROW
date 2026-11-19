import { useState } from 'react';
import { CircleCheck, PackagePlus, ShieldAlert } from 'lucide-react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import Section from '../components/Section';
import Notice from '../components/Notice';
import DataTable from '../components/DataTable';
import StatusBadge, { RiskBadge } from '../components/StatusBadge';
import { FilterBar, SelectFilter } from '../components/FilterBar';
import { useRefData } from '../api/useRefData';
import { useRiskMatrix } from '../api/useRiskMatrix';
import { formatNumber, todayISO } from '../lib/format';

const RISK_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const PRIORITY_OPTIONS = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];
const STATUS_OPTIONS = [
  { value: 'reorder', label: 'Reorder recommended' },
  { value: 'none', label: 'No reorder required' },
];
const needsReorder = (r) => r.reorder_quantity > 0;

export default function ReorderRecommendations() {
  const ref = useRefData();
  const predictionDate = todayISO();
  const matrix = useRiskMatrix({ materials: ref.materials, warehouses: ref.warehouses, predictionDate, enabled: ref.status === 'success' });
  const [warehouse, setWarehouse] = useState('');
  const [material, setMaterial] = useState('');
  const [priority, setPriority] = useState('');
  const [status, setStatus] = useState('reorder');

  const rows = matrix.rows;
  const filtered = rows.filter(
    (r) =>
      (!warehouse || String(r.warehouse_id) === warehouse) &&
      (!material || String(r.raw_material_id) === material) &&
      (!priority || r.risk_level === priority) &&
      (!status || (status === 'reorder' ? needsReorder(r) : !needsReorder(r)))
  );

  const reorderRows = rows.filter(needsReorder);
  const urgent = reorderRows.filter((r) => r.risk_level === 'HIGH').sort((a, b) => b.reorder_quantity - a.reorder_quantity);
  const loading = ref.status === 'loading' || matrix.status === 'loading';
  const error = ref.error || (matrix.status === 'error' ? new Error('The stockout-risk service did not respond for any material/warehouse pair.') : null);
  const hasFilters = warehouse || material || priority || status !== 'reorder';
  const reload = () => {
    ref.reload();
    matrix.reload();
  };

  const columns = [
    { key: 'raw_material_name', header: 'Raw Material', sortValue: (r) => r.raw_material_name, render: (r) => <strong>{r.raw_material_name}</strong> },
    { key: 'warehouse_name', header: 'Warehouse', sortValue: (r) => r.warehouse_name },
    { key: 'current_stock', header: 'Current Stock', align: 'right', sortValue: (r) => r.current_stock, render: (r) => `${formatNumber(r.current_stock)} ${r.unit}` },
    { key: 'supplier_lead_time_days', header: 'Lead Time', align: 'right', sortValue: (r) => r.supplier_lead_time_days, render: (r) => `${r.supplier_lead_time_days} days` },
    {
      key: 'lead_time_demand',
      header: 'Forecast Demand',
      align: 'right',
      sortValue: (r) => r.lead_time_demand,
      render: (r) => (
        <>
          {formatNumber(r.lead_time_demand)} {r.unit}
          <span className="cell-sub">{formatNumber(r.predicted_daily_consumption)} {r.unit}/day over lead time</span>
        </>
      ),
    },
    {
      key: 'reorder_quantity',
      header: 'Recommended Quantity',
      align: 'right',
      sortValue: (r) => r.reorder_quantity,
      render: (r) =>
        needsReorder(r) ? (
          <span className="num-strong" style={{ color: 'var(--color-primary)' }}>{formatNumber(r.reorder_quantity)} {r.unit}</span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'risk_level', header: 'Priority', sortValue: (r) => RISK_ORDER[r.risk_level], render: (r) => <RiskBadge level={r.risk_level} /> },
    {
      key: 'recommendation',
      header: 'Status',
      sortValue: (r) => r.reorder_quantity,
      render: (r) => <StatusBadge status={needsReorder(r) ? 'REORDER' : 'NO_REORDER'} label={r.recommendation} />,
    },
  ];

  return (
    <AppShell
      title="Reorder Recommendations"
      description="Prioritize materials that need replenishment based on current stock, forecast demand and supplier lead time."
      onRefresh={reload}
    >
      {!loading && !error && (
        <>
          <div className="kpi-row">
            <KpiCard label="Reorder recommended" value={reorderRows.length} tone={reorderRows.length > 0 ? 'warning' : 'default'} icon={PackagePlus} hint="Material/warehouse pairs" />
            <KpiCard label="High priority" value={urgent.length} tone={urgent.length > 0 ? 'critical' : 'default'} icon={ShieldAlert} hint="High stockout risk and a reorder needed" />
            <KpiCard label="No reorder required" value={rows.length - reorderRows.length} tone="healthy" icon={CircleCheck} />
          </div>

          {urgent.length > 0 && (
            <div className="priority-strip" role="region" aria-label="High priority reorders">
              <h2>{urgent.length} high-priority {urgent.length === 1 ? 'reorder' : 'reorders'}</h2>
              <ul>
                {urgent.slice(0, 6).map((r) => (
                  <li key={`${r.raw_material_id}-${r.warehouse_id}`}>
                    <strong>{r.raw_material_name}</strong> · {r.warehouse_name} — {formatNumber(r.reorder_quantity)} {r.unit}
                  </li>
                ))}
                {urgent.length > 6 && <li className="muted">and {urgent.length - 6} more in the table below</li>}
              </ul>
            </div>
          )}
        </>
      )}

      {matrix.failures.length > 0 && (
        <Notice tone="warning">{matrix.failures.length} material/warehouse pair(s) could not be evaluated and are not shown.</Notice>
      )}

      <Section
        title="Recommendations"
        subtitle="Quantities come straight from the backend: target stock (lead-time demand plus a safety buffer) minus current stock. Priority follows the backend stockout-risk level. No purchase orders are created."
      >
        <FilterBar
          canReset={Boolean(hasFilters)}
          onReset={() => {
            setWarehouse('');
            setMaterial('');
            setPriority('');
            setStatus('reorder');
          }}
        >
          <SelectFilter label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All" />
          <SelectFilter label="Warehouse" value={warehouse} onChange={setWarehouse} options={ref.warehouses.map((w) => ({ value: String(w.id), label: w.name }))} allLabel="All warehouses" />
          <SelectFilter label="Raw material" value={material} onChange={setMaterial} options={ref.materials.map((m) => ({ value: String(m.id), label: m.name }))} allLabel="All materials" />
          <SelectFilter label="Priority" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} allLabel="All priorities" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => `${r.raw_material_id}-${r.warehouse_id}`}
          loading={loading}
          error={error}
          onRetry={reload}
          initialSort={{ key: 'risk_level', dir: 'asc' }}
          rowTone={(r) => (needsReorder(r) && r.risk_level === 'HIGH' ? 'critical' : needsReorder(r) && r.risk_level === 'MEDIUM' ? 'warning' : null)}
          emptyIcon={CircleCheck}
          emptyTone="ok"
          emptyTitle={rows.length === 0 ? 'Nothing to evaluate' : 'No recommendations'}
          emptyMessage={rows.length === 0 ? 'Add raw materials and warehouses first.' : 'No items match the current filters.'}
        />
      </Section>
    </AppShell>
  );
}
