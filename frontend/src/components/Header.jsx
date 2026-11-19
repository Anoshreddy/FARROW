import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { NAV_GROUPS } from './nav';

function useBackendStatus() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      api
        .health()
        .then(() => !cancelled && setStatus('online'))
        .catch(() => !cancelled && setStatus('offline'));
    check();
    const id = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);
  return status;
}

export default function Header({ onMenu, onRefresh }) {
  const { pathname } = useLocation();
  const status = useBackendStatus();
  const group = NAV_GROUPS.find((g) => g.items.some((i) => i.to === pathname));
  const page = group?.items.find((i) => i.to === pathname);
  const statusText = { online: 'Backend connected', offline: 'Backend unreachable', checking: 'Checking backend…' }[status];

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="icon-btn menu-toggle" onClick={onMenu} aria-label="Open navigation">
          <Menu size={18} />
        </button>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <span>Workspace</span>
          {group && group.label !== 'Overview' && (
            <>
              <span>/</span>
              <span>{group.label}</span>
            </>
          )}
          <span>/</span>
          <strong>{pathname === '/' ? 'Overview' : page?.label ?? 'Overview'}</strong>
        </nav>
      </div>

      <div className="header-right">
        <span className={`api-status api-status--${status}`} title={statusText}>
          <span className="api-status-dot" />
          <span className="api-status-text">{statusText}</span>
        </span>
        {onRefresh && (
          <button className="icon-btn" onClick={onRefresh} aria-label="Refresh data" title="Refresh data">
            <RefreshCw size={16} />
          </button>
        )}
        <span className="avatar" title="Warehouse operator" aria-label="User">
          WO
        </span>
      </div>
    </header>
  );
}
