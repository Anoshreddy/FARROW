import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertOctagon, CalendarClock, CalendarX2, CheckCircle2 } from 'lucide-react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import Section from '../components/Section';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import { FilterBar, SearchInput, SelectFilter } from '../components/FilterBar';
import { useApi } from '../api/useApi';
import { useRefData } from '../api/useRefData';
import { api } from '../api/client';
import { EXPIRY_OPTIONS, daysLabel, expiryBucket } from '../lib/expiry';
import { formatDate, formatNumber, includesText } from '../lib/format';

// "Expiring within 30 days" is cumulative, so it also matches the 7-day bucket.
const matchesStatus = (bucket, filter) =>
  !filter || bucket === filter || (filter === 'DUE_30' && bucket === 'DUE_7');

export default function Batches() {
  const [sp] = useSearchParams();
  const ref = useRefData();
  const data = useApi(async () => {
    const [batches, expiry] = await Promise.all([api.getInventoryBatches(), api.getExpiryReport()]);
    return { batches, expiry };
  }, []);

  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [material, setMaterial] = useState('');
  const [status, setStatus] = useState(sp.get('status') || '');

  const rows = useMemo(() => {
    if (!data.data) return [];
    const mats = new Map(ref.materials.map((m) => [m.id, m]));
    const whs = new Map(ref.warehouses.map((w) => [w.id, w]));
    const expiryById = new Map(data.data.expiry.map((e) => [e.batch_id, e]));
    return data.data.batches.map((b) => {
      const e = expiryById.get(b.id);
      return {
        ...b,
        material_name: mats.get(b.raw_material_id)?.name ?? `#${b.raw_material_id}`,
        unit: mats.get(b.raw_material_id)?.unit ?? '',
        warehouse_name: whs.get(b.warehouse_id)?.name ?? `#${b.warehouse_id}`,
        bucket: expiryBucket(e),
        days: e ? e.days_until_expiry : null,
      };
    });
  }, [data.data, ref.materials, ref.warehouses]);

  const count = (b) => rows.filter((r) => r.bucket === b).length;
  const filtered = rows.filter(
    (r) =>
      (includesText(r.batch_number, search) || includesText(r.material_name, search)) &&
      (!warehouse || String(r.warehouse_id) === warehouse) &&
      (!material || String(r.raw_material_id) === material) &&
      matchesStatus(r.bucket, status)
  );

  const loading = data.status === 'loading' || ref.status === 'loading';
  const error = data.error || ref.error;
  const hasFilters = search || warehouse || material || status;
  const reload = () => {
    data.reload();
    ref.reload();
  };

  const columns = [
    { key: 'batch_number', header: 'Batch', sortValue: (r) => r.batch_number, render: (r) => <strong>{r.batch_number}</strong> },
    { key: 'material_name', header: 'Raw Material', sortValue: (r) => r.material_name },
    { key: 'warehouse_name', header: 'Warehouse', sortValue: (r) => r.warehouse_name },
    { key: 'quantity', header: 'Quantity', align: 'right', sortValue: (r) => r.quantity, render: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
    { key: 'expiry_date', header: 'Expiry Date', sortValue: (r) => r.expiry_date, render: (r) => (r.expiry_date ? formatDate(r.expiry_date) : <span className="muted">—</span>) },
    { key: 'days', header: 'Days Remaining', align: 'right', sortValue: (r) => r.days, render: (r) => daysLabel(r.days) },
    { key: 'bucket', header: 'Status', render: (r) => <StatusBadge status={r.bucket} /> },
  ];

  return (
    <AppShell
      title="Batches & Expiry"
      description="Track every batch against its expiry date so nothing is used or shipped past its limit."
      onRefresh={reload}
    >
      {!loading && !error && (
        <div className="kpi-row kpi-row--4">
          <KpiCard label="Expired" value={count('EXPIRED')} icon={AlertOctagon} tone={count('EXPIRED') > 0 ? 'critical' : 'default'} hint="Batches with stock past expiry" />
          <KpiCard label="Within 7 days" value={count('DUE_7')} icon={CalendarClock} tone={count('DUE_7') > 0 ? 'warning' : 'default'} hint="Use or move first" />
          <KpiCard label="Within 30 days" value={count('DUE_7') + count('DUE_30')} icon={CalendarClock} tone={count('DUE_7') + count('DUE_30') > 0 ? 'warning' : 'default'} hint={`Includes ${count('DUE_7')} within 7 days`} />
          <KpiCard label="Safe" value={count('SAFE')} icon={CheckCircle2} tone="healthy" hint={`${count('NO_EXPIRY')} more have no expiry date`} />
        </div>
      )}

      <Section title="All batches" subtitle="Expiry status comes from the backend expiry report. Depleted batches (0 quantity) are not part of that report.">
        <FilterBar
          canReset={Boolean(hasFilters)}
          onReset={() => {
            setSearch('');
            setWarehouse('');
            setMaterial('');
            setStatus('');
          }}
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Search batch or material…" />
          <SelectFilter label="Warehouse" value={warehouse} onChange={setWarehouse} options={ref.warehouses.map((w) => ({ value: String(w.id), label: w.name }))} allLabel="All warehouses" />
          <SelectFilter label="Raw material" value={material} onChange={setMaterial} options={ref.materials.map((m) => ({ value: String(m.id), label: m.name }))} allLabel="All materials" />
          <SelectFilter label="Expiry status" value={status} onChange={setStatus} options={EXPIRY_OPTIONS} allLabel="All statuses" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={reload}
          initialSort={{ key: 'days', dir: 'asc' }}
          rowTone={(r) => (r.bucket === 'EXPIRED' ? 'critical' : r.bucket === 'DUE_7' || r.bucket === 'DUE_30' ? 'warning' : null)}
          emptyIcon={CalendarX2}
          emptyTitle={rows.length === 0 ? 'No batches recorded' : 'No matching batches'}
          emptyMessage={rows.length === 0 ? 'Batches appear here once stock has been received.' : 'Try changing or clearing the filters.'}
        />
      </Section>
    </AppShell>
  );
}
