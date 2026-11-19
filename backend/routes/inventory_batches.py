from flask import Blueprint, request, jsonify
from datetime import datetime
from database import db
from models import InventoryBatch, RawMaterial, Warehouse
from sqlalchemy.exc import IntegrityError

inventory_batches_bp = Blueprint('inventory_batches', __name__)

@inventory_batches_bp.route('/', methods=['GET'])
def get_inventory_batches():
    raw_material_id = request.args.get('raw_material_id')
    warehouse_id = request.args.get('warehouse_id')
    
    query = InventoryBatch.query
    if raw_material_id:
        query = query.filter_by(raw_material_id=raw_material_id)
    if warehouse_id:
        query = query.filter_by(warehouse_id=warehouse_id)
        
    batches = query.all()
    result = []
    for b in batches:
        result.append({
            'id': b.id,
            'batch_number': b.batch_number,
            'raw_material_id': b.raw_material_id,
            'warehouse_id': b.warehouse_id,
            'quantity': b.quantity,
            'received_date': b.received_date.isoformat() if b.received_date else None,
            'expiry_date': b.expiry_date.isoformat() if b.expiry_date else None,
            'supplier_lead_time_days': b.supplier_lead_time_days,
            'created_at': b.created_at.isoformat() if b.created_at else None
        })
    return jsonify(result), 200

@inventory_batches_bp.route('/<int:id>', methods=['GET'])
def get_inventory_batch(id):
    b = InventoryBatch.query.get(id)
    if not b:
        return jsonify({'error': 'Inventory batch not found'}), 404
        
    return jsonify({
        'id': b.id,
        'batch_number': b.batch_number,
        'raw_material_id': b.raw_material_id,
        'warehouse_id': b.warehouse_id,
        'quantity': b.quantity,
        'received_date': b.received_date.isoformat() if b.received_date else None,
        'expiry_date': b.expiry_date.isoformat() if b.expiry_date else None,
        'supplier_lead_time_days': b.supplier_lead_time_days,
        'created_at': b.created_at.isoformat() if b.created_at else None
    }), 200

@inventory_batches_bp.route('/', methods=['POST'])
def create_inventory_batch():
    data = request.get_json()
    
    required_fields = ['batch_number', 'raw_material_id', 'warehouse_id', 'quantity', 'received_date']
    if not data or not all(field in data for field in required_fields):
        return jsonify({'error': f'Missing required fields. Required: {", ".join(required_fields)}'}), 400
        
    # Validate raw material exists
    rm = RawMaterial.query.get(data['raw_material_id'])
    if not rm:
        return jsonify({'error': f"RawMaterial with database id {data['raw_material_id']} does not exist"}), 404
        
    # Validate warehouse exists
    wh = Warehouse.query.get(data['warehouse_id'])
    if not wh:
        return jsonify({'error': f"Warehouse with database id {data['warehouse_id']} does not exist"}), 404
        
    try:
        received_date = datetime.fromisoformat(data['received_date'].replace('Z', '+00:00'))
        expiry_date = None
        if 'expiry_date' in data and data['expiry_date']:
            expiry_date = datetime.fromisoformat(data['expiry_date'].replace('Z', '+00:00'))
            
        new_batch = InventoryBatch(
            batch_number=data['batch_number'],
            raw_material_id=data['raw_material_id'],
            warehouse_id=data['warehouse_id'],
            quantity=float(data['quantity']),
            received_date=received_date,
            expiry_date=expiry_date,
            supplier_lead_time_days=data.get('supplier_lead_time_days')
        )
        db.session.add(new_batch)
        db.session.commit()
        return jsonify({'message': 'Inventory batch created successfully', 'id': new_batch.id}), 201
    except ValueError as e:
        return jsonify({'error': 'Invalid date format or quantity. Use ISO format (YYYY-MM-DDTHH:MM:SS) for dates.'}), 400
    except IntegrityError:
        db.session.rollback()
        return jsonify({'error': f"Inventory batch with batch_number '{data['batch_number']}' already exists"}), 409
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
