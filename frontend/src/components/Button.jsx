import { Link } from 'react-router-dom';

// variant: 'secondary' (default) | 'primary' | 'danger' | 'ghost'
// Renders a router <Link> when `to` is given so navigation actions stay buttons visually.
export default function Button({ variant = 'secondary', size, icon: Icon, to, children, className = '', ...rest }) {
  const cls = ['btn', variant !== 'secondary' && `btn--${variant}`, size === 'sm' && 'btn--sm', className]
    .filter(Boolean)
    .join(' ');
  const content = (
    <>
      {Icon && <Icon size={14} />}
      {children}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={cls} {...rest}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {content}
    </button>
  );
}
