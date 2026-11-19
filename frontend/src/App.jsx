import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import RawMaterials from './pages/RawMaterials';
import Warehouses from './pages/Warehouses';
import Batches from './pages/Batches';
import StockMovements from './pages/StockMovements';
import DemandForecast from './pages/DemandForecast';
import StockoutRisk from './pages/StockoutRisk';
import ReorderRecommendations from './pages/ReorderRecommendations';
import Reports from './pages/Reports';
import Alerts from './pages/Alerts';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/raw-materials" element={<RawMaterials />} />
        <Route path="/warehouses" element={<Warehouses />} />
        <Route path="/batches-expiry" element={<Batches />} />
        {/* /batches is accepted as an alias of the sidebar route */}
        <Route path="/batches" element={<Navigate to="/batches-expiry" replace />} />
        <Route path="/stock-movements" element={<StockMovements />} />
        <Route path="/demand-forecast" element={<DemandForecast />} />
        <Route path="/stockout-risk" element={<StockoutRisk />} />
        <Route path="/reorder-recommendations" element={<ReorderRecommendations />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
