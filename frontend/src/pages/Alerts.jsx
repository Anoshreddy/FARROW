import { useMemo, useState } from 'react';
import { BellRing, CircleCheck, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import AppShell from '../components/AppShell';
import KpiCard from '../components/KpiCard';
import Section from '../components/Section';
import DataTable from '../components/DataTable';
import { SeverityBadge } from '../components/StatusBadge';
import { FilterBar, SearchInput, SelectFilter } from '../components/FilterBar';
import { useApi } from '../api/useApi';
import { useRefData } from '../api/useRefData';
import { api } from '../api/client';
import { SEVERITY_ORDER, SEVERITY_OPTIONS, TYPE_LABELS, enrichAlerts } from '../lib/alerts';
import { formatDate, includesText, todayISO } from '../lib/format';

export default function Alerts() {
  const ref = useRefData();
  const asOf = todayISO();
  const alerts = useApi(() => api.getAlerts({ prediction_date: asOf }), []);
  const [severity, setSeverity] = useState('');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');

  const rows = useMemo(
    () => (alerts.data ? enrichAlerts(alerts.data, ref.materials, ref.warehouses) : []),
    [alerts.data, ref.materials, ref.warehouses]
  );
  const filtered = rows.filter(
    (r) =>
      (!severity || r.severity === severity) &&
      (!type || r.type === type) &&
      (includesText(r.message, search) || includesText(r.material, search) || includesText(r.warehouse, search))
  );
  const count = (s) => rows.filter((r) => r.severity === s).length;
  const typeOptions = [...new Set(rows.map((r) => r.type))].map((t) => ({ value: t, label: TYPE_LABELS[t] || t }));

  const loading = alerts.status === 'loading' || ref.status === 'loading';
  const error = alerts.error || ref.error;
  const hasFilters = severity || type || search;
  const reload = () => {
    alerts.reload();
    ref.reload();
  };

  const columns = [
    { key: 'severity', header: 'Severity', sortValue: (r) => SEVERITY_ORDER[r.severity] ?? 9, render: (r) => <SeverityBadge severity={r.severity} /> },
    { key: 'type', header: 'Alert Type', sortValue: (r) => r.type, render: (r) => TYPE_LABELS[r.type] || r.type },
    { key: 'material', header: 'Material', sortValue: (r) => r.material, render: (r) => r.material || <span className="muted">—</span> },
    { key: 'warehouse', header: 'Warehouse', sortValue: (r) => r.warehouse, render: (r) => r.warehouse || <span className="muted">—</span> },
    { key: 'message', header: 'Description', render: (r) => <div className="cell-wrap">{r.message}</div> },
    { key: 'asof', header: 'Status', render: () => <span className="muted">Active · {formatDate(asOf)}</span> },
  ];

  return (
    <AppShell
      title="Alerts"
      description="Everything that needs attention right now: expiry, stockout risk and reorders."
      onRefresh={reload}
    >
      {!loading && !error && (
        <div className="kpi-row kpi-row--4">
          <KpiCard label="Critical" value={count('HIGH')} tone={count('HIGH') > 0 ? 'critical' : 'default'} icon={OctagonAlert} />
          <KpiCard label="Warning" value={count('MEDIUM')} tone={count('MEDIUM') > 0 ? 'warning' : 'default'} icon={TriangleAlert} />
          <KpiCard label="Information" value={count('INFO')} icon={Info} />
          <KpiCard label="Total alerts" value={rows.length} icon={BellRing} />
        </div>
      )}

      <Section title="Active alerts" subtitle="Generated on request from current batches and stockout-risk results. The alerts API gives a message only, so material and warehouse are read from that text.">
        {!loading && !error && rows.length > 0 && (
          <FilterBar
            canReset={Boolean(hasFilters)}
            onReset={() => {
              setSeverity('');
              setType('');
              setSearch('');
            }}
          >
            <SearchInput value={search} onChange={setSearch} placeholder="Search alerts…" />
            <SelectFilter label="Severity" value={severity} onChange={setSeverity} options={SEVERITY_OPTIONS} allLabel="All severities" />
            <SelectFilter label="Alert type" value={type} onChange={setType} options={typeOptions} allLabel="All types" />
          </FilterBar>
        )}
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.id}
          loading={loading}
          error={error}
          onRetry={reload}
          initialSort={{ key: 'severity', dir: 'asc' }}
          rowTone={(r) => (r.severity === 'HIGH' ? 'critical' : r.severity === 'MEDIUM' ? 'warning' : null)}
          pageSize={15}
          emptyIcon={rows.length === 0 ? CircleCheck : undefined}
          emptyTone={rows.length === 0 ? 'ok' : undefined}
          emptyTitle={rows.length === 0 ? 'No active alerts' : 'No matching alerts'}
          emptyMessage={rows.length === 0 ? 'Everything currently looks clear.' : 'Try changing or clearing the filters.'}
        />
      </Section>
    </AppShell>
  );
}
