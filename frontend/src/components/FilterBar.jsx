import { Search, X } from 'lucide-react';
import Button from './Button';

export function FilterBar({ children, onReset, canReset }) {
  return (
    <div className="filter-bar">
      {children}
      {onReset && (
        <Button variant="ghost" size="sm" icon={X} onClick={onReset} disabled={!canReset}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…' }) {
  return (
    <label className="search-input">
      <Search size={14} />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
    </label>
  );
}

// options: [{ value, label }]
export function SelectFilter({ label, value, onChange, options, allLabel = 'All' }) {
  return (
    <label className="select-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DateFilter({ label, value, onChange, min, max }) {
  return (
    <label className="select-filter">
      <span>{label}</span>
      <input type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 140 }} />
    </label>
  );
}
