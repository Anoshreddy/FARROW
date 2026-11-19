"""Database initialisation, safe schema upgrade, backups and demo-data seeding.

Nothing in here deletes or overwrites user data:
  * the database file is backed up (consistent SQLite copy) before any schema change
  * schema upgrades only ADD missing columns
  * seeding only INSERTS records whose business ID does not exist yet
  * seeded records are flagged is_demo = True so they can always be told apart
"""
import os
import sqlite3
from datetime import datetime, timezone, timedelta

from sqlalchemy import inspect, text

from database import db
from models import RawMaterial, Warehouse, InventoryBatch, StockMovement

# These IDs intentionally match the IDs the trained Gradient Boosting model and its
# OneHotEncoder were built on (RM01-RM10, WH001-WH003), so demo records can be forecast.
DEMO_WAREHOUSES = [
    {'warehouse_id': 'WH001', 'name': 'Main Warehouse', 'location': 'Zone A'},
    {'warehouse_id': 'WH002', 'name': 'Secondary Warehouse', 'location': 'Zone B'},
    {'warehouse_id': 'WH003', 'name': 'Cold Storage', 'location': 'Zone C'},
]

DEMO_RAW_MATERIALS = [
    {'raw_material_id': 'RM01', 'name': 'Flour', 'unit': 'kg', 'category': 'Grains'},
    {'raw_material_id': 'RM02', 'name': 'Sugar', 'unit': 'kg', 'category': 'Sweeteners'},
    {'raw_material_id': 'RM03', 'name': 'Cooking Oil', 'unit': 'L', 'category': 'Oils'},
    {'raw_material_id': 'RM04', 'name': 'Rice', 'unit': 'kg', 'category': 'Grains'},
    {'raw_material_id': 'RM05', 'name': 'Milk Powder', 'unit': 'kg', 'category': 'Dairy'},
    {'raw_material_id': 'RM06', 'name': 'Butter', 'unit': 'kg', 'category': 'Dairy'},
    {'raw_material_id': 'RM07', 'name': 'Salt', 'unit': 'kg', 'category': 'Spices'},
    {'raw_material_id': 'RM08', 'name': 'Cocoa Powder', 'unit': 'kg', 'category': 'Baking'},
    {'raw_material_id': 'RM09', 'name': 'Corn Flour', 'unit': 'kg', 'category': 'Baking'},
    {'raw_material_id': 'RM10', 'name': 'Yeast', 'unit': 'kg', 'category': 'Baking'},
]

_DEMO_COLUMN_TABLES = ('raw_materials', 'warehouses')

# Demo inventory batches: material_code -> warehouse_code -> list of (batch_number, qty, expiry_days_from_now)
# expiry_days_from_now = None means no expiry. These give every material at least one batch somewhere.
DEMO_BATCHES = [
    # Flour in Main Warehouse and Cold Storage
    {'batch_number': 'FLR-DEMO-001', 'material': 'RM01', 'warehouse': 'WH001', 'quantity': 500, 'expiry_days': 180},
    {'batch_number': 'FLR-DEMO-002', 'material': 'RM01', 'warehouse': 'WH003', 'quantity': 300, 'expiry_days': 120},
    # Sugar in Main and Secondary
    {'batch_number': 'SGR-DEMO-001', 'material': 'RM02', 'warehouse': 'WH001', 'quantity': 400, 'expiry_days': 365},
    {'batch_number': 'SGR-DEMO-002', 'material': 'RM02', 'warehouse': 'WH002', 'quantity': 200, 'expiry_days': 300},
    # Cooking Oil in Secondary
    {'batch_number': 'OIL-DEMO-001', 'material': 'RM03', 'warehouse': 'WH002', 'quantity': 150, 'expiry_days': 240},
    # Rice in Main
    {'batch_number': 'RCE-DEMO-001', 'material': 'RM04', 'warehouse': 'WH001', 'quantity': 600, 'expiry_days': None},
    # Milk Powder in Cold Storage
    {'batch_number': 'MLP-DEMO-001', 'material': 'RM05', 'warehouse': 'WH003', 'quantity': 100, 'expiry_days': 90},
    {'batch_number': 'MLP-DEMO-002', 'material': 'RM05', 'warehouse': 'WH003', 'quantity': 75, 'expiry_days': 150},
    # Butter in Cold Storage (the material from the bug report)
    {'batch_number': 'BTR-DEMO-001', 'material': 'RM06', 'warehouse': 'WH003', 'quantity': 250, 'expiry_days': 200},
    {'batch_number': 'BTR-DEMO-002', 'material': 'RM06', 'warehouse': 'WH003', 'quantity': 150, 'expiry_days': 250},
    {'batch_number': 'BTR-DEMO-003', 'material': 'RM06', 'warehouse': 'WH001', 'quantity': 80, 'expiry_days': 180},
    # Salt in Main Warehouse
    {'batch_number': 'SLT-DEMO-001', 'material': 'RM07', 'warehouse': 'WH001', 'quantity': 350, 'expiry_days': None},
    # Cocoa Powder in Secondary
    {'batch_number': 'COC-DEMO-001', 'material': 'RM08', 'warehouse': 'WH002', 'quantity': 120, 'expiry_days': 270},
    # Corn Flour in Main
    {'batch_number': 'CFL-DEMO-001', 'material': 'RM09', 'warehouse': 'WH001', 'quantity': 200, 'expiry_days': 365},
    # Yeast in Cold Storage
    {'batch_number': 'YST-DEMO-001', 'material': 'RM10', 'warehouse': 'WH003', 'quantity': 50, 'expiry_days': 60},
]


