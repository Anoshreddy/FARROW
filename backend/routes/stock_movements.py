from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import time
from database import db
from models import StockMovement, InventoryBatch, RawMaterial, Warehouse
from sqlalchemy.exc import IntegrityError
import math

stock_movements_bp = Blueprint('stock_movements', __name__)

def check_stock_sufficient(raw_material_id, warehouse_id, batch_id, required_quantity):
    if batch_id:
        batch = InventoryBatch.query.get(batch_id)
        if not batch or batch.quantity < required_quantity:
            return False
        return True
    else:
        movements = StockMovement.query.filter_by(
            raw_material_id=raw_material_id, 
            warehouse_id=warehouse_id, 
            batch_id=None
        ).all()
        
        current_stock = 0
        for m in movements:
            if m.movement_type in ['RECEIVE', 'TRANSFER_IN']:
                current_stock += m.quantity
            elif m.movement_type in ['CONSUME', 'WASTAGE', 'TRANSFER_OUT']:
                current_stock -= m.quantity
                
        return current_stock >= required_quantity

@stock_movements_bp.route('/', methods=['GET'])
def get_stock_movements():
    raw_material_id = request.args.get('raw_material_id')
    warehouse_id = request.args.get('warehouse_id')
    movement_type = request.args.get('movement_type')
    
    query = StockMovement.query
    if raw_material_id:
        query = query.filter_by(raw_material_id=raw_material_id)
    if warehouse_id:
        query = query.filter_by(warehouse_id=warehouse_id)
    if movement_type:
        query = query.filter_by(movement_type=movement_type)
        
    movements = query.order_by(StockMovement.movement_date.desc(), StockMovement.id.desc()).all()
    result = []
    for m in movements:
        result.append({
            'id': m.id,
            'raw_material_id': m.raw_material_id,
            'warehouse_id': m.warehouse_id,
            'batch_id': m.batch_id,
            'movement_type': m.movement_type,
            'quantity': m.quantity,
            'movement_date': m.movement_date.isoformat() if m.movement_date else None,
            'reference_note': m.reference_note,
            'created_at': m.created_at.isoformat() if m.created_at else None
        })
    return jsonify(result), 200

@stock_movements_bp.route('/<int:id>', methods=['GET'])
def get_stock_movement(id):
    m = StockMovement.query.get(id)
    if not m:
        return jsonify({'error': 'Stock movement not found'}), 404
        
    return jsonify({
        'id': m.id,
        'raw_material_id': m.raw_material_id,
        'warehouse_id': m.warehouse_id,
        'batch_id': m.batch_id,
        'movement_type': m.movement_type,
        'quantity': m.quantity,
        'movement_date': m.movement_date.isoformat() if m.movement_date else None,
        'reference_note': m.reference_note,
        'created_at': m.created_at.isoformat() if m.created_at else None
    }), 200

