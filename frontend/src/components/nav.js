import {
  LayoutDashboard, Boxes, Wheat, Warehouse, CalendarClock, ArrowLeftRight,
  TrendingUp, ShieldAlert, PackagePlus, FileBarChart, BellRing,
} from 'lucide-react';

// Single source of truth for the sidebar and the header breadcrumb.
export const NAV_GROUPS = [
  { label: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    label: 'Operations',
    items: [
      { to: '/inventory', label: 'Inventory', icon: Boxes },
      { to: '/raw-materials', label: 'Raw Materials', icon: Wheat },
      { to: '/warehouses', label: 'Warehouses', icon: Warehouse },
      { to: '/batches-expiry', label: 'Batches & Expiry', icon: CalendarClock },
      { to: '/stock-movements', label: 'Stock Movements', icon: ArrowLeftRight },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/demand-forecast', label: 'Demand Forecast', icon: TrendingUp },
      { to: '/stockout-risk', label: 'Stockout Risk', icon: ShieldAlert },
      { to: '/reorder-recommendations', label: 'Reorder Recommendations', icon: PackagePlus },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/reports', label: 'Reports', icon: FileBarChart },
      { to: '/alerts', label: 'Alerts', icon: BellRing },
    ],
  },
];
