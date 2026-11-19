import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import PageHeader from './PageHeader';

// Every page renders inside this shell: sidebar + header + page title block.
export default function AppShell({ title, description, actions, onRefresh, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = `${title} · FARROW`;
  }, [title]);
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="app-shell">
      <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      <div className="main-column">
        <Header onMenu={() => setMenuOpen(true)} onRefresh={onRefresh} />
        <main className="page-content">
          <PageHeader title={title} description={description} actions={actions} />
          {children}
        </main>
      </div>
    </div>
  );
}
