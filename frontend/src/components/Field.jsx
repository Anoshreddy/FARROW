// Label + control + hint/error, used by every form. Pass the input/select/textarea as children.
export default function Field({ label, hint, error, span2, children }) {
  return (
    <label className={`field ${error ? 'field--invalid' : ''} ${span2 ? 'span-2' : ''}`}>
      <span>
        {label} {hint && <span className="field-hint">{hint}</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}
