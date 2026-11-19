import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, MapPin, Pencil, Plus, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import AppShell from '../components/AppShell';
import Button from '../components/Button';
import Field from '../components/Field';
import Section from '../components/Section';
import Notice from '../components/Notice';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import DetailList from '../components/DetailList';
import MissingRefNotice from '../components/MissingRefNotice';
import StatusBadge from '../components/StatusBadge';
import { FilterBar, SearchInput } from '../components/FilterBar';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState';
import { useApi } from '../api/useApi';
import { useRefData } from '../api/useRefData';
import { api } from '../api/client';
import { formatDateTime, formatNumber, formatUnitTotals, includesText, sumByUnit } from '../lib/format';

export default function Warehouses() {
  const [sp, setSp] = useSearchParams();
  const ref = useRefData();
  const batches = useApi(() => api.getInventoryBatches(), []);
  const [search, setSearch] = useState('');
  // modal: null | { kind: 'add' } | { kind: 'edit' | 'details' | 'delete', warehouse }
  const [modal, setModal] = useState(sp.get('action') === 'add' ? { kind: 'add' } : null);
  const [success, setSuccess] = useState('');

  const rows = useMemo(() => {
    const unitOf = new Map(ref.materials.map((m) => [m.id, m.unit]));
    return ref.warehouses.map((w) => {
      const mine = (batches.data || []).filter((b) => b.warehouse_id === w.id);
      const active = mine.filter((b) => b.quantity > 0);
      return {
        ...w,
        batch_count: active.length,
        material_count: new Set(active.map((b) => b.raw_material_id)).size,
        by_unit: sumByUnit(active, (b) => unitOf.get(b.raw_material_id), (b) => b.quantity),
      };
    });
  }, [ref.warehouses, ref.materials, batches.data]);

  const filtered = rows.filter((r) => includesText(r.name, search) || includesText(r.location, search) || includesText(r.warehouse_id, search));
  const loading = ref.status === 'loading' || batches.status === 'loading';
  const error = ref.error || batches.error;
  const reload = () => {
    ref.reload();
    batches.reload();
  };

  function closeModal() {
    setModal(null);
    if (sp.get('action')) setSp({}, { replace: true });
  }
  function done(message) {
    closeModal();
    setSuccess(message);
    reload();
  }

  const empty = rows.length === 0;

  return (
    <AppShell
      title="Warehouses"
      description="Storage locations and what each one currently holds."
      onRefresh={reload}
      actions={<Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>Add Warehouse</Button>}
    >
      {success && <Notice tone="success" onDismiss={() => setSuccess('')}>{success}</Notice>}

      <Section title="All warehouses" subtitle="Quantities are summed from batches that currently hold stock, per unit of measure.">
        <FilterBar canReset={Boolean(search)} onReset={() => setSearch('')}>
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, code or location…" />
        </FilterBar>

        {loading && <LoadingState label="Loading warehouses…" />}
        {error && <ErrorState message={error.message} onRetry={reload} />}
        {!loading && !error && empty && (
          <div style={{ marginBottom: 14 }}>
            <MissingRefNotice needMaterials={false} needWarehouses compact onLoaded={reload} />
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <EmptyState
            title={empty ? 'No warehouses yet' : 'No matching warehouses'}
            message={empty ? 'Add a warehouse so stock can be received, moved and forecast.' : 'Try a different search.'}
            icon={WarehouseIcon}
            action={empty && <Button variant="primary" icon={Plus} onClick={() => setModal({ kind: 'add' })}>Add Warehouse</Button>}
          />
        )}
        {!loading && !error && filtered.length > 0 && (
          <div className="wh-grid">
            {filtered.map((w) => (
              <article key={w.id} className="card wh-card">
                <div className="wh-card-head">
                  <div>
                    <h3 className="wh-name">
                      {w.name}
                      {w.is_demo && <span className="demo-tag" title="Inserted by the demo-data seeder">Demo</span>}
                    </h3>
                    <p className="wh-meta">
                      {w.warehouse_id} · <MapPin size={11} style={{ verticalAlign: '-1px' }} /> {w.location}
                    </p>
                  </div>
                  <StatusBadge status={w.batch_count > 0 ? 'IN_STOCK' : 'DEPLETED'} label={w.batch_count > 0 ? 'Holding stock' : 'Empty'} />
                </div>
                <div className="wh-stats">
                  <div>
                    <div className="wh-stat-value">{formatNumber(w.batch_count, 0)}</div>
                    <div className="wh-stat-label">Batches</div>
                  </div>
                  <div>
                    <div className="wh-stat-value">{formatNumber(w.material_count, 0)}</div>
                    <div className="wh-stat-label">Materials</div>
                  </div>
                  <div>
                    <div className="wh-stat-value">{Object.values(w.by_unit).filter((q) => q > 0).length || 0}</div>
                    <div className="wh-stat-label">Units held</div>
                  </div>
                </div>
                <p className="wh-qty">
                  Inventory quantity: <strong>{formatUnitTotals(w.by_unit)}</strong>
                </p>
                <div className="wh-card-actions">
                  <Link className="link-more" style={{ marginTop: 0 }} to={`/inventory?warehouse=${w.id}`}>
                    View inventory <ArrowRight size={14} />
                  </Link>
                  <div className="row-actions">
                    <Button size="sm" icon={Eye} onClick={() => setModal({ kind: 'details', warehouse: w })} aria-label={`Details for ${w.name}`}>Details</Button>
                    <Button size="sm" icon={Pencil} onClick={() => setModal({ kind: 'edit', warehouse: w })} aria-label={`Edit ${w.name}`}>Edit</Button>
                    <Button size="sm" variant="danger" icon={Trash2} onClick={() => setModal({ kind: 'delete', warehouse: w })} aria-label={`Delete ${w.name}`}>Delete</Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </Section>

      {modal?.kind === 'add' && (
        <WarehouseFormModal
          warehouses={ref.warehouses}
          onClose={closeModal}
          onSaved={(w) => done(`Warehouse “${w.name}” was added. It is now available in Stock Movements and Demand Forecast.`)}
        />
      )}
      {modal?.kind === 'edit' && (
        <WarehouseFormModal warehouse={modal.warehouse} warehouses={ref.warehouses} onClose={closeModal} onSaved={(w) => done(`Warehouse “${w.name}” was updated.`)} />
      )}
      {modal?.kind === 'details' && <WarehouseDetailsModal warehouse={modal.warehouse} onClose={closeModal} onEdit={() => setModal({ kind: 'edit', warehouse: modal.warehouse })} />}
      {modal?.kind === 'delete' && (
        <ConfirmModal
          title="Delete warehouse"
          message={`Delete “${modal.warehouse.name}” (${modal.warehouse.warehouse_id})? This cannot be undone. Warehouses that have inventory batches or stock movements cannot be deleted.`}
          onClose={closeModal}
          onConfirm={async () => {
            await api.deleteWarehouse(modal.warehouse.id);
            done(`Warehouse “${modal.warehouse.name}” was deleted.`);
          }}
        />
      )}
    </AppShell>
  );
}

function WarehouseDetailsModal({ warehouse, onClose, onEdit }) {
  const detail = useApi(() => api.getWarehouse(warehouse.id), [warehouse.id]);
  const d = detail.data;
  return (
    <Modal title="Warehouse details" onClose={onClose}>
      {detail.status === 'loading' && <LoadingState label="Loading details…" />}
      {detail.status === 'error' && <Notice tone="error">{detail.error.message}</Notice>}
      {d && (
        <DetailList
          items={[
            { label: 'Warehouse ID', value: d.warehouse_id },
            { label: 'Name', value: d.name },
            { label: 'Location', value: d.location },
            { label: 'Created', value: formatDateTime(d.created_at) },
            { label: 'Inventory batches', value: d.usage.batch_count },
            { label: 'Stock movements', value: d.usage.movement_count },
            { label: 'Record type', value: d.is_demo ? 'Demo data' : 'User-created' },
          ]}
        />
      )}
      <div className="form-actions">
        <Link className="btn" to={`/inventory?warehouse=${warehouse.id}`}>View inventory</Link>
        <Link className="btn" to={`/stock-movements?warehouse=${warehouse.id}`}>View movements</Link>
        <Button onClick={onEdit}>Edit</Button>
        <Button variant="primary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

// Add (no `warehouse` prop) or edit. The warehouse ID is fixed after creation because the forecasting model keys on it.
function WarehouseFormModal({ warehouse, warehouses, onClose, onSaved }) {
  const editing = Boolean(warehouse);
  const [form, setForm] = useState({
    warehouse_id: warehouse?.warehouse_id || '',
    name: warehouse?.name || '',
    location: warehouse?.location || '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function validate(p) {
    const e = {};
    if (!p.warehouse_id) e.warehouse_id = 'Enter a warehouse ID.';
    else if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(p.warehouse_id)) e.warehouse_id = 'Use letters, numbers, hyphens or underscores only.';
    else if (!editing && warehouses.some((w) => w.warehouse_id.toLowerCase() === p.warehouse_id.toLowerCase()))
      e.warehouse_id = `ID “${p.warehouse_id}” is already in use.`;
    if (!p.name) e.name = 'Enter a name.';
    if (!p.location) e.location = 'Enter a location.';
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
        const { warehouse_id, ...changes } = payload;
        await api.updateWarehouse(warehouse.id, changes);
      } else {
        await api.createWarehouse(payload);
      }
      onSaved(payload);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      else setFormError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <Modal title={editing ? 'Edit Warehouse' : 'Add Warehouse'} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {formError && <Notice tone="error">{formError}</Notice>}
        <div className="form-grid">
          <Field label="Warehouse ID" error={errors.warehouse_id} hint={editing ? '(cannot be changed)' : undefined}>
            <input value={form.warehouse_id} onChange={set('warehouse_id')} placeholder="e.g. WH004" autoFocus={!editing} readOnly={editing} />
          </Field>
          <Field label="Name" error={errors.name}>
            <input value={form.name} onChange={set('name')} placeholder="e.g. North Depot" autoFocus={editing} />
          </Field>
          <Field label="Location" error={errors.location} span2>
            <input value={form.location} onChange={set('location')} placeholder="e.g. Zone D, Dock 2" />
          </Field>
        </div>
        <div className="form-actions">
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={submitting}>{submitting ? 'Saving…' : editing ? 'Save changes' : 'Add Warehouse'}</Button>
        </div>
      </form>
    </Modal>
  );
}
