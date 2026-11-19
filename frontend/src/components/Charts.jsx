import { formatNumber } from '../lib/format';

// Vertical columns for a short ordered series (e.g. a daily outlook).
// data: [{ label, value }]; `highlight` marks one label as the selected one.
export function ColumnChart({ data, highlight, unit }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div role="img" aria-label="Column chart">
      <div className="col-chart">
        {data.map((d) => (
          <div className="col-chart-item" key={d.label}>
            <span className="col-chart-value">{formatNumber(d.value, 1)}</span>
            <div className={`col-chart-bar ${d.label === highlight ? 'is-selected' : ''}`} style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }} title={`${d.label}: ${formatNumber(d.value)} ${unit || ''}`} />
          </div>
        ))}
      </div>
      <div className="col-chart-labels">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

// Horizontal bars. Only use for values that share one unit.
export function BarChart({ data, valueKey, labelKey, unit }) {
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  return (
    <div className="bar-chart">
      {data.map((d) => (
        <div className="bar-row" key={d[labelKey]}>
          <span className="bar-label" title={d[labelKey]}>{d[labelKey]}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max((d[valueKey] / max) * 100, 2)}%` }} />
          </div>
          <span className="bar-value">
            {formatNumber(d[valueKey])}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
