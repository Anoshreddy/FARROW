import { useState } from 'react';
import { Link } from 'react-router-dom';
import Button from './Button';
import Notice from './Notice';
import { api } from '../api/client';

// Shown wherever a form or forecast needs raw materials and/or warehouses but the database has none.
// Offers the two real ways forward: create records, or load the clearly-marked demo data (explicit click only).
export default function MissingRefNotice({ needMaterials, needWarehouses, onLoaded, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const missing = [needMaterials && 'raw material', needWarehouses && 'warehouse'].filter(Boolean).join(' and ');

  async function loadDemo() {
    setBusy(true);
    setError('');
    try {
      await api.seedDemoData();
      onLoaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="missing-ref">
      <Notice tone="info">
        <strong>No {missing} found in the database.</strong>{' '}
        {compact ? 'Create' : 'This needs at least one raw material and one warehouse. Create'} the missing records, or load the demo data.
      </Notice>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="missing-ref-actions">
        {needMaterials && <Button variant="primary" to="/raw-materials?action=add">Add a raw material</Button>}
        {needWarehouses && <Button variant="primary" to="/warehouses?action=add">Add a warehouse</Button>}
        <Button onClick={loadDemo} disabled={busy}>{busy ? 'Loading…' : 'Load demo data'}</Button>
      </div>
      <p className="muted" style={{ fontSize: 'var(--fs-xs)', margin: '6px 0 0' }}>
        Demo data adds 10 sample raw materials and 3 warehouses, each marked “Demo”. Existing records are never changed.
      </p>
    </div>
  );
}
