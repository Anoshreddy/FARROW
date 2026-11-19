"""Browser end-to-end test (Playwright/Chromium) against the REAL frontend + backend + database.

    python e2e_workflow.py empty      # brand-new empty DB: the workflow from the bug report
    python e2e_workflow.py demo       # empty DB -> "Load demo data" -> forecast
    python e2e_workflow.py existing   # a copy of the existing DB: edit / delete / transfer / forecast

Start the backend on a SCRATCH database first (FARROW_DB_PATH=...) and `npm run dev` for the frontend.
"""
import json, os, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

FRONT, API = 'http://127.0.0.1:5173', 'http://127.0.0.1:5000'
SHOTS = os.environ.get('E2E_SHOTS', './e2e_shots'); os.makedirs(SHOTS, exist_ok=True)
results = []


def api(path):
    with urllib.request.urlopen(API + path) as r:
        return json.loads(r.read())


def step(name):
    def deco(fn):
        try:
            fn(); results.append((name, True)); print(f'[PASS] {name}')
        except Exception as e:
            results.append((name, False)); print(f'[FAIL] {name}\n        {type(e).__name__}: {str(e)[:400]}')
    return deco


def run(scenario):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1360, 'height': 900})
        page.set_default_timeout(8000)
        console_errors = []
        page.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: console_errors.append(str(e)))
        shot = lambda n: page.screenshot(path=f'{SHOTS}/{scenario}_{n}.png')
        dialog = lambda: page.get_by_role('dialog')

        def ctl(scope, label):
            return scope.locator(f'xpath=.//label[contains(@class,"field")][normalize-space(span[1]/text()[1])="{label}"]//*[self::select or self::input or self::textarea]')

        def options(label_text, scope=None):
            scope = scope or page
            return scope.get_by_label(label_text, exact=False).first.locator('option').all_text_contents()

        def goto(path):
            page.goto(FRONT + path); page.wait_for_load_state('networkidle')

        def add_material(rid, name, unit, cat):
            goto('/raw-materials'); page.get_by_role('button', name='Add Raw Material').first.click()
            d = dialog(); d.get_by_label('Material ID').fill(rid); d.get_by_label('Name').fill(name)
            d.get_by_label('Unit').fill(unit); d.get_by_label('Category').fill(cat)
            d.get_by_role('button', name='Add Raw Material').click()

        def add_warehouse(wid, name, loc):
            goto('/warehouses'); page.get_by_role('button', name='Add Warehouse').first.click()
            d = dialog(); d.get_by_label('Warehouse ID').fill(wid); d.get_by_label('Name').fill(name)
            d.get_by_label('Location').fill(loc); d.get_by_role('button', name='Add Warehouse').click()

        def open_record():
            goto('/stock-movements'); page.get_by_role('button', name='Record Movement').first.click()
            expect(dialog()).to_be_visible()

        def record(mtype, mat, wh, qty, batch=None, batch_number=None, note=None, dest=None, expect_ok=True):
            open_record(); d = dialog()
            ctl(d, 'Movement type').select_option(label=mtype)
            ctl(d, 'Raw material').select_option(label=mat)
            ctl(d, 'From warehouse' if mtype == 'Transfer' else 'Warehouse').select_option(label=wh)
            if dest: ctl(d, 'To warehouse').select_option(label=dest)
            if batch:
                bl = 'Batch to transfer' if mtype == 'Transfer' else 'Batch to draw from'
                ctl(d, bl).select_option(index=batch) if isinstance(batch, int) else ctl(d, bl).select_option(label=batch)
            if batch_number: ctl(d, 'Batch number').fill(batch_number)
            ctl(d, 'Quantity').fill(str(qty))
            if note: ctl(d, 'Note').fill(note)
            d.get_by_role('button', name='Record Movement').click()

        # ------------------------------------------------------------------ scenario: empty
        if scenario == 'empty':
            @step('Empty DB: Raw Materials page explains there is nothing yet and offers actions')
            def _():
                goto('/raw-materials')
                expect(page.get_by_text('No raw materials yet')).to_be_visible()
                expect(page.get_by_role('button', name='Load demo data')).to_be_visible(); shot('01_rawmaterials_empty')

            @step('Empty DB: Warehouses page shows empty state and an Add Warehouse button')
            def _():
                goto('/warehouses')
                expect(page.get_by_text('No warehouses yet')).to_be_visible()
                expect(page.get_by_role('button', name='Add Warehouse').first).to_be_visible()

            @step('Empty DB: Record Movement shows guidance with links, not blank dropdowns')
            def _():
                open_record(); d = dialog()
                expect(d.get_by_text('No raw material and warehouse found')).to_be_visible()
                expect(d.get_by_role('link', name='Add a raw material')).to_be_visible()
                expect(d.get_by_role('link', name='Add a warehouse')).to_be_visible(); shot('02_record_movement_empty')

            @step('Empty DB: Demand Forecast shows guidance with links')
            def _():
                goto('/demand-forecast')
                expect(page.get_by_text('No raw material and warehouse found')).to_be_visible(); shot('03_forecast_empty')

            @step('Add a raw material through the UI -> success notice + appears in list')
            def _():
                add_material('E2E-RM1', 'E2E Sunflower Oil', 'L', 'Oils')
                expect(page.get_by_text('was added')).to_be_visible()
                expect(page.get_by_role('cell', name='E2E Sunflower Oil').first).to_be_visible(); shot('04_material_added')
                assert any(m['name'] == 'E2E Sunflower Oil' for m in api('/api/raw-materials/'))

            @step('Add a warehouse through the UI -> success notice + appears in list')
            def _():
                add_warehouse('E2E-WH1', 'E2E North Depot', 'Zone N')
                expect(page.get_by_text('was added')).to_be_visible()
                expect(page.get_by_role('heading', name='E2E North Depot')).to_be_visible(); shot('05_warehouse_added')

            @step('Record Movement dropdowns now list the new material and warehouse (exactly 1 option each + placeholder)')
            def _():
                open_record(); d = dialog()
                mats = options('Raw material', d); whs = options('Warehouse', d)
                print('        material options:', mats, '| warehouse options:', whs)
                assert mats == ['Select a material…', 'E2E Sunflower Oil (E2E-RM1) · L'], mats
                assert whs == ['Select a warehouse…', 'E2E North Depot (E2E-WH1)'], whs; shot('06_record_dropdowns')

            @step('Validation: empty submit shows required-field errors, nothing is saved')
            def _():
                open_record(); d = dialog(); d.get_by_role('button', name='Record Movement').click()
                expect(d.get_by_text('Select a raw material.')).to_be_visible()
                expect(d.get_by_text('Select a warehouse.')).to_be_visible()
                expect(d.get_by_text('Enter a quantity greater than zero.')).to_be_visible()
                assert api('/api/stock-movements/') == []

            @step('Validation: quantity 0 and negative rejected')
            def _():
                d = dialog(); ctl(d, 'Quantity').fill('-5'); d.get_by_role('button', name='Record Movement').click()
                expect(d.get_by_text('Enter a quantity greater than zero.')).to_be_visible()

            @step('RECEIVE 100 L via UI -> success, appears in movement list, inventory = 100')
            def _():
                record('Receive', 'E2E Sunflower Oil (E2E-RM1) · L', 'E2E North Depot (E2E-WH1)', 100, batch_number='E2E-B1', note='first receipt')
                expect(page.get_by_text('Receive of 100 L recorded for E2E Sunflower Oil')).to_be_visible()
                expect(page.get_by_role('cell', name='E2E Sunflower Oil').first).to_be_visible(); shot('07_received')
                b = api('/api/inventory-batches/'); assert len(b) == 1 and b[0]['quantity'] == 100 and b[0]['batch_number'] == 'E2E-B1', b
                assert api('/api/stock-movements/')[0]['movement_type'] == 'RECEIVE'

            @step('CONSUME 30 L from the batch -> success, inventory = 70')
            def _():
                record('Consume', 'E2E Sunflower Oil (E2E-RM1) · L', 'E2E North Depot (E2E-WH1)', 30, batch=1)
                expect(page.get_by_text('Consume of 30 L recorded')).to_be_visible()
                assert api('/api/inventory-batches/')[0]['quantity'] == 70

            @step('CONSUME 100 L (> 70 on hand) blocked by the form, no movement created')
            def _():
                n = len(api('/api/stock-movements/'))
                open_record(); d = dialog()
                ctl(d, 'Movement type').select_option(label='Consume')
                ctl(d, 'Raw material').select_option(index=1); ctl(d, 'Warehouse').select_option(index=1)
                ctl(d, 'Batch to draw from').select_option(index=1)
                ctl(d, 'Quantity').fill('100'); d.get_by_role('button', name='Record Movement').click()
                expect(d.get_by_text('Only 70 L is available in this batch.')).to_be_visible(); shot('08_consume_too_much')
                assert len(api('/api/stock-movements/')) == n

            @step('Backend rejection is shown as an error and NEVER as a success message (stale form, stock changed meanwhile)')
            def _():
                open_record(); d = dialog()          # form loads batches while 70 L is on hand
                ctl(d, 'Movement type').select_option(label='Consume')
                ctl(d, 'Raw material').select_option(index=1); ctl(d, 'Warehouse').select_option(index=1)
                ctl(d, 'Batch to draw from').select_option(index=1); ctl(d, 'Quantity').fill('50')
                # someone else consumes 60 L through the API while the form is open -> only 10 L left
                req = urllib.request.Request(API + '/api/stock-movements/', method='POST', headers={'Content-Type': 'application/json'},
                    data=json.dumps({'movement_type': 'CONSUME', 'raw_material_id': 1, 'warehouse_id': 1, 'batch_id': 1, 'quantity': 60}).encode())
                urllib.request.urlopen(req)
                d.get_by_role('button', name='Record Movement').click()
                expect(d.get_by_text('Insufficient stock: only 10 L available in batch E2E-B1')).to_be_visible(); shot('09_backend_rejection')
                assert page.get_by_text('Consume of 50 L recorded').count() == 0, 'success message shown for a failed operation'
                assert api('/api/inventory-batches/')[0]['quantity'] == 10
                page.keyboard.press('Escape')

            @step('Add a second warehouse and TRANSFER 4 L between warehouses via UI')
            def _():
                add_warehouse('E2E-WH2', 'E2E South Depot', 'Zone S')
                record('Transfer', 'E2E Sunflower Oil (E2E-RM1) · L', 'E2E North Depot (E2E-WH1)', 4, batch=1, dest='E2E South Depot (E2E-WH2)')
                expect(page.get_by_text('Transfer of 4 L recorded for E2E Sunflower Oil from E2E North Depot to E2E South Depot')).to_be_visible(); shot('10_transfer')
                q = {b['warehouse_id']: b['quantity'] for b in api('/api/inventory-batches/')}
                assert q == {1: 6, 2: 4}, q
                types = {m['movement_type'] for m in api('/api/stock-movements/')}
                assert {'TRANSFER_IN', 'TRANSFER_OUT'} <= types

            @step('Raw Materials page quantity matches the database (6 + 4 = 10 L)')
            def _():
                goto('/raw-materials'); expect(page.get_by_role('cell', name='10 L')).to_be_visible()

            @step('Demand Forecast dropdowns list the new material and warehouses')
            def _():
                goto('/demand-forecast')
                mats = options('Raw material'); whs = options('Warehouse')
                print('        material options:', mats, '| warehouse options:', whs)
                assert 'E2E Sunflower Oil (E2E-RM1)' in mats and 'E2E North Depot (E2E-WH1)' in whs and 'E2E South Depot (E2E-WH2)' in whs

            @step('Forecast for a new (untrained) pair: clear explanation, button disabled, no invented number')
            def _():
                page.get_by_label('Raw material').select_option(label='E2E Sunflower Oil (E2E-RM1)')
                page.get_by_label('Warehouse').select_option(label='E2E North Depot (E2E-WH1)')
                expect(page.get_by_text('A forecast is not available for this combination')).to_be_visible()
                expect(page.get_by_role('button', name='Generate forecast')).to_be_disabled(); shot('11_forecast_unavailable')

        # ------------------------------------------------------------------ scenario: demo
        if scenario == 'demo':
            @step('Load demo data from the empty Raw Materials page')
            def _():
                goto('/raw-materials'); page.get_by_role('button', name='Load demo data').click()
                expect(page.get_by_role('cell', name='Flour').first).to_be_visible(timeout=8000)
                assert page.get_by_text('Demo', exact=True).count() >= 10; shot('01_demo_loaded')
            @step('Clicking Load demo data again is harmless (no duplicates)')
            def _():
                before = api('/api/health')['counts']
                import urllib.request as u; u.urlopen(u.Request(API + '/api/admin/seed-demo-data', method='POST')).read()
                assert api('/api/health')['counts'] == before == {'raw_materials': 10, 'warehouses': 3}
            @step('Forecast Flour / Main Warehouse for 2025-06-15 -> prediction + history shown')
            def _():
                goto('/demand-forecast')
                page.get_by_label('Raw material').select_option(label='Flour (RM01)'); page.get_by_label('Warehouse').select_option(label='Main Warehouse (WH001)')
                page.get_by_label('Prediction date').fill('2025-06-15'); page.get_by_role('button', name='Generate forecast').click()
                expect(page.get_by_text('Predicted consumption of Flour in Main Warehouse.')).to_be_visible()
                expect(page.get_by_text('922.86')).to_be_visible()
                expect(page.get_by_text('Actual consumption, last 14 days of history')).to_be_visible(); shot('02_forecast_ok')
            @step('Forecast for today: stale-history warning is displayed')
            def _():
                page.get_by_label('Prediction date').fill('2026-11-14'); page.get_by_role('button', name='Generate forecast').click()
                expect(page.get_by_text('before the prediction date')).to_be_visible(); shot('03_forecast_stale')
            @step('Forecast date with <28 days of history -> "Forecast not available" with explanation')
            def _():
                page.get_by_label('Prediction date').fill('2023-01-10'); page.get_by_role('button', name='Generate forecast').click()
                expect(page.get_by_text('Forecast not available')).to_be_visible()
                expect(page.get_by_text('needs at least 28 days')).to_be_visible(); shot('04_forecast_insufficient')

        # ------------------------------------------------------------------ scenario: existing
        if scenario == 'existing':
            orig = {'m': len(api('/api/raw-materials/')), 'w': len(api('/api/warehouses/')), 'mv': len(api('/api/stock-movements/'))}
            @step('Existing data (10 materials, 3 warehouses, 7 movements) loads in the dropdowns')
            def _():
                open_record(); d = dialog()
                assert len(options('Raw material', d)) == 11 and len(options('Warehouse', d)) == 4, (options('Raw material', d), options('Warehouse', d)); shot('01_existing_dropdowns')
                page.keyboard.press('Escape')
            @step('Add -> Details -> Edit -> Delete a raw material through the UI')
            def _():
                add_material('E2E-TMP', 'E2E Temp Material', 'kg', 'Test'); expect(page.get_by_text('was added')).to_be_visible()
                row = page.get_by_role('row').filter(has_text='E2E Temp Material')
                row.get_by_role('button', name='Details for E2E Temp Material').click(); expect(dialog().get_by_text('User-created')).to_be_visible(); shot('02_material_details')
                dialog().get_by_role('button', name='Edit').click()
                d = dialog(); expect(d.get_by_label('Material ID')).to_have_attribute('readonly', '')
                d.get_by_label('Name').fill('E2E Temp Material Renamed'); d.get_by_role('button', name='Save changes').click()
                expect(page.get_by_text('was updated')).to_be_visible(); expect(page.locator('td strong', has_text='E2E Temp Material Renamed')).to_be_visible()
                page.get_by_role('button', name='Delete E2E Temp Material Renamed').click(); dialog().get_by_role('button', name='Delete').click()
                expect(page.get_by_text('was deleted')).to_be_visible(); expect(page.locator('td strong', has_text='E2E Temp Material Renamed')).to_have_count(0)
                assert not any(m['raw_material_id'] == 'E2E-TMP' for m in api('/api/raw-materials/'))
            @step('Delete of a material with inventory (Flour) is refused with an explanation; nothing deleted')
            def _():
                goto('/raw-materials'); page.get_by_role('button', name='Delete Flour').click(); dialog().get_by_role('button', name='Delete').click()
                expect(dialog().get_by_text('cannot be deleted: it is referenced by')).to_be_visible(); shot('03_delete_refused')
                page.keyboard.press('Escape'); assert len(api('/api/raw-materials/')) == orig['m']
            @step('Search + category filter on Raw Materials')
            def _():
                goto('/raw-materials'); page.get_by_placeholder('Search name, ID or category…').fill('milk')
                expect(page.get_by_role('cell', name='Milk Powder').first).to_be_visible(); expect(page.get_by_role('cell', name='Flour')).to_have_count(0)
                page.get_by_role('button', name='Clear filters').click(); page.locator('.select-filter', has_text='Category').locator('select').select_option('Dairy')
                expect(page.get_by_role('cell', name='Butter').first).to_be_visible(); expect(page.get_by_role('cell', name='Rice')).to_have_count(0)
            @step('Add -> Edit -> Delete a warehouse through the UI; referenced warehouse delete refused')
            def _():
                add_warehouse('E2E-TMPW', 'E2E Temp Warehouse', 'Nowhere'); expect(page.get_by_text('was added')).to_be_visible()
                page.get_by_role('button', name='Edit E2E Temp Warehouse').click(); d = dialog(); d.get_by_label('Location').fill('Elsewhere'); d.get_by_role('button', name='Save changes').click()
                expect(page.get_by_text('was updated')).to_be_visible(); expect(page.get_by_text('Elsewhere')).to_be_visible()
                page.get_by_role('button', name='Details for E2E Temp Warehouse').click(); expect(dialog().get_by_text('Inventory batches')).to_be_visible(); page.keyboard.press('Escape')
                page.get_by_role('button', name='Delete E2E Temp Warehouse').click(); dialog().get_by_role('button', name='Delete').click(); expect(page.get_by_text('was deleted')).to_be_visible()
                page.get_by_role('button', name='Delete Main Warehouse').click(); dialog().get_by_role('button', name='Delete').click()
                expect(dialog().get_by_text('cannot be deleted: it is referenced by')).to_be_visible(); page.keyboard.press('Escape')
                assert len(api('/api/warehouses/')) == orig['w']
            @step('Duplicate ID is rejected in the form')
            def _():
                add_material('rm01', 'Dup', 'kg', 'x'); expect(dialog().get_by_text('is already in use.')).to_be_visible(); page.keyboard.press('Escape')
            @step('Existing flour batch can be consumed from the UI; stock reduced correctly')
            def _():
                b = next(b for b in api('/api/inventory-batches/') if b['batch_number'] == 'FLR-2026-001'); before = b['quantity']
                record('Consume', 'Flour (RM01) · kg', 'Main Warehouse (WH001)', 5, batch=f"FLR-2026-001 — {before:g} kg on hand")
                expect(page.get_by_text('Consume of 5 kg recorded for Flour')).to_be_visible()
                after = next(b for b in api('/api/inventory-batches/') if b['batch_number'] == 'FLR-2026-001')['quantity']; assert after == before - 5, (before, after)
            @step('Existing historical movements are intact (7 original + the new one)')
            def _():
                assert len(api('/api/stock-movements/')) == orig['mv'] + 1

        # ------------------------------------------------------------------ common
        real_errors = [e for e in console_errors if 'favicon' not in e.lower()]
        @step('No unexpected browser console errors')
        def _():
            expected = [e for e in real_errors if not ('status of 4' in e or 'Failed to load resource' in e)]
            assert not expected, expected
        if real_errors: print('        (console 4xx from deliberately rejected requests:', len(real_errors), ')')
        browser.close()

    failed = [n for n, ok in results if not ok]
    print(f'\n[{scenario}] {len(results) - len(failed)}/{len(results)} passed')
    for n in failed: print('  FAILED:', n)
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(run(sys.argv[1] if len(sys.argv) > 1 else 'empty'))
