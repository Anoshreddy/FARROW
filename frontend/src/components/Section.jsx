// Card with a title row; keeps page layouts consistent.
export default function Section({ title, subtitle, actions, children, style, className = '' }) {
  return (
    <section className={`card section ${className}`} style={style}>
      {(title || actions) && (
        <div className="section-head">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="section-sub">{subtitle}</p>}
          </div>
          {actions && <div className="section-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
