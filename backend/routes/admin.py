from flask import Blueprint, jsonify
import db_init

admin_bp = Blueprint('admin', __name__)


@admin_bp.route('/seed-demo-data', methods=['POST'])
def seed_demo_data():
    """Idempotent: inserts only demo records that are missing. Never changes existing rows."""
    result = db_init.seed_demo_data()
    added = result['warehouses_added'] + result['materials_added']
    message = (
        f"Loaded demo data: {result['materials_added']} raw materials and {result['warehouses_added']} warehouses added."
        if added else 'Demo data is already present. Nothing was added.'
    )
    return jsonify({'message': message, **result}), 201 if added else 200
