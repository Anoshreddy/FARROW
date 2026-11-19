import os
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from database import db

app = Flask(__name__)
# '/api/raw-materials' and '/api/raw-materials/' must behave identically. With Flask's default
# strict slashes the no-slash form answers with a 308 redirect, which browsers refuse to follow
# for CORS preflighted requests (PUT/DELETE/POST with JSON) - that breaks the UI.
app.url_map.strict_slashes = False
CORS(app)

# Database lives in backend/data/inventory.db. FARROW_DB_PATH overrides it (used for tests).
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
DB_PATH = os.path.abspath(os.environ.get('FARROW_DB_PATH') or os.path.join(DATA_DIR, 'inventory.db'))
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DB_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['FARROW_DB_PATH'] = DB_PATH

db.init_app(app)

import models  # noqa: E402,F401
import db_init  # noqa: E402

with app.app_context():
    for _action in db_init.ensure_schema(DB_PATH):
        print(f'[FARROW] {_action}')
    # Opt-in only: seed demo data when BOTH tables are completely empty (a brand-new database).
    if os.environ.get('FARROW_AUTO_SEED') == '1':
        _counts = db_init.table_counts()
        if _counts['raw_materials'] == 0 and _counts['warehouses'] == 0:
            print(f'[FARROW] Empty database, seeded demo data: {db_init.seed_demo_data()}')
    print(f'[FARROW] Using database: {DB_PATH} {db_init.table_counts()}')

# Register Blueprints
from routes.raw_materials import raw_materials_bp  # noqa: E402
from routes.warehouses import warehouses_bp  # noqa: E402
from routes.inventory_batches import inventory_batches_bp  # noqa: E402
from routes.stock_movements import stock_movements_bp  # noqa: E402
from routes.forecast import forecast_bp  # noqa: E402
from routes.stockout_risk import stockout_risk_bp  # noqa: E402
from routes.reports import reports_bp  # noqa: E402
from routes.admin import admin_bp  # noqa: E402

app.register_blueprint(raw_materials_bp, url_prefix='/api/raw-materials')
app.register_blueprint(warehouses_bp, url_prefix='/api/warehouses')
app.register_blueprint(inventory_batches_bp, url_prefix='/api/inventory-batches')
app.register_blueprint(stock_movements_bp, url_prefix='/api/stock-movements')
app.register_blueprint(forecast_bp, url_prefix='/api/forecast')
app.register_blueprint(stockout_risk_bp, url_prefix='/api/stockout-risk')
app.register_blueprint(reports_bp, url_prefix='/api/reports')
app.register_blueprint(admin_bp, url_prefix='/api/admin')


@app.route('/api/health', methods=['GET'])
def health_check():
    from services.ml_service import ml_service
    return jsonify({
        "status": "success",
        "message": "Backend is running",
        "database": DB_PATH,
        "counts": db_init.table_counts(),
        "ml_model_loaded": ml_service.model is not None,
        "ml_load_error": ml_service.load_error,
    })


# Every error leaves the API as JSON with an "error" key, which is what the frontend displays.
@app.errorhandler(HTTPException)
def handle_http_error(err):
    return jsonify({'error': err.description or err.name}), err.code


@app.errorhandler(Exception)
def handle_unexpected_error(err):
    db.session.rollback()
    app.logger.exception('Unhandled error')
    return jsonify({'error': f'Unexpected server error: {err}'}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=True)
