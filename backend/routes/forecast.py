from flask import Blueprint, request, jsonify

from database import db
from models import RawMaterial, Warehouse
from services.ml_service import ml_service, ForecastError
import pandas as pd

forecast_bp = Blueprint('forecast', __name__)


def _int_arg(name):
    value = request.args.get(name)
    return int(value) if value is not None and value.strip().isdigit() else None


@forecast_bp.route('/', methods=['GET'])
def get_forecast():
    raw_material_id = _int_arg('raw_material_id')
    warehouse_id = _int_arg('warehouse_id')
    prediction_date = request.args.get('prediction_date')

    if raw_material_id is None or warehouse_id is None or not prediction_date:
        return jsonify({
            'error': 'Missing or invalid parameters: raw_material_id and warehouse_id (database ids) and prediction_date (YYYY-MM-DD) are required',
            'code': 'INVALID_PARAMETERS',
        }), 400

    # The API receives database primary keys; the model was trained on the business codes (RM01 / WH001).
    rm = db.session.get(RawMaterial, raw_material_id)
    if not rm:
        return jsonify({'error': f'Raw material with id {raw_material_id} not found', 'code': 'NOT_FOUND'}), 404
    wh = db.session.get(Warehouse, warehouse_id)
    if not wh:
        return jsonify({'error': f'Warehouse with id {warehouse_id} not found', 'code': 'NOT_FOUND'}), 404

    try:
        predicted_demand = ml_service.forecast_demand(rm.raw_material_id, wh.warehouse_id, prediction_date)
    except ForecastError as e:
        return jsonify({'error': str(e), 'code': e.code}), e.status
    except ValueError as e:
        return jsonify({'error': str(e), 'code': 'INVALID_INPUT'}), 400
    except Exception as e:
        return jsonify({'error': 'Internal server error during prediction: ' + str(e), 'code': 'PREDICTION_FAILED'}), 500

    history = ml_service.history_context(rm.raw_material_id, wh.warehouse_id, pd.to_datetime(prediction_date))
    warnings = []
    if history and history['is_stale']:
        warnings.append(
            f"The newest consumption history for this material and warehouse ends on {history['end_date']}, "
            f"{history['gap_days']} days before the prediction date. The lag features are taken from that older period, "
            f"so treat this estimate with caution."
        )

    return jsonify({
        'raw_material_id': rm.id,
        'raw_material_name': rm.name,
        'warehouse_id': wh.id,
        'warehouse_name': wh.name,
        'prediction_date': prediction_date,
        'predicted_daily_consumption': round(float(predicted_demand), 2),
        'unit': rm.unit,
        'history': history,
        'warnings': warnings,
        'model': type(ml_service.model).__name__,
    }), 200


@forecast_bp.route('/coverage', methods=['GET'])
def forecast_coverage():
    """For every material x warehouse in the database: can the model forecast it, and why not."""
    result = []
    warehouses = Warehouse.query.order_by(Warehouse.id).all()
    for rm in RawMaterial.query.order_by(RawMaterial.id).all():
        for wh in warehouses:
            cov = ml_service.coverage(rm.raw_material_id, wh.warehouse_id)
            known = ml_service.is_known_to_model(rm.raw_material_id, wh.warehouse_id)
            days = cov['days'] if cov else 0
            if not known:
                reason = 'Not part of the trained model'
            elif days < 28:
                reason = 'Not enough historical consumption'
            else:
                reason = None
            result.append({
                'raw_material_id': rm.id,
                'warehouse_id': wh.id,
                'forecastable': reason is None,
                'reason': reason,
                'history_days': days,
                'history_end_date': cov['end'].date().isoformat() if cov else None,
            })
    return jsonify(result), 200