def _as_int(value):
    """Accept 3 or "3" (what a <select> sends); reject everything else (incl. booleans, 3.5)."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().lstrip('-').isdigit():
        return int(value.strip())
    return None


def _as_quantity(value):
    if isinstance(value, bool) or value is None:
        return None
    try:
        qty = float(value)
    except (TypeError, ValueError):
        return None
    return qty if math.isfinite(qty) else None


def _fmt(n):
    return f'{n:g}'


def _fail(message, status=400):
    return jsonify({'error': message}), status


@stock_movements_bp.route('/', methods=['POST'])
def create_stock_movement():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or not data.get('movement_type'):
        return _fail('Missing movement_type')

    movement_type = str(data['movement_type']).upper()
    valid_types = ['RECEIVE', 'CONSUME', 'TRANSFER', 'WASTAGE']
    if movement_type not in valid_types:
        return _fail(f'Invalid movement_type. Must be one of {valid_types}')

    required_fields = ['raw_material_id', 'warehouse_id', 'quantity']
    if movement_type == 'TRANSFER':
        required_fields.append('destination_warehouse_id')
    missing = [f for f in required_fields if data.get(f) in (None, '')]
    if missing:
        return _fail(f'Missing required fields. Required: {", ".join(required_fields)}')

    raw_material_id = _as_int(data['raw_material_id'])
    warehouse_id = _as_int(data['warehouse_id'])
    if raw_material_id is None:
        return _fail('raw_material_id must be a valid raw material id')
    if warehouse_id is None:
        return _fail('warehouse_id must be a valid warehouse id')

    quantity = _as_quantity(data['quantity'])
    if quantity is None:
        return _fail('Quantity must be a number')
    if quantity <= 0:
        return _fail('Quantity must be greater than zero')

    batch_id = None
    if data.get('batch_id') not in (None, ''):
        batch_id = _as_int(data['batch_id'])
        if batch_id is None:
            return _fail('batch_id must be a valid batch id')

    notes = data.get('notes')
    if notes is not None:
        notes = str(notes).strip() or None
        if notes and len(notes) > 200:
            return _fail('Note must be at most 200 characters')

    material = db.session.get(RawMaterial, raw_material_id)
    if not material:
        return _fail('RawMaterial does not exist', 404)
    warehouse = db.session.get(Warehouse, warehouse_id)
    if not warehouse:
        return _fail('Source Warehouse does not exist', 404)

    batch = None
    if batch_id is not None:
        batch = db.session.get(InventoryBatch, batch_id)
        if not batch or batch.raw_material_id != raw_material_id or batch.warehouse_id != warehouse_id:
            return _fail('Invalid batch for the given raw material and warehouse')

    unit = material.unit

    try:
        if movement_type in ('CONSUME', 'WASTAGE'):
            verb = 'consume' if movement_type == 'CONSUME' else 'write off'
            if batch is None:
                has_batches = InventoryBatch.query.filter(
                    InventoryBatch.raw_material_id == raw_material_id,
                    InventoryBatch.warehouse_id == warehouse_id,
                    InventoryBatch.quantity > 0,
                ).first()
                if has_batches:
                    return _fail(f'Select the batch to {verb} from. Stock for this material is held in batches.')
            if not check_stock_sufficient(raw_material_id, warehouse_id, batch_id, quantity):
                if batch is not None:
                    return _fail(f'Insufficient stock: only {_fmt(batch.quantity)} {unit} available in batch {batch.batch_number}')
                return _fail('Insufficient stock')

            movement = StockMovement(
                raw_material_id=raw_material_id, warehouse_id=warehouse_id, batch_id=batch_id,
                movement_type=movement_type, quantity=quantity, reference_note=notes,
            )
            db.session.add(movement)
            if batch is not None:
                batch.quantity -= quantity

        elif movement_type == 'RECEIVE':
            if batch is None:
                batch_number = (str(data.get('batch_number') or '').strip()
                                or f"BATCH-{int(time.time() * 1000)}-{raw_material_id}-{warehouse_id}")
                if len(batch_number) > 50:
                    return _fail('Batch number must be at most 50 characters')
                existing = InventoryBatch.query.filter_by(batch_number=batch_number).first()
                if existing:
                    # Batch numbers are globally unique. Re-using one is only valid for the same material + warehouse.
                    if existing.raw_material_id != raw_material_id or existing.warehouse_id != warehouse_id:
                        return _fail(f"Batch number '{batch_number}' is already used by a different material or warehouse", 409)
                    batch = existing
                    batch.quantity += quantity
                else:
                    expiry_date = None
                    if data.get('expiry_date'):
                        try:
                            expiry_date = datetime.fromisoformat(str(data['expiry_date']).replace('Z', '+00:00'))
                        except ValueError:
                            return _fail('expiry_date must be a valid date (YYYY-MM-DD)')
                    batch = InventoryBatch(
                        batch_number=batch_number, raw_material_id=raw_material_id, warehouse_id=warehouse_id,
                        quantity=quantity, received_date=datetime.now(timezone.utc), expiry_date=expiry_date,
                    )
                    db.session.add(batch)
                    db.session.flush()
            else:
                batch.quantity += quantity

            movement = StockMovement(
                raw_material_id=raw_material_id, warehouse_id=warehouse_id, batch_id=batch.id,
                movement_type=movement_type, quantity=quantity, reference_note=notes,
            )
            db.session.add(movement)

        else:  # TRANSFER
            dest_id = _as_int(data['destination_warehouse_id'])
            if dest_id is None:
                return _fail('destination_warehouse_id must be a valid warehouse id')
            if dest_id == warehouse_id:
                return _fail('Source and destination warehouse cannot be the same')
            dest_wh = db.session.get(Warehouse, dest_id)
            if not dest_wh:
                return _fail('Destination Warehouse does not exist', 404)
            if batch is None:
                return _fail('Select the batch to transfer. Stock for this material is held in batches.')
            if batch.quantity < quantity:
                return _fail(f'Insufficient stock in source warehouse: only {_fmt(batch.quantity)} {unit} available in batch {batch.batch_number}')

            # inventory_batches.batch_number is UNIQUE across all warehouses, so the destination copy of the
            # batch needs its own number. "<base>@<warehouse code>" keeps it traceable to the source batch.
            base_number = batch.batch_number.split('@')[0]
            dest_number = f'{base_number}@{dest_wh.warehouse_id}'
            if len(dest_number) > 50:
                return _fail('Batch number is too long to create a transfer copy (max 50 characters including "@<warehouse id>")')

            batch.quantity -= quantity
            dest_batch = InventoryBatch.query.filter_by(batch_number=dest_number).first()
            if dest_batch:
                if dest_batch.raw_material_id != raw_material_id or dest_batch.warehouse_id != dest_id:
                    return _fail(f"Batch number '{dest_number}' is already used by a different material or warehouse", 409)
                dest_batch.quantity += quantity
            else:
                dest_batch = InventoryBatch(
                    batch_number=dest_number, raw_material_id=raw_material_id, warehouse_id=dest_id,
                    quantity=quantity, received_date=batch.received_date, expiry_date=batch.expiry_date,
                    supplier_lead_time_days=batch.supplier_lead_time_days,
                )
                db.session.add(dest_batch)
                db.session.flush()

            movement = StockMovement(
                raw_material_id=raw_material_id, warehouse_id=warehouse_id, batch_id=batch.id,
                movement_type='TRANSFER_OUT', quantity=quantity, reference_note=notes,
            )
            db.session.add(movement)
            db.session.add(StockMovement(
                raw_material_id=raw_material_id, warehouse_id=dest_id, batch_id=dest_batch.id,
                movement_type='TRANSFER_IN', quantity=quantity, reference_note=notes,
            ))

        db.session.commit()
        return jsonify({
            'message': 'Stock movement recorded successfully',
            'movement_id': movement.id,
            'batch_id': movement.batch_id,
        }), 201

    except IntegrityError as e:
        db.session.rollback()
        return _fail(f'Could not save the movement because of a data conflict: {e.orig}', 409)
    except Exception as e:
        db.session.rollback()
        return _fail(str(e), 500)
