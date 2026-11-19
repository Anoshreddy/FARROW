import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';

// The backend exposes stockout risk + reorder logic per (raw material,
// warehouse) pair only — there is no "list all" endpoint. To build a table we
// call the real endpoint once per pair, a few at a time. Nothing is computed
// here: every field shown comes straight from the backend response.
const CONCURRENCY = 6;

export function useRiskMatrix({ materials, warehouses, predictionDate, enabled = true }) {
  const [state, setState] = useState({
    status: 'loading',
    rows: [],
    failures: [],
    done: 0,
    total: 0,
  });
  const runId = useRef(0);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    const pairs = [];
    materials.forEach((m) => warehouses.forEach((w) => pairs.push({ m, w })));

    const id = ++runId.current;
    if (pairs.length === 0) {
      setState({ status: 'success', rows: [], failures: [], done: 0, total: 0 });
      return undefined;
    }
    setState({ status: 'loading', rows: [], failures: [], done: 0, total: pairs.length });

    const rows = [];
    const failures = [];
    let next = 0;
    let done = 0;

    async function worker() {
      while (next < pairs.length) {
        const { m, w } = pairs[next++];
        try {
          const r = await api.getStockoutRisk({
            raw_material_id: m.id,
            warehouse_id: w.id,
            prediction_date: predictionDate,
          });
          rows.push(r);
        } catch (err) {
          failures.push({ material: m.name, warehouse: w.name, message: err.message });
        }
        done += 1;
        if (id === runId.current && (done % 5 === 0 || done === pairs.length)) {
          setState((s) => ({ ...s, done }));
        }
      }
    }

    Promise.all(Array.from({ length: Math.min(CONCURRENCY, pairs.length) }, worker)).then(() => {
      if (id !== runId.current) return;
      rows.sort(
        (a, b) =>
          a.raw_material_name.localeCompare(b.raw_material_name) ||
          a.warehouse_name.localeCompare(b.warehouse_name)
      );
      setState({
        status: failures.length === pairs.length ? 'error' : 'success',
        rows,
        failures,
        done: pairs.length,
        total: pairs.length,
      });
    });

    return () => {
      runId.current += 1;
    };
  }, [materials, warehouses, predictionDate, enabled, tick]);

  return { ...state, reload };
}
