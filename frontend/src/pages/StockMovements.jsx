import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Plus } from 'lucide-react';
import AppShell from '../components/AppShell';
import Button from '../components/Button';
import Field from '../components/Field';
import KpiCard from '../components/KpiCard';
import Section from '../components/Section';
import Notice from '../components/Notice';
import Modal from '../components/Modal';
import MissingRefNotice from '../components/MissingRefNotice';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import { DateFilter, FilterBar, SearchInput, SelectFilter } from '../components/FilterBar';
import { useApi } from '../api/useApi';
import { useRefData } from '../api/useRefData';
import { api } from '../api/client';
import { formatDate, formatDateTime, formatNumber, includesText, toDate } from '../lib/format';

// A transfer is stored by the backend as a TRANSFER_OUT / TRANSFER_IN pair, so "Transfer"
// in the filter matches both.
const TYPE_OPTIONS = [
  { value: 'RECEIVE', label: 'Receive' },
  { value: 'CONSUME', label: 'Consume' },
  { value: 'WASTAGE', label: 'Wastage' },
  { value: 'TRANSFER', label: 'Transfer' },
];
const isTransferType = (t) => t === 'TRANSFER_IN' || t === 'TRANSFER_OUT';

export default function StockMovements() {
  const [sp, setSp] = useSearchParams();
  const ref = useRefData();
  const [type, setType] = useState('');
  const [warehouse, setWarehouse] = useState(sp.get('warehouse') || '');
  const [material, setMaterial] = useState(sp.get('material') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(sp.get('action') === 'record');
  const [success, setSuccess] = useState('');
  const prefill = { type: sp.get('type'), material: sp.get('material'), warehouse: sp.get('warehouse'), batch: sp.get('batch') };

  const movements = useApi(
    () => api.getStockMovements({ movement_type: type === 'TRANSFER' ? '' : type, warehouse_id: warehouse, raw_material_id: material }),
    [type, warehouse, material]
  );
  const batches = useApi(() => api.getInventoryBatches(), []);

  const rows = useMemo(() => {
    if (!movements.data) return [];
    const mats = new Map(ref.materials.map((m) => [m.id, m]));
    const whs = new Map(ref.warehouses.map((w) => [w.id, w]));
    const bs = new Map((batches.data || []).map((b) => [b.id, b]));
    return movements.data
      .filter((m) => type !== 'TRANSFER' || isTransferType(m.movement_type))
      .map((m) => ({
        ...m,
        material_name: mats.get(m.raw_material_id)?.name ?? `#${m.raw_material_id}`,
        unit: mats.get(m.raw_material_id)?.unit ?? '',
        warehouse_name: whs.get(m.warehouse_id)?.name ?? `#${m.warehouse_id}`,
        batch_number: m.batch_id ? bs.get(m.batch_id)?.batch_number ?? `#${m.batch_id}` : null,
      }));
  }, [movements.data, type, ref.materials, ref.warehouses, batches.data]);

  // The API has no date filter, so the range is applied to the returned rows.
  const filtered = rows.filter((r) => {
    const d = toDate(r.movement_date);
    if (from && (!d || d < new Date(`${from}T00:00:00Z`))) return false;
    if (to && (!d || d > new Date(`${to}T23:59:59.999Z`))) return false;
    return includesText(r.material_name, search) || includesText(r.batch_number, search) || includesText(r.reference_note, search);
  });

  const count = (pred) => rows.filter((r) => pred(r.movement_type)).length;
  const loading = movements.status === 'loading' || ref.status === 'loading' || batches.status === 'loading';
  const error = movements.error || ref.error || batches.error;
  const hasFilters = type || warehouse || material || from || to || search;
  const reload = () => {
    ref.reload();
    movements.reload();
    batches.reload();
  };

  function closeForm() {
    setShowForm(false);
    if (sp.get('action')) setSp({}, { replace: true });
  }

  const columns = [
    { key: 'movement_date', header: 'Date', sortValue: (r) => r.movement_date, render: (r) => formatDateTime(r.movement_date) },
    { key: 'material_name', header: 'Material', sortValue: (r) => r.material_name, render: (r) => <strong>{r.material_name}</strong> },
    { key: 'warehouse_name', header: 'Warehouse', sortValue: (r) => r.warehouse_name },
    { key: 'movement_type', header: 'Movement Type', render: (r) => <StatusBadge status={r.movement_type} /> },
    { key: 'quantity', header: 'Quantity', align: 'right', sortValue: (r) => r.quantity, render: (r) => `${formatNumber(r.quantity)} ${r.unit}` },
    {
      key: 'reference',
      header: 'Reference / Batch',
      render: (r) =>
        r.batch_number || r.reference_note ? (
          <>
            {r.batch_number || <span className="muted">No batch</span>}
            {r.reference_note && <span className="cell-sub">{r.reference_note}</span>}
          </>
        ) : (
          <span className="muted">—</span>
        ),
    },
  ];

  return (
    <AppShell
      title="Stock Movements"
      description="A full history of stock received, consumed, written off and transferred."
      onRefresh={reload}
      actions={<Button variant="primary" icon={Plus} onClick={() => setShowForm(true)} disabled={ref.status !== 'success'}>Record Movement</Button>}
    >
      {success && <Notice tone="success" onDismiss={() => setSuccess('')}>{success}</Notice>}
      {ref.status === 'error' && <Notice tone="error">Raw materials and warehouses could not be loaded, so movements cannot be recorded: {ref.error.message}</Notice>}

      {!loading && !error && (
        <div className="kpi-row kpi-row--4">
          <KpiCard label="Receive" value={count((t) => t === 'RECEIVE')} icon={ArrowLeftRight} hint="Entries in the current view" />
          <KpiCard label="Consume" value={count((t) => t === 'CONSUME')} icon={ArrowLeftRight} hint="Entries in the current view" />
          <KpiCard label="Wastage" value={count((t) => t === 'WASTAGE')} icon={ArrowLeftRight} tone={count((t) => t === 'WASTAGE') > 0 ? 'critical' : 'default'} hint="Entries in the current view" />
          <KpiCard label="Transfer" value={count(isTransferType)} icon={ArrowLeftRight} hint="Out and in entries" />
        </div>
      )}

      <Section title="Movement history" subtitle="Filters apply to the movement date. The backend does not record who created a movement.">
        <FilterBar
          canReset={Boolean(hasFilters)}
          onReset={() => {
            setType('');
            setWarehouse('');
            setMaterial('');
            setFrom('');
            setTo('');
            setSearch('');
          }}
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Search material, batch or note…" />
          <SelectFilter label="Movement type" value={type} onChange={setType} options={TYPE_OPTIONS} allLabel="All types" />
          <SelectFilter label="Warehouse" value={warehouse} onChange={setWarehouse} options={ref.warehouses.map((w) => ({ value: String(w.id), label: w.name }))} allLabel="All warehouses" />
          <SelectFilter label="Raw material" value={material} onChange={setMaterial} options={ref.materials.map((m) => ({ value: String(m.id), label: m.name }))} allLabel="All materials" />
          <DateFilter label="From" value={from} onChange={setFrom} max={to || undefined} />
          <DateFilter label="To" value={to} onChange={setTo} min={from || undefined} />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={reload}
          initialSort={{ key: 'movement_date', dir: 'desc' }}
          emptyIcon={ArrowLeftRight}
          emptyTitle={rows.length === 0 && !hasFilters ? 'No movements yet' : 'No matching movements'}
          emptyMessage={rows.length === 0 && !hasFilters ? 'Record a movement to start the history.' : 'Try changing or clearing the filters.'}
        />
      </Section>

      {showForm && ref.status === 'success' && (
        <RecordMovementModal
          materials={ref.materials}
          warehouses={ref.warehouses}
          batches={batches.data || []}
          prefill={prefill}
          onClose={closeForm}
          onSeeded={() => {
            closeForm();
            setSuccess('Demo data loaded. Open Record Movement again to choose from the new materials and warehouses.');
            reload();
          }}
          onRecorded={(label) => {
            closeForm();
            setSuccess(label);
            movements.reload();
            batches.reload();
          }}
        />
      )}
    </AppShell>
  );
}

const FORM_TYPES = [
  { value: 'RECEIVE', label: 'Receive' },
  { value: 'CONSUME', label: 'Consume' },
  { value: 'WASTAGE', label: 'Wastage' },
  { value: 'TRANSFER', label: 'Transfer' },
];

function RecordMovementModal({ materials, warehouses, batches: allBatches, prefill, onClose, onRecorded, onSeeded }) {
  const validType = FORM_TYPES.some((t) => t.value === prefill.type) ? prefill.type : 'RECEIVE';
  const [f, setF] = useState({
    movement_type: validType,
    raw_material_id: prefill.material || '',
    warehouse_id: prefill.warehouse || '',
    destination_warehouse_id: '',
    batch_mode: prefill.batch && validType === 'RECEIVE' ? 'existing' : 'new',
    batch_id: prefill.batch || '',
    batch_number: '',
    expiry_date: '',
    quantity: '',
    notes: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dynamic batch loading: fetch batches for the selected material + warehouse
  const [scopedBatches, setScopedBatches] = useState([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState('');

  const isReceive = f.movement_type === 'RECEIVE';
  const isTransfer = f.movement_type === 'TRANSFER';
  const needsBatch = !isReceive || f.batch_mode === 'existing';
  const material = materials.find((m) => String(m.id) === f.raw_material_id);

  // Fetch batches from the backend whenever material or warehouse selection changes.
  const fetchBatches = useCallback(async (materialId, warehouseId) => {
    if (!materialId || !warehouseId) {
      setScopedBatches([]);
      return;
    }
    setBatchLoading(true);
    setBatchError('');
    try {
      const data = await api.getInventoryBatches({ raw_material_id: materialId, warehouse_id: warehouseId });
      setScopedBatches(data || []);
    } catch (err) {
      setBatchError(err.message || 'Failed to load batches');
      setScopedBatches([]);
    } finally {
      setBatchLoading(false);
    }
  }, []);

  // Re-fetch batches when material or warehouse changes.
  useEffect(() => {
    fetchBatches(f.raw_material_id, f.warehouse_id);
  }, [f.raw_material_id, f.warehouse_id, fetchBatches]);

  // Filter: for Receive, show all batches (including 0 qty); for others, only qty > 0.
  const batchOptions = scopedBatches.filter(
    (b) => isReceive || b.quantity > 0
  );
  const selectedBatch = batchOptions.find((b) => String(b.id) === f.batch_id);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  // Changing anything that scopes the batch list clears the batch selection.
  const setScoped = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value, batch_id: '' }));

  function validate() {
    const e = {};
    if (!f.raw_material_id) e.raw_material_id = 'Select a raw material.';
    if (!f.warehouse_id) e.warehouse_id = isTransfer ? 'Select the source warehouse.' : 'Select a warehouse.';
    if (isTransfer) {
      if (!f.destination_warehouse_id) e.destination_warehouse_id = 'Select the destination warehouse.';
      else if (f.destination_warehouse_id === f.warehouse_id) e.destination_warehouse_id = 'Destination must differ from the source warehouse.';
    }
    if (needsBatch && f.raw_material_id && f.warehouse_id && !f.batch_id) {
      e.batch_id = batchOptions.length === 0 ? 'No batches with stock for this material in this warehouse.' : 'Select a batch.';
    }
    const qty = Number(f.quantity);
    if (!f.quantity || !Number.isFinite(qty) || qty <= 0) e.quantity = 'Enter a quantity greater than zero.';
    else if (!isReceive && selectedBatch && qty > selectedBatch.quantity) {
      e.quantity = `Only ${formatNumber(selectedBatch.quantity)} ${material?.unit ?? ''} is available in this batch.`;
    }
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;

    const payload = {
      movement_type: f.movement_type,
      raw_material_id: Number(f.raw_material_id),
      warehouse_id: Number(f.warehouse_id),
      quantity: Number(f.quantity),
    };
    if (needsBatch) payload.batch_id = Number(f.batch_id);
    if (isTransfer) payload.destination_warehouse_id = Number(f.destination_warehouse_id);
    if (isReceive && f.batch_mode === 'new') {
      if (f.batch_number.trim()) payload.batch_number = f.batch_number.trim();
      if (f.expiry_date) payload.expiry_date = f.expiry_date;
    }
    if (f.notes.trim()) payload.notes = f.notes.trim();

    setSubmitting(true);
    setFormError('');
    try {
      await api.createStockMovement(payload);
      const label = FORM_TYPES.find((t) => t.value === f.movement_type)?.label;
      const route = isTransfer
        ? ` from ${warehouses.find((w) => w.id === payload.warehouse_id)?.name} to ${warehouses.find((w) => w.id === payload.destination_warehouse_id)?.name}`
        : '';
      onRecorded(`${label} of ${formatNumber(payload.quantity)} ${material?.unit ?? ''} recorded for ${material?.name}${route}.`);
    } catch (err) {
      setFormError(err.message);
      setSubmitting(false);
    }
  }

  if (materials.length === 0 || warehouses.length === 0) {
    return (
      <Modal title="Record Movement" onClose={onClose} width={620}>
        <MissingRefNotice needMaterials={materials.length === 0} needWarehouses={warehouses.length === 0} onLoaded={onSeeded} />
        <div className="form-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Record Movement" onClose={onClose} width={620}>
      <form onSubmit={submit} noValidate>
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="form-grid">
          <Field label="Movement type" span2>
            <select value={f.movement_type} onChange={setScoped('movement_type')}>
              {FORM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="Raw material" error={errors.raw_material_id}>
            <select value={f.raw_material_id} onChange={setScoped('raw_material_id')}>
              <option value="">Select a material…</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.raw_material_id}) · {m.unit}</option>)}
            </select>
          </Field>

          <Field label={isTransfer ? 'From warehouse' : 'Warehouse'} error={errors.warehouse_id}>
            <select value={f.warehouse_id} onChange={setScoped('warehouse_id')}>
              <option value="">Select a warehouse…</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.warehouse_id})</option>)}
            </select>
          </Field>

          {isTransfer && (
            <Field label="To warehouse" span2 error={errors.destination_warehouse_id}>
              <select value={f.destination_warehouse_id} onChange={set('destination_warehouse_id')}>
                <option value="">Select the destination warehouse…</option>
                {warehouses.filter((w) => String(w.id) !== f.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name} ({w.warehouse_id})</option>)}
              </select>
            </Field>
          )}

          {isReceive && (
            <Field label="Batch" span2>
              <select value={f.batch_mode} onChange={setScoped('batch_mode')}>
                <option value="new">Create a new batch</option>
                <option value="existing">Add to an existing batch</option>
              </select>
            </Field>
          )}

          {isReceive && f.batch_mode === 'new' && (
            <>
              <Field label="Batch number" hint="(optional — generated if blank)">
                <input value={f.batch_number} onChange={set('batch_number')} placeholder="e.g. FLR-2026-002" />
              </Field>
              <Field label="Expiry date" hint="(optional)">
                <input type="date" value={f.expiry_date} onChange={set('expiry_date')} />
              </Field>
            </>
          )}

          {needsBatch && (
            <Field label={isReceive ? 'Existing batch' : isTransfer ? 'Batch to transfer' : 'Batch to draw from'} span2 error={errors.batch_id}>
              {batchError && <Notice tone="error" style={{ marginBottom: 8 }}>{batchError}</Notice>}
              <select value={f.batch_id} onChange={set('batch_id')} disabled={!f.raw_material_id || !f.warehouse_id || batchLoading}>
                <option value="">
                  {!f.raw_material_id || !f.warehouse_id
                    ? 'Select material and warehouse first'
                    : batchLoading
                    ? 'Loading batches…'
                    : batchOptions.length === 0
                    ? 'No batches available'
                    : 'Select a batch…'}
                </option>
                {batchOptions.map((b) => {
                  const expiryStr = b.expiry_date ? ` · Exp: ${formatDate(b.expiry_date)}` : '';
                  return (
                    <option key={b.id} value={b.id}>
                      {b.batch_number} — {formatNumber(b.quantity)} {material?.unit} on hand{expiryStr}
                    </option>
                  );
                })}
              </select>
            </Field>
          )}

          <Field label="Quantity" hint={material ? `(${material.unit})` : undefined} error={errors.quantity}>
            <input type="number" min="0" step="any" value={f.quantity} onChange={set('quantity')} placeholder="0" />
          </Field>

          <Field label="Note" hint="(optional)" span2>
            <textarea value={f.notes} onChange={set('notes')} placeholder="Reference, PO number, reason…" />
          </Field>
        </div>

        <div className="form-actions">
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={submitting}>{submitting ? 'Recording…' : 'Record Movement'}</Button>
        </div>
      </form>
    </Modal>
  );
}
