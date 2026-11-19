// Label/value pairs for "details" dialogs. items: [{ label, value }]
export default function DetailList({ items }) {
  return (
    <dl className="detail-list">
      {items.map((i) => (
        <div key={i.label}>
          <dt>{i.label}</dt>
          <dd>{i.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
