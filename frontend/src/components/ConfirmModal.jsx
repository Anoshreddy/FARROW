import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Notice from './Notice';

// Confirmation dialog for destructive actions. `onConfirm` is async; a rejected promise
// (e.g. the backend refusing to delete a referenced record) is shown inside the dialog.
export default function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await onConfirm();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose} width={460}>
      {error && <Notice tone="error">{error}</Notice>}
      <p style={{ margin: '0 0 18px', lineHeight: 1.5 }}>{message}</p>
      <div className="form-actions">
        <Button onClick={onClose} disabled={busy}>{error ? 'Close' : 'Cancel'}</Button>
        {!error && (
          <Button variant="danger" onClick={confirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</Button>
        )}
      </div>
    </Modal>
  );
}
