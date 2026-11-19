import { useState } from 'react';
import { ShieldAlert, ShieldCheck, ShieldHalf } from 'lucide-react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import Section from '../components/Section';
import Notice from '../components/Notice';
import DataTable from '../components/DataTable';
import { RiskBadge } from '../components/StatusBadge';
import { FilterBar, SelectFilter } from '../components/FilterBar';
import { useRefData } from '../api/useRefData';
import { useRiskMatrix } from '../api/useRiskMatrix';
import { coverageLabel, formatNumber, todayISO } from '../lib/format';

const RISK_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const RISK_OPTIONS = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

// Plain-language reading of the numbers the backend returned (no new calculation).
function explain(r) {
  if (r.predicted_daily_consumption <= 0) return 'No consumption is forecast, so stock is not expected to run down.';
  const cover = `Stock lasts about ${formatNumber(r.stock_coverage_days, 1)} days`;
  const lead = `the supplier needs ${r.supplier_lead_time_days} days`;
  if (r.risk_level === 'HIGH') return `${cover}, shorter than the time ${lead}.`;
  if (r.risk_level === 'MEDIUM') return `${cover}, only slightly longer than the time ${lead}.`;
  return `${cover}, comfortably longer than the time ${lead}.`;
}

export default function StockoutRisk() {
  const ref = useRefData();
  const predictionDate = todayISO();
  const matrix = useRiskMatrix({ materials: ref.materials, warehouses: ref.warehouses, predictionDate, enabled: ref.status === 'success' });
  const [risk, setRisk] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [material, setMaterial] = useState('');

  const rows = matrix.rows;
  const filtered = rows.filter(
    (r) => (!risk || r.risk_level === risk) && (!warehouse || String(r.warehouse_id) === warehouse) && (!material || String(r.raw_material_id) === material)
  );
  const count = (lvl) => rows.filter((r) => r.risk_level === lvl).length;

  const loading = ref.status === 'loading' || matrix.status === 'loading';
  const error = ref.error || (matrix.status === 'error' ? new Error('The stockout-risk service did not respond for any material/warehouse pair.') : null);
  const hasFilters = risk || warehouse || material;
  const reload = () => {
    ref.reload();
    matrix.reload();
  };

  const columns = [
    { key: 'raw_material_name', header: 'Raw Material', sortValue: (r) => r.raw_material_name, render: (r) => <strong>{r.raw_material_name}</strong> },
    { key: 'warehouse_name', header: 'Warehouse', sortValue: (r) => r.warehouse_name },
    { key: 'current_stock', header: 'Current Stock', align: 'right', sortValue: (r) => r.current_stock, render: (r) => `${formatNumber(r.current_stock)} ${r.unit}` },
    { key: 'predicted_daily_consumption', header: 'Forecast Consumption', align: 'right', sortValue: (r) => r.predicted_daily_consumption, render: (r) => `${formatNumber(r.predicted_daily_consumption)} ${r.unit}/day` },
    { key: 'supplier_lead_time_days', header: 'Supplier Lead Time', align: 'right', sortValue: (r) => r.supplier_lead_time_days, render: (r) => `${r.supplier_lead_time_days} days` },
    { key: 'stock_coverage_days', header: 'Stock Coverage', align: 'right', sortValue: (r) => r.stock_coverage_days, render: (r) => coverageLabel(r.stock_coverage_days) },
    { key: 'risk_level', header: 'Risk Level', sortValue: (r) => RISK_ORDER[r.risk_level], render: (r) => <RiskBadge level={r.risk_level} /> },
    { key: 'why', header: 'Why', render: (r) => <div className="cell-wrap">{explain(r)}</div> },
  ];

  return (
    <AppShell
      title="Stockout Risk"
      description="Find materials likely to run out before the next supplier delivery can arrive."
      onRefresh={reload}
    >
      {loading && matrix.total > 0 && (
        <Notice tone="info">Evaluating stockout risk… {matrix.done} of {matrix.total} material/warehouse pairs.</Notice>
      )}

      {!loading && !error && (
        <div className="kpi-row">
          <KpiCard label="High risk" value={count('HIGH')} tone={count('HIGH') > 0 ? 'critical' : 'default'} icon={ShieldAlert} hint="Coverage shorter than supplier lead time" />
          <KpiCard label="Medium risk" value={count('MEDIUM')} tone={count('MEDIUM') > 0 ? 'warning' : 'default'} icon={ShieldHalf} hint="Coverage under 1.5× lead time" />
          <KpiCard label="Low risk" value={count('LOW')} tone="healthy" icon={ShieldCheck} hint="Coverage comfortably above lead time" />
        </div>
      )}

      {matrix.failures.length > 0 && (
        <Notice tone="warning">{matrix.failures.length} material/warehouse pair(s) could not be evaluated and are not shown.</Notice>
      )}

      <Section title="Risk by material and warehouse" subtitle={`Evaluated for ${predictionDate}. Risk level, coverage and lead time are returned by the backend and not recalculated in the browser.`}>
        <FilterBar
          canReset={Boolean(hasFilters)}
          onReset={() => {
            setRisk('');
            setWarehouse('');
            setMaterial('');
          }}
        >
          <SelectFilter label="Risk level" value={risk} onChange={setRisk} options={RISK_OPTIONS} allLabel="All levels" />
          <SelectFilter label="Warehouse" value={warehouse} onChange={setWarehouse} options={ref.warehouses.map((w) => ({ value: String(w.id), label: w.name }))} allLabel="All warehouses" />
          <SelectFilter label="Raw material" value={material} onChange={setMaterial} options={ref.materials.map((m) => ({ value: String(m.id), label: m.name }))} allLabel="All materials" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => `${r.raw_material_id}-${r.warehouse_id}`}
          loading={loading}
          error={error}
          onRetry={reload}
          initialSort={{ key: 'risk_level', dir: 'asc' }}
          rowTone={(r) => (r.risk_level === 'HIGH' ? 'critical' : r.risk_level === 'MEDIUM' ? 'warning' : null)}
          emptyTitle={rows.length === 0 ? 'Nothing to evaluate' : 'No matching results'}
          emptyMessage={rows.length === 0 ? 'Add raw materials and warehouses to evaluate stockout risk.' : 'Try changing or clearing the filters.'}
        />
      </Section>
    </AppShell>
  );
}
