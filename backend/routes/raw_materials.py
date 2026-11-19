from flask import Blueprint, request, jsonify
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

from database import db
from models import RawMaterial, InventoryBatch, StockMovement
from utils.validation import validate_fields, validate_business_id, error_response

raw_materials_bp = Blueprint('raw_materials', __name__)

FIELDS = {
    'raw_material_id': ('Material ID', 50),
    'name': ('Name', 100),
    'unit': ('Unit', 20),
    'category': ('Category', 50),
}


def serialize(m):
    return {
        'id': m.id,
        'raw_material_id': m.raw_material_id,
        'name': m.name,
        'unit': m.unit,
        'category': m.category,
        'is_demo': bool(m.is_demo),
        'created_at': m.created_at.isoformat() if m.created_at else None,
    }


def usage(m):
    batches = InventoryBatch.query.filter_by(raw_material_id=m.id)
    return {
        'batch_count': batches.count(),
        'movement_count': StockMovement.query.filter_by(raw_material_id=m.id).count(),
        'total_quantity': float(db.session.query(func.coalesce(func.sum(InventoryBatch.quantity), 0.0))
                                .filter(InventoryBatch.raw_material_id == m.id).scalar() or 0.0),
    }


def id_taken(raw_material_id, exclude_pk=None):
    q = RawMaterial.query.filter(func.lower(RawMaterial.raw_material_id) == raw_material_id.lower())
    if exclude_pk is not None:
        q = q.filter(RawMaterial.id != exclude_pk)
    return q.first() is not None


@raw_materials_bp.route('/', methods=['GET'])
def get_raw_materials():
    """List materials. Optional filters: ?q=<text in name/id/category>&category=<exact category>."""
    query = RawMaterial.query
    q = (request.args.get('q') or '').strip()
    category = (request.args.get('category') or '').strip()
    if q:
        like = f'%{q}%'
        query = query.filter(or_(RawMaterial.name.ilike(like),
                                 RawMaterial.raw_material_id.ilike(like),
                                 RawMaterial.category.ilike(like)))
    if category:
        query = query.filter(func.lower(RawMaterial.category) == category.lower())
    return jsonify([serialize(m) for m in query.order_by(RawMaterial.name).all()]), 200


@raw_materials_bp.route('/<int:id>', methods=['GET'])
def get_raw_material(id):
    m = db.session.get(RawMaterial, id)
    if not m:
        return jsonify({'error': 'Raw material not found'}), 404
    return jsonify({**serialize(m), 'usage': usage(m)}), 200


@raw_materials_bp.route('/', methods=['POST'])
def create_raw_material():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Request body must be a JSON object.'}), 400

    cleaned, errors = validate_fields(data, FIELDS)
    if 'raw_material_id' in cleaned:
        bad = validate_business_id(cleaned['raw_material_id'], 'Material ID')
        if bad:
            errors['raw_material_id'] = bad
    if errors:
        return error_response(jsonify, errors)
    if id_taken(cleaned['raw_material_id']):
        return error_response(jsonify, {'raw_material_id': f"Raw material with ID '{cleaned['raw_material_id']}' already exists"}, 409)

    try:
        material = RawMaterial(**cleaned)
        db.session.add(material)
        db.session.commit()
        return jsonify({'message': 'Raw material created successfully', 'id': material.id, **serialize(material)}), 201
    except IntegrityError:
        db.session.rollback()
        return error_response(jsonify, {'raw_material_id': f"Raw material with ID '{cleaned['raw_material_id']}' already exists"}, 409)


@raw_materials_bp.route('/<int:id>', methods=['PUT', 'PATCH'])
def update_raw_material(id):
    """Edit name / unit / category. The business ID is immutable: the forecasting model keys on it."""
    m = db.session.get(RawMaterial, id)
    if not m:
        return jsonify({'error': 'Raw material not found'}), 404
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Request body must be a JSON object.'}), 400

    if 'raw_material_id' in data and str(data['raw_material_id']).strip() != m.raw_material_id:
        return error_response(jsonify, {'raw_material_id': 'The material ID cannot be changed after creation.'}, 400)

    editable = {k: v for k, v in FIELDS.items() if k != 'raw_material_id'}
    merged = {k: data.get(k, getattr(m, k)) for k in editable}
    cleaned, errors = validate_fields(merged, editable)
    if errors:
        return error_response(jsonify, errors)

    if cleaned['unit'] != m.unit:
        u = usage(m)
        if u['batch_count'] or u['movement_count']:
            return error_response(jsonify, {'unit': 'The unit cannot be changed while this material has batches or stock movements.'}, 409)

    for k, v in cleaned.items():
        setattr(m, k, v)
    db.session.commit()
    return jsonify({'message': 'Raw material updated successfully', **serialize(m)}), 200


@raw_materials_bp.route('/<int:id>', methods=['DELETE'])
def delete_raw_material(id):
    m = db.session.get(RawMaterial, id)
    if not m:
        return jsonify({'error': 'Raw material not found'}), 404
    u = usage(m)
    if u['batch_count'] or u['movement_count']:
        return jsonify({
            'error': f"'{m.name}' cannot be deleted: it is referenced by {u['batch_count']} inventory batch(es) "
                     f"and {u['movement_count']} stock movement(s).",
            'usage': u,
        }), 409
    db.session.delete(m)
    db.session.commit()
    return jsonify({'message': f"Raw material '{m.name}' deleted successfully"}), 200
