import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Boxes, Layers, PlusCircle, RefreshCw, Scale, Warehouse as WarehouseIcon } from 'lucide-react';
import AppShell from '../components/AppShell';
import Button from '../components/Button';
import KpiCard from '../components/KpiCard';
import Section from '../components/Section';
import Notice from '../components/Notice';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import { FilterBar, SearchInput, SelectFilter } from '../components/FilterBar';
import { useApi } from '../api/useApi';
import { useRefData } from '../api/useRefData';
import { api } from '../api/client';
import { mapLimit } from '../lib/async';
import { expiryBucket } from '../lib/expiry';
import { formatDate, formatNumber, includesText, sumByUnit, todayISO } from '../lib/format';

const STATUS_OPTIONS = [
  { value: 'HEALTHY', label: 'Healthy' },
  { value: 'LOW', label: 'Low' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'EXPIRING', label: 'Expiring' },
];

// Precedence: critical > expiring > low > healthy. Stock risk comes from the backend
// stockout-risk result for the batch's material + warehouse; expiry from the expiry report.
function stockStatus(batch, risk, bucket) {
  if (batch.quantity <= 0) return 'DEPLETED';
  if (bucket === 'EXPIRED' || risk === 'HIGH') return 'CRITICAL';
  if (bucket === 'DUE_7' || bucket === 'DUE_30') return 'EXPIRING';
  if (risk === 'MEDIUM') return 'LOW';
  if (risk === 'LOW') return 'HEALTHY';
  return 'UNKNOWN';
}

