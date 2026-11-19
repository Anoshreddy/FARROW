import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState, ErrorState, TableSkeleton } from './AsyncState';

// The one table used across FARROW.
// columns: [{ key, header, render?(row), sortValue?(row), align? }]  (sortValue makes a column click-sortable)
// rowTone(row) -> 'critical' | 'warning' | null adds a left edge marker.
// loading / error / empty states are built in so every page shows them the same way.
export default function DataTable({
  columns,
  rows,
  rowKey,
  rowTone,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No records found',
  emptyMessage = 'No records match the current filters.',
  emptyIcon,
  emptyAction,
  emptyTone,
  pageSize = 15,
  initialSort,
}) {
  const [sort, setSort] = useState(initialSort || null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.sortValue(a);
      const vb = col.sortValue(b);
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page > pageCount - 1) setPage(0);
  }, [pageCount, page]);

  if (loading) return <TableSkeleton cols={columns.length} />;
  if (error) return <ErrorState message={error.message || String(error)} onRetry={onRetry} />;
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} message={emptyMessage} icon={emptyIcon} tone={emptyTone} action={emptyAction} />;
  }

  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize);

  function toggleSort(col) {
    if (!col.sortValue) return;
    setSort((s) =>
      s && s.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }
    );
  }

  return (
    <div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={[c.align === 'right' && 'is-right', c.sortValue && 'is-sortable'].filter(Boolean).join(' ')}
                  onClick={() => toggleSort(c)}
                  aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  <span className="th-inner">
                    {c.header}
                    {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const tone = rowTone ? rowTone(row) : null;
              return (
                <tr key={rowKey(row)} className={tone ? `row--${tone}` : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === 'right' ? 'is-right' : ''}>
                      {c.render ? c.render(row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <span className="text-secondary">
          {sorted.length} {sorted.length === 1 ? 'record' : 'records'}
        </span>
        {pageCount > 1 && (
          <div className="pager">
            <button className="btn btn--sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            <span className="text-secondary">
              Page {page + 1} of {pageCount}
            </span>
            <button className="btn btn--sm" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
