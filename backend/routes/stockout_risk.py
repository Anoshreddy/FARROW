from flask import Blueprint, request, jsonify
from services.ml_service import ml_service
from models import RawMaterial, Warehouse, InventoryBatch

stockout_risk_bp = Blueprint('stockout_risk', __name__)

def calculate_stockout_risk_for_combination(rm, wh, prediction_date):
    # Calculate current stock for the specific warehouse using InventoryBatch
    batches = InventoryBatch.query.filter_by(
        raw_material_id=rm.id, 
        warehouse_id=wh.id
    ).all()
    
    current_stock = sum(batch.quantity for batch in batches)
    
    # Get supplier lead time
    supplier_lead_time_days = 0
    valid_lead_times = [b.supplier_lead_time_days for b in batches if b.supplier_lead_time_days is not None]
    if valid_lead_times:
        supplier_lead_time_days = valid_lead_times[-1]
    
    # Fallback to historical data if no batch has supplier_lead_time_days
    if not valid_lead_times:
        hist_df = ml_service.historical_data
        filtered = hist_df[
            (hist_df['raw_material_id'] == rm.raw_material_id) & 
            (hist_df['warehouse_id'] == wh.warehouse_id)
        ]
        if not filtered.empty and 'supplier_lead_time_days' in filtered.columns:
            supplier_lead_time_days = int(filtered['supplier_lead_time_days'].iloc[-1])
            
    # Default fallback
    if not supplier_lead_time_days:
        supplier_lead_time_days = 3
        
    # Get predicted daily consumption from ML service
    try:
        predicted_daily_consumption = ml_service.forecast_demand(
            rm.raw_material_id, 
            wh.warehouse_id, 
            prediction_date
        )
    except Exception as e:
        predicted_daily_consumption = 0.0

    predicted_daily_consumption = round(predicted_daily_consumption, 2)
    
    # Calculate lead-time demand
    lead_time_demand = round(predicted_daily_consumption * supplier_lead_time_days, 2)
    
    # Calculate stock coverage days
    if predicted_daily_consumption > 0:
        stock_coverage_days = round(current_stock / predicted_daily_consumption, 2)
    else:
        stock_coverage_days = 9999.99

    # Determine risk level
    if stock_coverage_days < supplier_lead_time_days:
        risk_level = "HIGH"
    elif stock_coverage_days < (supplier_lead_time_days * 1.5):
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"
        
    # Reorder logic
    safety_buffer = round(0.50 * lead_time_demand, 2)
    target_stock = round(lead_time_demand + safety_buffer, 2)
    reorder_quantity = round(max(0.0, target_stock - current_stock), 2)
    
    if reorder_quantity > 0:
        recommendation = "Reorder Recommended"
    else:
        recommendation = "No Reorder Required"
        
    return {
        "raw_material_id": rm.id,
        "raw_material_name": rm.name,
        "warehouse_id": wh.id,
        "warehouse_name": wh.name,
        "unit": rm.unit,
        "current_stock": current_stock,
        "supplier_lead_time_days": supplier_lead_time_days,
        "predicted_daily_consumption": predicted_daily_consumption,
        "lead_time_demand": lead_time_demand,
        "stock_coverage_days": stock_coverage_days,
        "risk_level": risk_level,
        "safety_buffer": safety_buffer,
        "target_stock": target_stock,
        "reorder_quantity": reorder_quantity,
        "recommendation": recommendation
    }

@stockout_risk_bp.route('/', methods=['GET'])
def get_stockout_risk():
    raw_material_id = request.args.get('raw_material_id', type=int)
    warehouse_id = request.args.get('warehouse_id', type=int)
    prediction_date = request.args.get('prediction_date')
    
    if not all([raw_material_id, warehouse_id, prediction_date]):
        return jsonify({'error': 'Missing required parameters'}), 400
        
    rm = RawMaterial.query.get(raw_material_id)
    if not rm:
        return jsonify({'error': 'Invalid raw material ID'}), 404
        
    wh = Warehouse.query.get(warehouse_id)
    if not wh:
        return jsonify({'error': 'Invalid warehouse ID'}), 404
        
    result = calculate_stockout_risk_for_combination(rm, wh, prediction_date)
    return jsonify(result), 200
