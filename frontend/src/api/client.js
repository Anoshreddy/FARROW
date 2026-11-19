// Thin wrapper around the FARROW Flask API.
// Every function here maps to one real backend route — no invented endpoints.
const BASE_URL = 'http://127.0.0.1:5000';

class ApiError extends Error {
  // `code` is the backend's machine-readable reason (e.g. INSUFFICIENT_HISTORY); `fields` maps field -> message.
  constructor(message, status, extra = {}) {
    super(message);
    this.status = status;
    this.code = extra.code || null;
    this.fields = extra.fields || null;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (networkErr) {
    throw new ApiError(
      'Could not reach the FARROW backend. Make sure the Flask server is running on http://127.0.0.1:5000.',
      0
    );
  }

  let body = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const message = body?.error || `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, { code: body?.code, fields: body?.fields });
  }

  return body;
}

export const api = {
  // Health
  health: () => request('/api/health'),

  // Raw materials
  getRawMaterials: () => request('/api/raw-materials/'),
  getRawMaterial: (id) => request(`/api/raw-materials/${id}`),
  createRawMaterial: (payload) =>
    request('/api/raw-materials/', { method: 'POST', body: JSON.stringify(payload) }),
  updateRawMaterial: (id, payload) =>
    request(`/api/raw-materials/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteRawMaterial: (id) => request(`/api/raw-materials/${id}`, { method: 'DELETE' }),

  // Warehouses
  getWarehouses: () => request('/api/warehouses/'),
  getWarehouse: (id) => request(`/api/warehouses/${id}`),
  createWarehouse: (payload) =>
    request('/api/warehouses/', { method: 'POST', body: JSON.stringify(payload) }),
  updateWarehouse: (id, payload) =>
    request(`/api/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteWarehouse: (id) => request(`/api/warehouses/${id}`, { method: 'DELETE' }),

  // Demo data (idempotent: only inserts missing demo records)
  seedDemoData: () => request('/api/admin/seed-demo-data', { method: 'POST' }),

  // Inventory batches
  getInventoryBatches: (params = {}) =>
    request(`/api/inventory-batches/${toQuery(params)}`),
  getInventoryBatch: (id) => request(`/api/inventory-batches/${id}`),
  createInventoryBatch: (payload) =>
    request('/api/inventory-batches/', { method: 'POST', body: JSON.stringify(payload) }),

  // Stock movements
  getStockMovements: (params = {}) =>
    request(`/api/stock-movements/${toQuery(params)}`),
  getStockMovement: (id) => request(`/api/stock-movements/${id}`),
  createStockMovement: (payload) =>
    request('/api/stock-movements/', { method: 'POST', body: JSON.stringify(payload) }),

  // Forecast (requires raw_material_id, warehouse_id, prediction_date)
  getForecast: (params) => request(`/api/forecast/${toQuery(params)}`),
  // Which material x warehouse pairs the trained model can actually forecast, and why not.
  getForecastCoverage: () => request('/api/forecast/coverage'),

  // Stockout risk (requires raw_material_id, warehouse_id, prediction_date)
  getStockoutRisk: (params) => request(`/api/stockout-risk/${toQuery(params)}`),

  // Reports
  getInventorySummary: (params = {}) =>
    request(`/api/reports/inventory-summary${toQuery(params)}`),
  getInventoryReport: () => request('/api/reports/inventory'),
  getExpiryReport: () => request('/api/reports/expiry'),
  getConsumptionReport: (params = {}) =>
    request(`/api/reports/consumption${toQuery(params)}`),
  getWastageReport: (params = {}) => request(`/api/reports/wastage${toQuery(params)}`),
  getStockMovementsReport: (params = {}) =>
    request(`/api/reports/stock-movements${toQuery(params)}`),
  getWarehouseSummary: () => request('/api/reports/warehouse-summary'),
  getAlerts: (params = {}) => request(`/api/reports/alerts${toQuery(params)}`),
};

function toQuery(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  const search = new URLSearchParams(entries);
  return `?${search.toString()}`;
}

export { ApiError };
