from flask import Blueprint, request, jsonify
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

from database import db
from models import Warehouse, InventoryBatch, StockMovement
from utils.validation import validate_fields, validate_business_id, error_response

warehouses_bp = Blueprint('warehouses', __name__)

FIELDS = {
    'warehouse_id': ('Warehouse ID', 50),
    'name': ('Name', 100),
    'location': ('Location', 200),
}


def serialize(w):
    return {
        'id': w.id,
        'warehouse_id': w.warehouse_id,
        'name': w.name,
        'location': w.location,
        'is_demo': bool(w.is_demo),
        'created_at': w.created_at.isoformat() if w.created_at else None,
    }


def usage(w):
    return {
        'batch_count': InventoryBatch.query.filter_by(warehouse_id=w.id).count(),
        'movement_count': StockMovement.query.filter_by(warehouse_id=w.id).count(),
    }


def id_taken(warehouse_id, exclude_pk=None):
    q = Warehouse.query.filter(func.lower(Warehouse.warehouse_id) == warehouse_id.lower())
    if exclude_pk is not None:
        q = q.filter(Warehouse.id != exclude_pk)
    return q.first() is not None


@warehouses_bp.route('/', methods=['GET'])
def get_warehouses():
    """List warehouses. Optional filter: ?q=<text in name/id/location>."""
    query = Warehouse.query
    q = (request.args.get('q') or '').strip()
    if q:
        like = f'%{q}%'
        query = query.filter(or_(Warehouse.name.ilike(like),
                                 Warehouse.warehouse_id.ilike(like),
                                 Warehouse.location.ilike(like)))
    return jsonify([serialize(w) for w in query.order_by(Warehouse.name).all()]), 200


@warehouses_bp.route('/<int:id>', methods=['GET'])
def get_warehouse(id):
    w = db.session.get(Warehouse, id)
    if not w:
        return jsonify({'error': 'Warehouse not found'}), 404
    return jsonify({**serialize(w), 'usage': usage(w)}), 200


@warehouses_bp.route('/', methods=['POST'])
def create_warehouse():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Request body must be a JSON object.'}), 400

    cleaned, errors = validate_fields(data, FIELDS)
    if 'warehouse_id' in cleaned:
        bad = validate_business_id(cleaned['warehouse_id'], 'Warehouse ID')
        if bad:
            errors['warehouse_id'] = bad
    if errors:
        return error_response(jsonify, errors)
    if id_taken(cleaned['warehouse_id']):
        return error_response(jsonify, {'warehouse_id': f"Warehouse with ID '{cleaned['warehouse_id']}' already exists"}, 409)

    try:
        warehouse = Warehouse(**cleaned)
        db.session.add(warehouse)
        db.session.commit()
        return jsonify({'message': 'Warehouse created successfully', 'id': warehouse.id, **serialize(warehouse)}), 201
    except IntegrityError:
        db.session.rollback()
        return error_response(jsonify, {'warehouse_id': f"Warehouse with ID '{cleaned['warehouse_id']}' already exists"}, 409)


@warehouses_bp.route('/<int:id>', methods=['PUT', 'PATCH'])
def update_warehouse(id):
    """Edit name / location. The business ID is immutable: the forecasting model keys on it."""
    w = db.session.get(Warehouse, id)
    if not w:
        return jsonify({'error': 'Warehouse not found'}), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Request body must be a JSON object.'}), 400

    if 'warehouse_id' in data and str(data['warehouse_id']).strip() != w.warehouse_id:
        return error_response(jsonify, {'warehouse_id': 'The warehouse ID cannot be changed after creation.'}, 400)

    editable = {k: v for k, v in FIELDS.items() if k != 'warehouse_id'}
    merged = {k: data.get(k, getattr(w, k)) for k in editable}
    cleaned, errors = validate_fields(merged, editable)
    if errors:
        return error_response(jsonify, errors)

    for k, v in cleaned.items():
        setattr(w, k, v)
    db.session.commit()
    return jsonify({'message': 'Warehouse updated successfully', **serialize(w)}), 200


@warehouses_bp.route('/<int:id>', methods=['DELETE'])
def delete_warehouse(id):
    w = db.session.get(Warehouse, id)
    if not w:
        return jsonify({'error': 'Warehouse not found'}), 404
    u = usage(w)
    if u['batch_count'] or u['movement_count']:
        return jsonify({
            'error': f"'{w.name}' cannot be deleted: it is referenced by {u['batch_count']} inventory batch(es) "
                     f"and {u['movement_count']} stock movement(s).",
            'usage': u,
        }), 409
    db.session.delete(w)
    db.session.commit()
    return jsonify({'message': f"Warehouse '{w.name}' deleted successfully"}), 200