def backup_database(db_path, reason='manual'):
    """Write a consistent copy of the SQLite file to <data dir>/backups. Returns the path or None."""
    if not db_path or not os.path.exists(db_path) or os.path.getsize(db_path) == 0:
        return None
    backup_dir = os.path.join(os.path.dirname(db_path), 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    target = os.path.join(backup_dir, f'inventory_{stamp}_{reason}.db')
    src = sqlite3.connect(db_path)
    try:
        dst = sqlite3.connect(target)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    return target


def ensure_schema(db_path):
    """Create missing tables and add missing columns. Returns a list of human-readable actions."""
    actions = []
    db.create_all()
    inspector = inspect(db.engine)
    missing = [
        t for t in _DEMO_COLUMN_TABLES
        if inspector.has_table(t) and 'is_demo' not in {c['name'] for c in inspector.get_columns(t)}
    ]
    if missing:
        backup = backup_database(db_path, 'before_schema_upgrade')
        if backup:
            actions.append(f'Backed up database to {backup}')
        with db.engine.begin() as conn:
            for table in missing:
                conn.execute(text(f'ALTER TABLE {table} ADD COLUMN is_demo BOOLEAN NOT NULL DEFAULT 0'))
                actions.append(f'Added column {table}.is_demo')
    return actions


def seed_demo_data():
    """Insert demo warehouses/materials/batches that do not exist yet. Never updates or removes anything."""
    result = {
        'warehouses_added': 0, 'warehouses_skipped': 0,
        'materials_added': 0, 'materials_skipped': 0,
        'batches_added': 0, 'batches_skipped': 0,
    }

    for w in DEMO_WAREHOUSES:
        if Warehouse.query.filter_by(warehouse_id=w['warehouse_id']).first():
            result['warehouses_skipped'] += 1
        else:
            db.session.add(Warehouse(is_demo=True, **w))
            result['warehouses_added'] += 1

    for m in DEMO_RAW_MATERIALS:
        if RawMaterial.query.filter_by(raw_material_id=m['raw_material_id']).first():
            result['materials_skipped'] += 1
        else:
            db.session.add(RawMaterial(is_demo=True, **m))
            result['materials_added'] += 1

    # Flush so that newly-added materials/warehouses have IDs for FK lookups below.
    db.session.flush()

    # Build lookup maps: business code -> database row
    mat_map = {m.raw_material_id: m for m in RawMaterial.query.all()}
    wh_map = {w.warehouse_id: w for w in Warehouse.query.all()}

    now = datetime.now(timezone.utc)
    for b in DEMO_BATCHES:
        # Skip if this batch_number already exists (idempotent).
        if InventoryBatch.query.filter_by(batch_number=b['batch_number']).first():
            result['batches_skipped'] += 1
            continue
        mat = mat_map.get(b['material'])
        wh = wh_map.get(b['warehouse'])
        if not mat or not wh:
            # Referenced material/warehouse doesn't exist — skip gracefully.
            result['batches_skipped'] += 1
            continue
        expiry = (now + timedelta(days=b['expiry_days'])) if b.get('expiry_days') else None
        batch = InventoryBatch(
            batch_number=b['batch_number'],
            raw_material_id=mat.id,
            warehouse_id=wh.id,
            quantity=b['quantity'],
            received_date=now,
            expiry_date=expiry,
        )
        db.session.add(batch)
        db.session.flush()  # assign batch.id for the movement FK
        # Record a matching RECEIVE movement so stock history is consistent.
        db.session.add(StockMovement(
            raw_material_id=mat.id,
            warehouse_id=wh.id,
            batch_id=batch.id,
            movement_type='RECEIVE',
            quantity=b['quantity'],
            reference_note=f'Demo seed: {b["batch_number"]}',
        ))
        result['batches_added'] += 1

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        raise
    return result


def table_counts():
    return {
        'raw_materials': RawMaterial.query.count(),
        'warehouses': Warehouse.query.count(),
        'batches': InventoryBatch.query.count(),
        'movements': StockMovement.query.count(),
    }
