import { NavLink } from 'react-router-dom';
import { FarrowMark, FarrowWordmark } from './Logo';
import { NAV_GROUPS } from './nav';

export default function Sidebar({ open, onNavigate }) {
  return (
    <>
      <div className={`sidebar-scrim ${open ? 'is-open' : ''}`} onClick={onNavigate} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Primary">
        <div className="sidebar-brand">
          <FarrowMark size={26} color="var(--color-secondary)" />
          <div className="sidebar-brand-text">
            <FarrowWordmark height={13} color="var(--color-secondary)" />
            <span className="sidebar-tagline">Every Material. In Sight.</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="sidebar-group-label">{group.label.toUpperCase()}</div>
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) => 'sidebar-link' + (isActive ? ' is-active' : '')}
                >
                  <Icon size={17} strokeWidth={1.8} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
