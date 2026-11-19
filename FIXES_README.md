# FARROW – raw material / warehouse / forecast fix

## Root cause

The code in the ZIP already fetched materials and warehouses from the API, and the bundled `inventory.db`
contains 10 materials and 3 warehouses, so with *that* database the dropdowns are populated.
The empty dropdowns / "needs at least one raw material and one warehouse" message appear only when the
backend returns `[]` – i.e. the backend you were running used an **empty database**. Nothing in the project
could recover from that state:

1. No automatic or in-app seeding – `seed_data.py` had to be run by hand and was never mentioned in the UI.
2. **No way to create a warehouse in the UI at all** (the Warehouses page had no Add button; the Forecast page
   told you to add one from the Raw Materials page, which can't). Empty DB + no warehouse form = dead end.
3. Empty states gave no actions (no links, no "load demo data").
4. `requirements.txt` was UTF-16 and missing Flask-SQLAlchemy/SQLAlchemy, so a fresh virtualenv can fail to start the backend.

I could not see your screenshots (only the ZIP arrived) and could not reproduce an empty dropdown with the
supplied database, so (1)–(3) are the verified defects that produce exactly that state, not proof of what your machine did.
Also note the "Batch Selection Mode" label you quote does not exist in this source (it says "Batch"), so the UI you
screenshot may be a different/older build than the one in the ZIP.

## Other bugs found and fixed
* Transfers could never work: `batch_number` is globally UNIQUE and the transfer reused the source number → IntegrityError. Destination batches are now `<base>@<warehouse id>`. Transfer is enabled in the UI.
* No PUT/DELETE for materials/warehouses → added, with reference-safe delete (409 + explanation), immutable IDs, unit locked once stock history exists.
* `RECEIVE` with a batch number belonging to another material/warehouse silently added stock to the wrong batch → now 409.
* Non-numeric / NaN quantity caused HTTP 500; consume without a batch bypassed batch stock → now validated.
* `/api/x` (no slash) answered 308; browsers refuse redirects on CORS-preflighted requests → `strict_slashes = False`.
* Forecast: stale history was silent (dataset ends 2025-12-31) → warning; typed errors (`UNSUPPORTED_ENTITY`, `NO_HISTORY`, `INSUFFICIENT_HISTORY`, `INVALID_DATE`); `/api/forecast/coverage`; history + recent actuals returned and shown.
* The ML model, encoder and feature construction were **not changed**; they were verified (27 features, encoder fitted on RM01–RM10 × WH001–WH003).

## Files modified / added
Backend: `app.py`, `models.py`, `seed_data.py`, `requirements.txt`, `routes/raw_materials.py`, `routes/warehouses.py`,
`routes/stock_movements.py`, `routes/forecast.py`, `services/ml_service.py`; new `db_init.py`, `routes/admin.py`,
`utils/validation.py`, `tests/api_workflow_test.py`.
Frontend: `api/client.js`, `pages/RawMaterials.jsx`, `pages/Warehouses.jsx`, `pages/StockMovements.jsx`, `pages/DemandForecast.jsx`,
`styles/components.css`; new `components/ConfirmModal.jsx`, `DetailList.jsx`, `MissingRefNotice.jsx`; new `e2e_workflow.py`.

## Database
* Your `backend/data/inventory.db` is shipped unchanged. On first start the backend backs it up to
  `backend/data/backups/` and adds an `is_demo` column to `raw_materials` and `warehouses` (only change; no data touched).
* Demo data: `python seed_data.py` (or the **Load demo data** button in any empty state, or `POST /api/admin/seed-demo-data`).
  Inserts only missing RM01–RM10 / WH001–WH003, flagged `is_demo`, never updates or duplicates. `python seed_data.py --status` shows counts.
* Optional: `FARROW_AUTO_SEED=1` seeds automatically only when both tables are completely empty. `FARROW_DB_PATH` points the backend at another DB file.

## Run
```
cd backend
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r ../requirements.txt
python app.py                                       # http://127.0.0.1:5000

cd frontend
npm install
npm run dev                                         # http://localhost:5173
```

## Tests (use a scratch DB copy – they create records)
```
FARROW_DB_PATH=/tmp/scratch.db python app.py
python tests/api_workflow_test.py                   # 69 API checks
cd frontend && pip install playwright && playwright install chromium
python e2e_workflow.py empty|demo|existing          # browser tests against the live UI
```

## Known limitations
* **Forecasts only work for the trained materials/warehouses** (RM01–RM10 × WH001–WH003). A newly created material/warehouse has no history and is unknown to the OneHotEncoder, so the UI says so and disables Generate. Supporting new items requires retraining the model on their consumption history.
* The model's history comes from `data/raw_material_demand_dataset.xlsx`, not from movements recorded in the app, and it ends 2025-12-31, so forecasts for today use ~10-month-old lags (now flagged with a warning).
* FEFO is not implemented: consume/wastage/transfer require choosing a batch manually (unchanged).
* Stockout Risk / Reorder pages still treat a failed forecast as 0 demand ("No forecast demand"), so new materials look low-risk there. Not changed.
* The Record Movement form's batch list is not refreshed after a rejected submit (the error message states the true available quantity).
