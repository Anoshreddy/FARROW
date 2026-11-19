"""End-to-end API test against a RUNNING backend (real HTTP, real database - no mocks).

    python tests/api_workflow_test.py [base_url]        # default http://127.0.0.1:5000

WARNING: it creates and edits records. Point the backend at a scratch copy of the database:
    FARROW_DB_PATH=/path/to/copy.db python app.py
Records it creates use the IDs TST-RM / TST-WH, so they are easy to spot.
"""
import json
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:5000').rstrip('/')
results = []


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or 'null')
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw.decode(errors='replace')


def check(name, condition, detail=''):
    results.append((name, bool(condition)))
    print(f"[{'PASS' if condition else 'FAIL'}] {name}" + (f'  -> {detail}' if not condition else ''))


def batch(batch_id):
    return call('GET', f'/api/inventory-batches/{batch_id}')[1]


def run():
    s, h = call('GET', '/api/health')
    check('backend health responds', s == 200 and h['status'] == 'success')
    check('ML model loaded', h.get('ml_model_loaded') is True, h.get('ml_load_error'))

    # ---- list endpoints work with AND without a trailing slash (no 308 redirect)
    for path in ('/api/raw-materials', '/api/raw-materials/', '/api/warehouses', '/api/warehouses/'):
        s, body = call('GET', path)
        check(f'GET {path} -> 200 list', s == 200 and isinstance(body, list), s)

    # ---- raw material CRUD
    s, m = call('POST', '/api/raw-materials/', {'raw_material_id': 'TST-RM', 'name': 'Test Baking Soda', 'unit': 'kg', 'category': 'Baking'})
    check('create raw material', s == 201 and m.get('id'), (s, m))
    rm = m['id']
    s, lst = call('GET', '/api/raw-materials/')
    check('new raw material appears in list', any(x['id'] == rm and x['name'] == 'Test Baking Soda' for x in lst))
    s, d = call('GET', f'/api/raw-materials/{rm}')
    check('raw material detail', s == 200 and d['raw_material_id'] == 'TST-RM' and d['usage']['batch_count'] == 0, d)
    s, e = call('POST', '/api/raw-materials/', {'raw_material_id': 'tst-rm', 'name': 'Dup', 'unit': 'kg', 'category': 'x'})
    check('duplicate material ID (case-insensitive) -> 409', s == 409, (s, e))
    s, e = call('POST', '/api/raw-materials/', {'raw_material_id': 'X1', 'name': '  ', 'unit': 'kg'})
    check('missing/blank fields -> 400 with per-field errors', s == 400 and 'name' in e.get('fields', {}) and 'category' in e['fields'], (s, e))
    s, e = call('POST', '/api/raw-materials/', {'raw_material_id': 'bad id!', 'name': 'x', 'unit': 'kg', 'category': 'c'})
    check('invalid characters in ID -> 400', s == 400, (s, e))
    s, u = call('PUT', f'/api/raw-materials/{rm}', {'name': 'Test Baking Soda v2', 'category': 'Leavening'})
    check('edit raw material', s == 200 and u['name'] == 'Test Baking Soda v2' and u['category'] == 'Leavening', (s, u))
    s, e = call('PUT', f'/api/raw-materials/{rm}', {'raw_material_id': 'OTHER'})
    check('changing material ID is rejected', s == 400, (s, e))
    s, u = call('PUT', f'/api/raw-materials/{rm}', {'unit': 'g'})
    check('unit may change while unreferenced', s == 200 and u['unit'] == 'g', (s, u))
    call('PUT', f'/api/raw-materials/{rm}', {'unit': 'kg'})
    s, lst = call('GET', '/api/raw-materials/?q=leaven')
    check('search ?q= filters materials', s == 200 and [x['id'] for x in lst] == [rm], lst)
    s, lst = call('GET', '/api/raw-materials/?category=Dairy')
    check('?category= filters materials', s == 200 and len(lst) >= 1 and all(x['category'] == 'Dairy' for x in lst))
    s, e = call('GET', '/api/raw-materials/99999')
    check('unknown material -> 404', s == 404)

    # ---- warehouse CRUD
    s, w = call('POST', '/api/warehouses/', {'warehouse_id': 'TST-WH', 'name': 'Test Depot', 'location': 'Dock 9'})
    check('create warehouse', s == 201 and w.get('id'), (s, w))
    wh = w['id']
    s, lst = call('GET', '/api/warehouses/')
    check('new warehouse appears in list', any(x['id'] == wh and x['name'] == 'Test Depot' for x in lst))
    s, e = call('POST', '/api/warehouses/', {'warehouse_id': 'TST-WH', 'name': 'Dup', 'location': 'x'})
    check('duplicate warehouse ID -> 409', s == 409, (s, e))
    s, u = call('PUT', f'/api/warehouses/{wh}', {'name': 'Test Depot v2', 'location': 'Dock 10'})
    check('edit warehouse', s == 200 and u['location'] == 'Dock 10', (s, u))
    s, lst = call('GET', '/api/warehouses/?q=dock%2010')
    check('search ?q= filters warehouses', s == 200 and [x['id'] for x in lst] == [wh], lst)
    s, w2 = call('POST', '/api/warehouses/', {'warehouse_id': 'TST-WH2', 'name': 'Second Depot', 'location': 'Dock 11'})
    wh2 = w2['id']

    # ---- stock movements through the new records
    mv = lambda **kw: call('POST', '/api/stock-movements/', kw)
    s, e = mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=wh, quantity=0)
    check('quantity 0 rejected', s == 400, (s, e))
    s, e = mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=wh, quantity=-5)
    check('negative quantity rejected', s == 400, (s, e))
    s, e = mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=wh, quantity='abc')
    check('non-numeric quantity -> 400 (not a 500)', s == 400, (s, e))
    s, e = mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=wh, quantity='NaN')
    check('NaN quantity rejected', s == 400, (s, e))
    s, e = mv(movement_type='RECEIVE', raw_material_id=99999, warehouse_id=wh, quantity=5)
    check('unknown material -> 404', s == 404, (s, e))
    s, e = mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=99999, quantity=5)
    check('unknown warehouse -> 404', s == 404, (s, e))
    s, e = mv(movement_type='BOGUS', raw_material_id=rm, warehouse_id=wh, quantity=5)
    check('unknown movement type -> 400', s == 400, (s, e))

    s, r = mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=wh, quantity=500, batch_number='TST-B1', notes='test receipt')
    check('RECEIVE creates batch + movement', s == 201 and r.get('batch_id'), (s, r))
    b1 = r['batch_id']
    check('inventory after RECEIVE = 500', batch(b1)['quantity'] == 500)
    s, e = mv(movement_type='RECEIVE', raw_material_id=1, warehouse_id=1, quantity=5, batch_number='TST-B1')
    check('batch number owned by another material/warehouse -> 409', s == 409, (s, e))
    s, r = mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=wh, quantity=50, batch_id=b1)
    check('RECEIVE into existing batch', s == 201 and batch(b1)['quantity'] == 550, batch(b1))
    s, e = mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=wh2, quantity=5, batch_id=b1)
    check('batch from another warehouse rejected', s == 400, (s, e))

    s, mvs = call('GET', f'/api/stock-movements/?raw_material_id={rm}')
    check('movements list shows new material (newest first)', s == 200 and len(mvs) == 2 and mvs[0]['id'] > mvs[1]['id'], mvs)

    s, r = mv(movement_type='CONSUME', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=120)
    check('CONSUME within stock', s == 201 and batch(b1)['quantity'] == 430, (s, r, batch(b1)))
    n_before = len(call('GET', f'/api/stock-movements/?raw_material_id={rm}')[1])
    s, e = mv(movement_type='CONSUME', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=431)
    check('CONSUME beyond stock rejected (no negative stock)', s == 400 and 'Insufficient' in e.get('error', ''), (s, e))
    check('rejected CONSUME leaves stock + history untouched',
          batch(b1)['quantity'] == 430 and len(call('GET', f'/api/stock-movements/?raw_material_id={rm}')[1]) == n_before)
    s, e = mv(movement_type='CONSUME', raw_material_id=rm, warehouse_id=wh, quantity=10)
    check('CONSUME without batch when batches exist -> 400', s == 400 and 'batch' in e.get('error', '').lower(), (s, e))
    s, r = mv(movement_type='CONSUME', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=430)
    check('CONSUME exact remaining stock allowed -> 0', s == 201 and batch(b1)['quantity'] == 0)
    s, e = mv(movement_type='WASTAGE', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=1)
    check('WASTAGE from empty batch rejected', s == 400, (s, e))
    mv(movement_type='RECEIVE', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=300)
    s, r = mv(movement_type='WASTAGE', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=20, notes='spill')
    check('WASTAGE within stock', s == 201 and batch(b1)['quantity'] == 280, batch(b1))

    # ---- transfer
    s, e = mv(movement_type='TRANSFER', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=10, destination_warehouse_id=wh)
    check('TRANSFER to same warehouse rejected', s == 400, (s, e))
    s, e = mv(movement_type='TRANSFER', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=1000, destination_warehouse_id=wh2)
    check('TRANSFER beyond stock rejected', s == 400, (s, e))
    s, r = mv(movement_type='TRANSFER', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=100, destination_warehouse_id=wh2)
    check('TRANSFER between warehouses succeeds', s == 201, (s, r))
    check('source batch reduced by transfer', batch(b1)['quantity'] == 180)
    dest = [b for b in call('GET', f'/api/inventory-batches/?warehouse_id={wh2}')[1] if b['raw_material_id'] == rm]
    check('destination batch created with transferred qty', len(dest) == 1 and dest[0]['quantity'] == 100, dest)
    s, mvs = call('GET', f'/api/stock-movements/?raw_material_id={rm}')
    types = {m['movement_type'] for m in mvs}
    check('TRANSFER_OUT and TRANSFER_IN both recorded', {'TRANSFER_OUT', 'TRANSFER_IN'} <= types, types)
    mv(movement_type='TRANSFER', raw_material_id=rm, warehouse_id=wh, batch_id=b1, quantity=30, destination_warehouse_id=wh2)
    dest = [b for b in call('GET', f'/api/inventory-batches/?warehouse_id={wh2}')[1] if b['raw_material_id'] == rm]
    check('second transfer merges into same destination batch', len(dest) == 1 and dest[0]['quantity'] == 130, dest)

    # ---- unit locked once referenced, delete protection
    s, e = call('PUT', f'/api/raw-materials/{rm}', {'unit': 'g'})
    check('unit locked once material has stock history -> 409', s == 409, (s, e))
    s, e = call('DELETE', f'/api/raw-materials/{rm}')
    check('delete referenced material -> 409 with explanation', s == 409 and 'referenced' in e['error'], (s, e))
    s, e = call('DELETE', f'/api/warehouses/{wh}')
    check('delete referenced warehouse -> 409 with explanation', s == 409 and 'referenced' in e['error'], (s, e))
    s, tmp = call('POST', '/api/raw-materials/', {'raw_material_id': 'TST-DEL', 'name': 'Disposable', 'unit': 'kg', 'category': 'Test'})
    s, d = call('DELETE', f"/api/raw-materials/{tmp['id']}")
    check('delete unreferenced material', s == 200, (s, d))
    check('deleted material is gone (404)', call('GET', f"/api/raw-materials/{tmp['id']}")[0] == 404)
    s, tw = call('POST', '/api/warehouses/', {'warehouse_id': 'TST-DELW', 'name': 'Disposable WH', 'location': 'Nowhere'})
    check('delete unreferenced warehouse', call('DELETE', f"/api/warehouses/{tw['id']}")[0] == 200)

    # ---- forecast
    s, f = call('GET', f'/api/forecast/?raw_material_id=1&warehouse_id=1&prediction_date=2025-06-15')
    check('forecast for trained pair returns a prediction', s == 200 and f['predicted_daily_consumption'] > 0 and f['history']['points'] >= 28, (s, f))
    check('forecast returns history context (recent actuals)', s == 200 and len(f['history']['recent']) == 14 and f['history']['end_date'] == '2025-06-14', f.get('history'))
    s, f = call('GET', '/api/forecast/?raw_material_id=1&warehouse_id=1&prediction_date=2026-11-14')
    check('stale history is flagged, not hidden', s == 200 and f['history']['is_stale'] and f['warnings'], f.get('warnings'))
    s, f = call('GET', f'/api/forecast/?raw_material_id={rm}&warehouse_id={wh}&prediction_date=2026-11-14')
    check('forecast for new material/warehouse -> 422 UNSUPPORTED_ENTITY with explanation (no fake number)',
          s == 422 and f.get('code') == 'UNSUPPORTED_ENTITY' and 'predicted_daily_consumption' not in f, (s, f))
    s, f = call('GET', '/api/forecast/?raw_material_id=1&warehouse_id=1&prediction_date=2023-01-10')
    check('forecast with <28 days history -> 422 INSUFFICIENT_HISTORY', s == 422 and f.get('code') == 'INSUFFICIENT_HISTORY', (s, f))
    s, f = call('GET', '/api/forecast/?raw_material_id=1&warehouse_id=1&prediction_date=2020-01-01')
    check('forecast before any history -> 422 NO_HISTORY', s == 422 and f.get('code') == 'NO_HISTORY', (s, f))
    s, f = call('GET', '/api/forecast/?raw_material_id=1&warehouse_id=1&prediction_date=not-a-date')
    check('invalid date -> 400 INVALID_DATE', s == 400 and f.get('code') == 'INVALID_DATE', (s, f))
    s, f = call('GET', '/api/forecast/?raw_material_id=99999&warehouse_id=1&prediction_date=2026-01-01')
    check('forecast unknown material -> 404', s == 404, (s, f))
    s, f = call('GET', '/api/forecast/?warehouse_id=1&prediction_date=2026-01-01')
    check('forecast missing parameter -> 400', s == 400, (s, f))
    s, cov = call('GET', '/api/forecast/coverage')
    new_pair = [c for c in cov if c['raw_material_id'] == rm and c['warehouse_id'] == wh]
    ok_pair = [c for c in cov if c['raw_material_id'] == 1 and c['warehouse_id'] == 1]
    check('coverage endpoint: new pair not forecastable, trained pair is',
          new_pair and not new_pair[0]['forecastable'] and ok_pair and ok_pair[0]['forecastable'], (new_pair, ok_pair))

    # ---- seed endpoint is idempotent
    before = call('GET', '/api/health')[1]['counts']
    s1, r1 = call('POST', '/api/admin/seed-demo-data')
    s2, r2 = call('POST', '/api/admin/seed-demo-data')
    after = call('GET', '/api/health')[1]['counts']
    check('seeding twice never duplicates records', s2 == 200 and r2['materials_added'] == 0 and r2['warehouses_added'] == 0 and after == call('GET', '/api/health')[1]['counts'], (r1, r2))
    check('seeding does not remove or change existing records', after['raw_materials'] >= before['raw_materials'] and after['warehouses'] >= before['warehouses'])

    # ---- malformed bodies never crash the API
    req = urllib.request.Request(BASE + '/api/raw-materials/', data=b'not json', method='POST', headers={'Content-Type': 'application/json'})
    try:
        urllib.request.urlopen(req)
        code = 200
    except urllib.error.HTTPError as e:
        code = e.code
    check('malformed JSON body -> 400', code == 400, code)

    failed = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    if failed:
        print('FAILED:', *failed, sep='\n  - ')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(run())