export default function Inventory() {
  const [sp] = useSearchParams();
  const ref = useRefData();
  const inv = useApi(async () => {
    const [batches, expiry] = await Promise.all([api.getInventoryBatches(), api.getExpiryReport()]);
    const pairs = [
      ...new Map(
        batches.filter((b) => b.quantity > 0).map((b) => [`${b.raw_material_id}-${b.warehouse_id}`, b])
      ).values(),
    ];
    const risks = {};
    let failed = 0;
    await mapLimit(pairs, 6, async (b) => {
      try {
        const r = await api.getStockoutRisk({ raw_material_id: b.raw_material_id, warehouse_id: b.warehouse_id, prediction_date: todayISO() });
        risks[`${b.raw_material_id}-${b.warehouse_id}`] = r.risk_level;
      } catch {
        failed += 1;
      }
    });
    return { batches, expiry, risks, failed };
  }, []);

  const [search, setSearch] = useState('');
  const [warehouse, setWarehouse] = useState(sp.get('warehouse') || '');
  const [material, setMaterial] = useState(sp.get('material') || '');
  const [status, setStatus] = useState('');

  const rows = useMemo(() => {
    if (!inv.data) return [];
    const mats = new Map(ref.materials.map((m) => [m.id, m]));
    const whs = new Map(ref.warehouses.map((w) => [w.id, w]));
    const expiryById = new Map(inv.data.expiry.map((e) => [e.batch_id, e]));
    return inv.data.batches.map((b) => {
      const m = mats.get(b.raw_material_id);
      const bucket = expiryBucket(expiryById.get(b.id));
      return {
        ...b,
        material_name: m?.name ?? `#${b.raw_material_id}`,
        material_code: m?.raw_material_id ?? '',
        unit: m?.unit ?? '',
        warehouse_name: whs.get(b.warehouse_id)?.name ?? `#${b.warehouse_id}`,
        stock_status: stockStatus(b, inv.data.risks[`${b.raw_material_id}-${b.warehouse_id}`], bucket),
      };
    });
  }, [inv.data, ref.materials, ref.warehouses]);

  const filtered = rows.filter(
    (r) =>
      (includesText(r.material_name, search) || includesText(r.material_code, search) || includesText(r.batch_number, search)) &&
      (!warehouse || String(r.warehouse_id) === warehouse) &&
      (!material || String(r.raw_material_id) === material) &&
      (!status || r.stock_status === status)
  );

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.quantity > 0);
    return {
      byUnit: sumByUnit(active, (r) => r.unit, (r) => r.quantity),
      activeBatches: active.length,
      materials: new Set(active.map((r) => r.raw_material_id)).size,
      warehouses: new Set(active.map((r) => r.warehouse_id)).size,
    };
  }, [rows]);

  const loading = inv.status === 'loading' || ref.status === 'loading';
  const error = inv.error || ref.error;
  const hasFilters = search || warehouse || material || status;
  const reload = () => {
    inv.reload();
    ref.reload();
  };

  const columns = [
    {
      key: 'material_name',
      header: 'Raw Material',
      sortValue: (r) => r.material_name,
      render: (r) => (
        <>
          <strong>{r.material_name}</strong>
          <span className="cell-sub">{r.material_code}</span>
        </>
      ),
    },
    { key: 'warehouse_name', header: 'Warehouse', sortValue: (r) => r.warehouse_name },
    { key: 'batch_number', header: 'Batch', sortValue: (r) => r.batch_number, render: (r) => <span className="muted">{r.batch_number}</span> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortValue: (r) => r.quantity, render: (r) => formatNumber(r.quantity) },
    { key: 'unit', header: 'Unit' },
    {
      key: 'expiry_date',
      header: 'Expiry',
      sortValue: (r) => r.expiry_date,
      render: (r) => (r.expiry_date ? formatDate(r.expiry_date) : <span className="muted">No expiry</span>),
    },
    {
      key: 'stock_status',
      header: 'Status',
      render: (r) => <StatusBadge status={r.stock_status} label={r.stock_status === 'UNKNOWN' ? 'Unknown' : undefined} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <span style={{ display: 'inline-flex', gap: 2 }}>
          <Link className="icon-btn" title="View movements" aria-label="View movements" to={`/stock-movements?material=${r.raw_material_id}&warehouse=${r.warehouse_id}`}>
            <ArrowLeftRight size={15} />
          </Link>
          <Link className="icon-btn" title="Record movement" aria-label="Record movement" to={`/stock-movements?action=record&material=${r.raw_material_id}&warehouse=${r.warehouse_id}&batch=${r.id}`}>
            <PlusCircle size={15} />
          </Link>
        </span>
      ),
    },
  ];

  const unitEntries = Object.entries(summary.byUnit);

  return (
    <AppShell
      title="Inventory"
      description="Monitor stock across materials, warehouses and batches."
      onRefresh={reload}
      actions={
        <>
          <Button icon={RefreshCw} onClick={reload}>Refresh</Button>
          <Button variant="primary" icon={PlusCircle} to="/stock-movements?action=record&type=RECEIVE">Add inventory</Button>
        </>
      }
    >
      {!loading && !error && (
        <div className="kpi-row">
          {unitEntries.length === 0 ? (
            <KpiCard label="Total inventory" value="0" icon={Scale} hint="No stock on hand" />
          ) : (
            unitEntries.map(([unit, qty]) => <KpiCard key={unit} label={`Total inventory (${unit})`} value={formatNumber(qty)} unit={unit} icon={Scale} />)
          )}
          <KpiCard label="Batches with stock" value={summary.activeBatches} hint={`${rows.length} batches recorded`} icon={Layers} />
          <KpiCard label="Materials in stock" value={summary.materials} icon={Boxes} />
          <KpiCard label="Warehouses holding stock" value={summary.warehouses} icon={WarehouseIcon} />
        </div>
      )}

      {inv.data?.failed > 0 && (
        <Notice tone="warning">
          Stock health could not be determined for {inv.data.failed} material/warehouse combination(s) because the stockout-risk service did not respond.
        </Notice>
      )}

      <Section
        title="Stock by batch"
        subtitle="Status combines batch expiry with the backend stockout-risk result for that material in that warehouse."
      >
        <FilterBar
          canReset={Boolean(hasFilters)}
          onReset={() => {
            setSearch('');
            setWarehouse('');
            setMaterial('');
            setStatus('');
          }}
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Search material or batch…" />
          <SelectFilter label="Warehouse" value={warehouse} onChange={setWarehouse} options={ref.warehouses.map((w) => ({ value: String(w.id), label: w.name }))} allLabel="All warehouses" />
          <SelectFilter label="Raw material" value={material} onChange={setMaterial} options={ref.materials.map((m) => ({ value: String(m.id), label: m.name }))} allLabel="All materials" />
          <SelectFilter label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All statuses" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={reload}
          rowTone={(r) => (r.stock_status === 'CRITICAL' ? 'critical' : r.stock_status === 'EXPIRING' ? 'warning' : null)}
          emptyTitle={rows.length === 0 ? 'No inventory recorded' : 'No matching batches'}
          emptyMessage={rows.length === 0 ? 'Receive stock to create the first batch.' : 'Try changing or clearing the filters.'}
        />
      </Section>
    </AppShell>
  );
}
