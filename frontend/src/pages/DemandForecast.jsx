import { useMemo, useState } from 'react';
import { BrainCircuit, Sparkles } from 'lucide-react';
import AppShell from '../components/AppShell';
import Button from '../components/Button';
import Field from '../components/Field';
import Section from '../components/Section';
import Notice from '../components/Notice';
import MissingRefNotice from '../components/MissingRefNotice';
import { ColumnChart } from '../components/Charts';
import { EmptyState, ErrorState, LoadingState } from '../components/AsyncState';
import { useApi } from '../api/useApi';
import { useRefData } from '../api/useRefData';
import { api } from '../api/client';
import { mapLimit } from '../lib/async';
import { formatDate, formatNumber, todayISO } from '../lib/format';

const OUTLOOK_DAYS = 7;
// Backend reasons that mean "the model has no basis for this forecast" (not a crash).
const UNAVAILABLE_CODES = ['UNSUPPORTED_ENTITY', 'NO_HISTORY', 'INSUFFICIENT_HISTORY'];

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const shortDate = (iso) => formatDate(iso).replace(/,? \d{4}$/, '');

export default function DemandForecast() {
  const ref = useRefData();
  // Coverage is advisory: if it fails to load the form still works and the forecast call reports any problem itself.
  const coverage = useApi(() => api.getForecastCoverage(), []);
  const [material, setMaterial] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [date, setDate] = useState(todayISO());
  const [errors, setErrors] = useState({});
  const [run, setRun] = useState({ status: 'idle', result: null, outlook: [], outlookFailed: 0, error: null });

  const pairInfo = useMemo(() => {
    if (!material || !warehouse || !coverage.data) return null;
    return coverage.data.find((c) => String(c.raw_material_id) === material && String(c.warehouse_id) === warehouse) || null;
  }, [coverage.data, material, warehouse]);
  const pairBlocked = pairInfo && !pairInfo.forecastable;

  async function generate(e) {
    e.preventDefault();
    const errs = {};
    if (!material) errs.material = 'Choose a raw material.';
    if (!warehouse) errs.warehouse = 'Choose a warehouse.';
    if (!date) errs.date = 'Choose a prediction date.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setRun({ status: 'loading', result: null, outlook: [], outlookFailed: 0, error: null });
    try {
      const result = await api.getForecast({ raw_material_id: material, warehouse_id: warehouse, prediction_date: date });
      // Same endpoint, following days: gives a predicted-only outlook around the chosen date.
      let failed = 0;
      const days = Array.from({ length: OUTLOOK_DAYS }, (_, i) => addDays(date, i));
      const outlook = await mapLimit(days, 4, async (d) => {
        if (d === date) return { date: d, value: result.predicted_daily_consumption };
        try {
          const r = await api.getForecast({ raw_material_id: material, warehouse_id: warehouse, prediction_date: d });
          return { date: d, value: r.predicted_daily_consumption };
        } catch {
          failed += 1;
          return null;
        }
      });
      setRun({ status: 'success', result, outlook: outlook.filter(Boolean), outlookFailed: failed, error: null });
    } catch (err) {
      setRun({ status: 'error', result: null, outlook: [], outlookFailed: 0, error: err });
    }
  }

  const { result } = run;
  const history = result?.history;
  const noMaterials = ref.status === 'success' && ref.materials.length === 0;
  const noWarehouses = ref.status === 'success' && ref.warehouses.length === 0;
  const noRefData = noMaterials || noWarehouses;
  const unavailable = run.status === 'error' && UNAVAILABLE_CODES.includes(run.error.code);

  return (
    <AppShell
      title="Demand Forecast"
      description="Use historical consumption patterns to estimate upcoming material demand."
      onRefresh={() => {
        ref.reload();
        coverage.reload();
      }}
    >
      {ref.status === 'loading' && <LoadingState label="Loading raw materials and warehouses…" />}
      {ref.status === 'error' && <ErrorState message={ref.error.message} onRetry={ref.reload} />}

      {ref.status === 'success' && (
        <div className="forecast-layout">
          <Section title="Forecast inputs" subtitle="The model needs a material, a warehouse and the day to predict.">
            {noRefData ? (
              <MissingRefNotice
                needMaterials={noMaterials}
                needWarehouses={noWarehouses}
                onLoaded={() => {
                  ref.reload();
                  coverage.reload();
                }}
              />
            ) : (
              <form className="forecast-form" onSubmit={generate} noValidate>
                <Field label="Raw material" error={errors.material}>
                  <select value={material} onChange={(e) => setMaterial(e.target.value)}>
                    <option value="">Select a material…</option>
                    {ref.materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.raw_material_id})</option>)}
                  </select>
                </Field>
                <Field label="Warehouse" error={errors.warehouse}>
                  <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                    <option value="">Select a warehouse…</option>
                    {ref.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.warehouse_id})</option>)}
                  </select>
                </Field>
                <Field label="Prediction date" error={errors.date}>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                {pairBlocked && (
                  <Notice tone="warning">
                    A forecast is not available for this combination: {pairInfo.reason?.toLowerCase()}. The trained model can only forecast the materials and
                    warehouses it was trained on, using their recorded historical consumption.
                  </Notice>
                )}
                <Button variant="primary" type="submit" icon={Sparkles} disabled={run.status === 'loading' || pairBlocked}>
                  {run.status === 'loading' ? 'Forecasting…' : 'Generate forecast'}
                </Button>
              </form>
            )}
          </Section>

          <div>
            {run.status === 'idle' && (
              <Section>
                <EmptyState icon={BrainCircuit} title="No forecast yet" message="Choose a material, a warehouse and a date, then generate a forecast to see the predicted daily consumption." />
              </Section>
            )}
            {run.status === 'loading' && <Section><LoadingState label="Running the forecast model…" /></Section>}
            {run.status === 'error' && (
              <Section>
                {unavailable ? (
                  <EmptyState icon={BrainCircuit} title="Forecast not available" message={run.error.message} />
                ) : (
                  <ErrorState message={run.error.message} />
                )}
              </Section>
            )}

            {run.status === 'success' && result && (
              <section className="card" style={{ marginBottom: 20 }}>
                <div className="forecast-result-head">
                  <span className="forecast-tag"><BrainCircuit size={16} /> ML Forecast</span>
                  <span>{formatDate(result.prediction_date)}</span>
                </div>
                <div className="forecast-body">
                  {result.warnings?.map((w) => <Notice key={w} tone="warning">{w}</Notice>)}
                  <div className="forecast-figure">
                    {formatNumber(result.predicted_daily_consumption)}
                    <small>{result.unit} per day</small>
                  </div>
                  <p className="forecast-sub">Predicted consumption of {result.raw_material_name} in {result.warehouse_name}.</p>

                  <dl className="forecast-meta">
                    <div><dt>Raw material</dt><dd>{result.raw_material_name}</dd></div>
                    <div><dt>Warehouse</dt><dd>{result.warehouse_name}</dd></div>
                    <div><dt>Prediction date</dt><dd>{formatDate(result.prediction_date)}</dd></div>
                    <div><dt>Unit</dt><dd>{result.unit}</dd></div>
                    {history && <div><dt>Recent average (28 days)</dt><dd>{formatNumber(history.average_last_28_days)} {result.unit}/day</dd></div>}
                    {history && <div><dt>History used</dt><dd>{formatNumber(history.points, 0)} days, to {formatDate(history.end_date)}</dd></div>}
                  </dl>

                  <h3 className="section-title" style={{ fontSize: 'var(--fs-base)', marginBottom: 4 }}>Predicted consumption, next {OUTLOOK_DAYS} days</h3>
                  <p className="section-sub" style={{ marginBottom: 12 }}>Each column is a separate prediction from the same model; the highlighted column is your chosen date.</p>
                  {run.outlookFailed > 0 && <Notice tone="warning">The model could not produce {run.outlookFailed} of the {OUTLOOK_DAYS} outlook days.</Notice>}
                  {run.outlook.length > 1 ? (
                    <ColumnChart
                      data={run.outlook.map((o) => ({ label: shortDate(o.date), value: o.value }))}
                      highlight={shortDate(result.prediction_date)}
                      unit={result.unit}
                    />
                  ) : (
                    <p className="text-secondary">No additional days could be forecast.</p>
                  )}

                  {history?.recent?.length > 0 && (
                    <>
                      <h3 className="section-title" style={{ fontSize: 'var(--fs-base)', margin: '20px 0 4px' }}>Actual consumption, last {history.recent.length} days of history</h3>
                      <p className="section-sub" style={{ marginBottom: 12 }}>
                        Recorded consumption from the model’s historical dataset, ending {formatDate(history.end_date)}. These are the days the model’s lag features were built from.
                      </p>
                      <ColumnChart
                        data={history.recent.map((h) => ({ label: shortDate(h.date), value: h.consumed_quantity }))}
                        unit={result.unit}
                      />
                    </>
                  )}

                  <p className="disclaimer">
                    This is an estimate from the trained Gradient Boosting model, based on past consumption patterns. It does not guarantee future demand.
                    Historical figures come from the model’s dataset, not from movements recorded in this application.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
