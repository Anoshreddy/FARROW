export default function KpiCard({ label, value, unit, hint, tone = 'default', icon: Icon }) {
  return (
    <div className={`card kpi kpi--${tone}`}>
      <div className="kpi-head">
        <span>{label}</span>
        {Icon && <Icon size={16} strokeWidth={1.9} />}
      </div>
      <div className="kpi-value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}
