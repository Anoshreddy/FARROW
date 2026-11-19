import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

// Inline banner for success feedback, warnings and form errors.
export default function Notice({ tone = 'info', children, onDismiss }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' || tone === 'warning' ? TriangleAlert : Info;
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 2 }} />
      <div className="notice-body">{children}</div>
      {onDismiss && (
        <button className="icon-btn" onClick={onDismiss} aria-label="Dismiss" style={{ width: 22, height: 22 }}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
