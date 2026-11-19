import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state state--inline" role="status">
      <Loader2 size={18} className="spin" />
      <span>{label}</span>
    </div>
  );
}

// Placeholder rows shown in place of a table while data loads.
export function TableSkeleton({ rows = 5, cols = 6 }) {
  return (
    <div className="table-wrap" aria-busy="true" aria-label="Loading">
      <table className="data-table">
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="skeleton-row">
              {Array.from({ length: cols }, (_, c) => (
                <td key={c}>
                  <span className="skeleton" style={{ width: `${55 + ((r + c) % 4) * 12}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <span className="state-icon">
        <AlertTriangle size={20} />
      </span>
      <p className="state-title">Couldn't load this data</p>
      <p className="state-text">{message}</p>
      {onRetry && (
        <button className="btn" onClick={onRetry} style={{ marginTop: 8 }}>
          Try again
        </button>
      )}
    </div>
  );
}

// title + message (+ optional action node). `tone="ok"` is for "nothing to worry about" screens.
export function EmptyState({ title, message = 'Nothing to show yet.', icon: Icon = Inbox, tone, action }) {
  return (
    <div className="state">
      <span className={`state-icon ${tone === 'ok' ? 'state-icon--ok' : ''}`}>
        <Icon size={20} />
      </span>
      {title && <p className="state-title">{title}</p>}
      <p className="state-text">{message}</p>
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
