import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Boxes, Eye, Pencil, Plus, Tags, Trash2, Wheat } from 'lucide-react';
import AppShell from '../components/AppShell';
import Button from '../components/Button';
import Field from '../components/Field';
import KpiCard from '../components/KpiCard';
import Section from '../components/Section';
import Notice from '../components/Notice';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import DetailList from '../components/DetailList';
import MissingRefNotice from '../components/MissingRefNotice';
import DataTable from '../components/DataTable';
import StatusBadge from '../components/StatusBadge';
import { LoadingState } from '../components/AsyncState';
import { FilterBar, SearchInput, SelectFilter } from '../components/FilterBar';
import { useApi } from '../api/useApi';
import { useRefData } from '../api/useRefData';
import { api } from '../api/client';
import { formatDateTime, formatNumber, includesText } from '../lib/format';

export default function RawMaterials() {
  const [sp, setSp] = useSearchParams();
  const ref = useRefData();
  const batches = useApi(() => api.getInventoryBatches(), []);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  // modal: null | { kind: 'add' } | { kind: 'edit' | 'details' | 'delete', material }
  const [modal, setModal] = useState(sp.get('action') === 'add' ? { kind: 'add' } : null);
  const [success, setSuccess] = useState('');

  const rows = useMemo(() => {
    const stats = new Map();
    (batches.data || []).forEach((b) => {
      const s = stats.get(b.raw_material_id) || { qty: 0, batches: 0, whs: new Set() };
      s.qty += b.quantity;
      s.batches += 1;
      if (b.quantity > 0) s.whs.add(b.warehouse_id);
      stats.set(b.raw_material_id, s);
    });
    return ref.materials.map((m) => {
      const s = stats.get(m.id);
      return { ...m, total_stock: s ? s.qty : 0, batch_count: s ? s.batches : 0, warehouse_count: s ? s.whs.size : 0 };
    });
  }, [ref.materials, batches.data]);

  const filtered = rows.filter(
    (r) =>
      (!category || r.category === category) &&
      (includesText(r.name, search) || includesText(r.raw_material_id, search) || includesText(r.category, search))
  );

  const loading = ref.status === 'loading' || batches.status === 'loading';
  const error = ref.error || batches.error;
  const reload = () => {
    ref.reload();
    batches.reload();
  };
  const inStock = rows.filter((r) => r.total_stock > 0).length;
  const categories = [...new Set(rows.map((r) => r.category))].sort();

  function closeModal() {
    setModal(null);
    if (sp.get('action')) setSp({}, { replace: true });
  }
  function done(message) {
    closeModal();
    setSuccess(message);
    reload();
  }

  const columns = [
    { key: 'raw_material_id', header: 'Material ID', sortValue: (r) => r.raw_material_id, render: (r) => <span className="muted">{r.raw_material_id}</span> },
    {
      key: 'name',
      header: 'Material',
      sortValue: (r) => r.name,
      render: (r) => (
        <>
          <strong>{r.name}</strong>
          {r.is_demo && <span className="demo-tag" title="Inserted by the demo-data seeder">Demo</span>}
          <span className="cell-sub">{r.category}</span>
        </>
      ),
    },
    { key: 'unit', header: 'Unit' },
    { key: 'total_stock', header: 'Current Quantity', align: 'right', sortValue: (r) => r.total_stock, render: (r) => `${formatNumber(r.total_stock)} ${r.unit}` },
    {
      key: 'related',
      header: 'Related Inventory',
      sortValue: (r) => r.batch_count,
      render: (r) =>
        r.batch_count === 0 ? (
          <span className="muted">No batches</span>
        ) : (
          `${r.batch_count} ${r.batch_count === 1 ? 'batch' : 'batches'} · ${r.warehouse_count} ${r.warehouse_count === 1 ? 'warehouse' : 'warehouses'}`
        ),
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.total_stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK'} /> },
    {
      key: 'actions',
      header: 'Actions',
      render: (r) => (
        <div className="row-actions">
          <Button size="sm" icon={Eye} onClick={() => setModal({ kind: 'details', material: r })} aria-label={`Details for ${r.name}`}>Details</Button>
          <Button size="sm" icon={Pencil} onClick={() => setModal({ kind: 'edit', material: r })} aria-label={`Edit ${r.name}`}>Edit</Button>
          <Button size="sm" variant="danger" icon={Trash2} onClick={() => setModal({ kind: 'delete', material: r })} aria-label={`Delete ${r.name}`}>Delete</Button>
        </div>
      ),
    },
  ];

  const empty = rows.length === 0;

  return (
    <AppShell
      title="Raw Materials"
      description="The materials you track, with the stock currently held across all warehouses."
      onRefresh={reload}
      actions={<Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>Add Raw Material</Button>}
    >
      {success && <Notice tone="success" onDismiss={() => setSuccess('')}>{success}</Notice>}

      {!loading && !error && (
        <div className="kpi-row">
          <KpiCard label="Raw materials" value={rows.length} icon={Wheat} />
          <KpiCard label="With stock on hand" value={inStock} hint={`${rows.length - inStock} with no stock`} icon={Boxes} tone={rows.length - inStock > 0 ? 'warning' : 'default'} />
          <KpiCard label="Categories" value={categories.length} icon={Tags} />
        </div>
      )}

      <Section title="All raw materials" subtitle="Quantities are summed from inventory batches.">
        <FilterBar
          canReset={Boolean(search || category)}
          onReset={() => {
            setSearch('');
            setCategory('');
          }}
        >
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, ID or category…" />
          <SelectFilter label="Category" value={category} onChange={setCategory} options={categories.map((c) => ({ value: c, label: c }))} allLabel="All categories" />
        </FilterBar>
        {!loading && !error && empty && (
          <div style={{ marginBottom: 14 }}>
            <MissingRefNotice needMaterials needWarehouses={false} compact onLoaded={reload} />
          </div>
        )}
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={reload}
          emptyTitle={empty ? 'No raw materials yet' : 'No matching materials'}
          emptyMessage={empty ? 'Add your first raw material to start tracking stock.' : 'Try a different search or category.'}
          emptyAction={empty && <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>Add Raw Material</Button>}
        />
      </Section>

      {modal?.kind === 'add' && (
        <MaterialFormModal
          materials={ref.materials}
          onClose={closeModal}
          onSaved={(m) => done(`Raw material “${m.name}” was added. It is now available in Stock Movements and Demand Forecast.`)}
        />
      )}
      {modal?.kind === 'edit' && (
        <MaterialFormModal
          material={modal.material}
          materials={ref.materials}
          onClose={closeModal}
          onSaved={(m) => done(`Raw material “${m.name}” was updated.`)}
        />
      )}
      {modal?.kind === 'details' && <MaterialDetailsModal material={modal.material} onClose={closeModal} onEdit={() => setModal({ kind: 'edit', material: modal.material })} />}
      {modal?.kind === 'delete' && (
        <ConfirmModal
          title="Delete raw material"
          message={`Delete “${modal.material.name}” (${modal.material.raw_material_id})? This cannot be undone. Materials that have inventory batches or stock movements cannot be deleted.`}
          onClose={closeModal}
          onConfirm={async () => {
            await api.deleteRawMaterial(modal.material.id);
            done(`Raw material “${modal.material.name}” was deleted.`);
          }}
        />
      )}
    </AppShell>
  );
}

function MaterialDetailsModal({ material, onClose, onEdit }) {
  const detail = useApi(() => api.getRawMaterial(material.id), [material.id]);
  const d = detail.data;
  return (
    <Modal title="Raw material details" onClose={onClose}>
      {detail.status === 'loading' && <LoadingState label="Loading details…" />}
      {detail.status === 'error' && <Notice tone="error">{detail.error.message}</Notice>}
      {d && (
        <DetailList
          items={[
            { label: 'Material ID', value: d.raw_material_id },
            { label: 'Name', value: d.name },
            { label: 'Category', value: d.category },
            { label: 'Unit', value: d.unit },
            { label: 'Total on hand', value: `${formatNumber(d.usage.total_quantity)} ${d.unit}` },
            { label: 'Inventory batches', value: d.usage.batch_count },
            { label: 'Stock movements', value: d.usage.movement_count },
            { label: 'Created', value: formatDateTime(d.created_at) },
            { label: 'Record type', value: d.is_demo ? 'Demo data' : 'User-created' },
          ]}
        />
      )}
      <div className="form-actions">
        <Link className="btn" to={`/inventory?material=${material.id}`}>View inventory</Link>
        <Link className="btn" to={`/stock-movements?material=${material.id}`}>View movements</Link>
        <Button onClick={onEdit}>Edit</Button>
        <Button variant="primary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

// Add (no `material` prop) or edit (with `material`). The material ID is fixed after creation because the
// forecasting model keys on it; the unit is locked by the backend once the material has stock history.
function MaterialFormModal({ material, materials, onClose, onSaved }) {
  const editing = Boolean(material);
  const [form, setForm] = useState({
    raw_material_id: material?.raw_material_id || '',
    name: material?.name || '',
    unit: material?.unit || '',
    category: material?.category || '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const units = [...new Set(materials.map((m) => m.unit))];
  const categories = [...new Set(materials.map((m) => m.category))];
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(p) {
    const e = {};
    if (!p.raw_material_id) e.raw_material_id = 'Enter a material ID.';
    else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(p.raw_material_id)) e.raw_material_id = 'Use letters, numbers, hyphens or underscores only.';
    else if (!editing && materials.some((m) => m.raw_material_id.toLowerCase() === p.raw_material_id.toLowerCase()))
      e.raw_material_id = `ID “${p.raw_material_id}” is already in use.`;
    if (!p.name) e.name = 'Enter a name.';
    if (!p.unit) e.unit = 'Enter a unit.';
    if (!p.category) e.category = 'Enter a category.';
    return e;
  }

  async function submit(ev) {
    ev.preventDefault();
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
    const e = validate(payload);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    setFormError('');
    try {
      if (editing) {
        const { raw_material_id, ...changes } = payload;
        await api.updateRawMaterial(material.id, changes);
      } else {
        await api.createRawMaterial(payload);
      }
      onSaved(payload);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      else setFormError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit Raw Material' : 'Add Raw Material'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="form-grid">
          <Field label="Material ID" error={errors.raw_material_id} hint={editing ? '(cannot be changed)' : undefined}>
            <input value={form.raw_material_id} onChange={set('raw_material_id')} placeholder="e.g. RM11" autoFocus={!editing} readOnly={editing} />
          </Field>
          <Field label="Name" error={errors.name}>
            <input value={form.name} onChange={set('name')} placeholder="e.g. Baking Soda" autoFocus={editing} />
          </Field>
          <Field label="Unit" error={errors.unit}>
            <input value={form.unit} onChange={set('unit')} list="unit-options" placeholder="kg, L…" />
            <datalist id="unit-options">{units.map((u) => <option key={u} value={u} />)}</datalist>
          </Field>
          <Field label="Category" error={errors.category}>
            <input value={form.category} onChange={set('category')} list="category-options" placeholder="e.g. Baking" />
            <datalist id="category-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <div className="form-actions">
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : editing ? 'Save changes' : 'Add Raw Material'}</Button>
        </div>
      </form>
    </Modal>
  );
}
