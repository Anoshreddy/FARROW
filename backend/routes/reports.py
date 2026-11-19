from flask import Blueprint, request, jsonify
from datetime import datetime, timezone, timedelta
from database import db
from models import RawMaterial, Warehouse, InventoryBatch, StockMovement
from routes.stockout_risk import calculate_stockout_risk_for_combination
from sqlalchemy import func

reports_bp = Blueprint('reports', __name__)

@reports_bp.route('/inventory-summary', methods=['GET'])
def inventory_summary():
    total_raw_materials = RawMaterial.query.count()
    total_warehouses = Warehouse.query.count()
    
    # Total inventory quantity
    total_quantity = db.session.query(func.sum(InventoryBatch.quantity)).scalar() or 0.0
    
    # Active batches
    active_batches_count = InventoryBatch.query.filter(InventoryBatch.quantity > 0).count()
    
    # Calculate stockout risk for all combinations to get low-stock and reorder metrics
    prediction_date = request.args.get('prediction_date', datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    
    high_risk_count = 0
    reorder_count = 0
    
    all_rms = RawMaterial.query.all()
    all_whs = Warehouse.query.all()
    
    for rm in all_rms:
        for wh in all_whs:
            try:
                risk_data = calculate_stockout_risk_for_combination(rm, wh, prediction_date)
                if risk_data['risk_level'] == 'HIGH':
                    high_risk_count += 1
                if risk_data['reorder_quantity'] > 0:
                    reorder_count += 1
            except Exception:
                pass

    # Expiry
    now = datetime.now(timezone.utc)
    soon_threshold = now + timedelta(days=30)
    
    # SQLite might not support direct date comparison easily if dates are strings, but Flask-SQLAlchemy 
    # handles DateTime objects reasonably well in SQLite if stored correctly.
    # However, filtering in Python is safer for SQLite if we are dealing with mixed timezone awareness.
    all_active_batches = InventoryBatch.query.filter(InventoryBatch.quantity > 0, InventoryBatch.expiry_date != None).all()
    
    expiring_soon = 0
    expired = 0
    for b in all_active_batches:
        expiry = b.expiry_date
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry < now:
            expired += 1
        elif expiry <= soon_threshold:
            expiring_soon += 1
    
    return jsonify({
        'total_raw_materials': total_raw_materials,
        'total_warehouses': total_warehouses,
        'total_inventory_quantity': round(total_quantity, 2),
        'active_inventory_batches': active_batches_count,
        'high_risk_materials': high_risk_count,
        'materials_requiring_reorder': reorder_count,
        'batches_expiring_soon': expiring_soon,
        'expired_batches': expired
    }), 200

@reports_bp.route('/inventory', methods=['GET'])
def inventory_report():
    results = db.session.query(
        RawMaterial.id.label('rm_id'),
        RawMaterial.name.label('rm_name'),
        RawMaterial.unit.label('unit'),
        Warehouse.id.label('wh_id'),
        Warehouse.name.label('wh_name'),
        func.sum(InventoryBatch.quantity).label('current_stock'),
        func.count(InventoryBatch.id).label('number_of_batches')
    ).join(InventoryBatch, RawMaterial.id == InventoryBatch.raw_material_id) \
     .join(Warehouse, Warehouse.id == InventoryBatch.warehouse_id) \
     .group_by(RawMaterial.id, Warehouse.id).all()
     
    data = []
    for r in results:
        data.append({
            'raw_material_id': r.rm_id,
            'raw_material_name': r.rm_name,
            'warehouse_id': r.wh_id,
            'warehouse_name': r.wh_name,
            'unit': r.unit,
            'current_stock': round(r.current_stock, 2),
            'number_of_batches': r.number_of_batches
        })
        
    return jsonify(data), 200

@reports_bp.route('/expiry', methods=['GET'])
def expiry_report():
    batches = db.session.query(
        InventoryBatch, RawMaterial.name.label('rm_name'), Warehouse.name.label('wh_name')
    ).join(RawMaterial).join(Warehouse).filter(InventoryBatch.quantity > 0).all()
    
    now = datetime.now(timezone.utc)
    soon_threshold = now + timedelta(days=30)
    
    data = []
    for b, rm_name, wh_name in batches:
        expiry = b.expiry_date
        
        if not expiry:
            status = 'NO_EXPIRY_DATE'
            days = None
        else:
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            
            days = (expiry - now).days
            if expiry < now:
                status = 'EXPIRED'
            elif expiry <= soon_threshold:
                status = 'EXPIRING_SOON'
            else:
                status = 'VALID'
                
        data.append({
            'batch_id': b.id,
            'batch_number': b.batch_number,
            'raw_material_name': rm_name,
            'warehouse_name': wh_name,
            'quantity': b.quantity,
            'received_date': b.received_date.isoformat(),
            'expiry_date': b.expiry_date.isoformat() if b.expiry_date else None,
            'expiry_status': status,
            'days_until_expiry': days
        })
        
    return jsonify(data), 200

@reports_bp.route('/consumption', methods=['GET'])
def consumption_report():
    rm_id = request.args.get('raw_material_id', type=int)
    wh_id = request.args.get('warehouse_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = db.session.query(
        RawMaterial.name.label('rm_name'),
        RawMaterial.unit.label('unit'),
        Warehouse.name.label('wh_name'),
        func.sum(StockMovement.quantity).label('total_qty'),
        func.count(StockMovement.id).label('count')
    ).join(RawMaterial, RawMaterial.id == StockMovement.raw_material_id) \
     .join(Warehouse, Warehouse.id == StockMovement.warehouse_id) \
     .filter(StockMovement.movement_type == 'CONSUME')
     
    if rm_id:
        query = query.filter(StockMovement.raw_material_id == rm_id)
    if wh_id:
        query = query.filter(StockMovement.warehouse_id == wh_id)
    if start_date:
        query = query.filter(StockMovement.movement_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(StockMovement.movement_date <= datetime.fromisoformat(end_date))
        
    results = query.group_by(RawMaterial.id, Warehouse.id).all()
    
    data = []
    for r in results:
        data.append({
            'raw_material_name': r.rm_name,
            'warehouse_name': r.wh_name,
            'total_consumed_quantity': round(r.total_qty, 2) if r.total_qty else 0.0,
            'consumption_count': r.count,
            'unit': r.unit
        })
        
    return jsonify(data), 200

@reports_bp.route('/wastage', methods=['GET'])
def wastage_report():
    rm_id = request.args.get('raw_material_id', type=int)
    wh_id = request.args.get('warehouse_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = db.session.query(
        RawMaterial.name.label('rm_name'),
        RawMaterial.unit.label('unit'),
        Warehouse.name.label('wh_name'),
        func.sum(StockMovement.quantity).label('total_qty'),
        func.count(StockMovement.id).label('count')
    ).join(RawMaterial, RawMaterial.id == StockMovement.raw_material_id) \
     .join(Warehouse, Warehouse.id == StockMovement.warehouse_id) \
     .filter(StockMovement.movement_type == 'WASTAGE')
     
    if rm_id:
        query = query.filter(StockMovement.raw_material_id == rm_id)
    if wh_id:
        query = query.filter(StockMovement.warehouse_id == wh_id)
    if start_date:
        query = query.filter(StockMovement.movement_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(StockMovement.movement_date <= datetime.fromisoformat(end_date))
        
    results = query.group_by(RawMaterial.id, Warehouse.id).all()
    
    data = []
    for r in results:
        data.append({
            'raw_material_name': r.rm_name,
            'warehouse_name': r.wh_name,
            'total_wastage_quantity': round(r.total_qty, 2) if r.total_qty else 0.0,
            'wastage_count': r.count,
            'unit': r.unit
        })
        
    return jsonify(data), 200

@reports_bp.route('/stock-movements', methods=['GET'])
def stock_movements_report():
    rm_id = request.args.get('raw_material_id', type=int)
    wh_id = request.args.get('warehouse_id', type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = db.session.query(
        StockMovement.movement_type,
        func.sum(StockMovement.quantity).label('total_qty'),
        func.count(StockMovement.id).label('count')
    )
    
    if rm_id:
        query = query.filter(StockMovement.raw_material_id == rm_id)
    if wh_id:
        query = query.filter(StockMovement.warehouse_id == wh_id)
    if start_date:
        query = query.filter(StockMovement.movement_date >= datetime.fromisoformat(start_date))
    if end_date:
        query = query.filter(StockMovement.movement_date <= datetime.fromisoformat(end_date))
        
    results = query.group_by(StockMovement.movement_type).all()
    
    data = []
    for r in results:
        data.append({
            'movement_type': r.movement_type,
            'total_quantity': round(r.total_qty, 2) if r.total_qty else 0.0,
            'count': r.count
        })
        
    return jsonify(data), 200

@reports_bp.route('/warehouse-summary', methods=['GET'])
def warehouse_summary_report():
    results = db.session.query(
        Warehouse.id,
        Warehouse.warehouse_id.label('wh_str_id'),
        Warehouse.name,
        Warehouse.location,
        func.count(func.distinct(InventoryBatch.raw_material_id)).label('num_rm'),
        func.count(InventoryBatch.id).label('num_batches'),
        func.sum(InventoryBatch.quantity).label('total_stock')
    ).outerjoin(InventoryBatch, Warehouse.id == InventoryBatch.warehouse_id) \
     .group_by(Warehouse.id).all()
     
    data = []
    for r in results:
        data.append({
            'warehouse_id': r.id,
            'warehouse_code': r.wh_str_id,
            'warehouse_name': r.name,
            'location': r.location,
            'number_of_raw_materials': r.num_rm,
            'number_of_batches': r.num_batches,
            'total_current_stock': round(r.total_stock, 2) if r.total_stock else 0.0
        })
        
    return jsonify(data), 200

@reports_bp.route('/alerts', methods=['GET'])
def alerts_report():
    prediction_date = request.args.get('prediction_date', datetime.now(timezone.utc).strftime('%Y-%m-%d'))
    
    alerts = []
    
    now = datetime.now(timezone.utc)
    soon_threshold = now + timedelta(days=30)
    
    batches = db.session.query(
        InventoryBatch, RawMaterial.name.label('rm_name'), Warehouse.name.label('wh_name')
    ).join(RawMaterial).join(Warehouse).filter(
        InventoryBatch.quantity > 0,
        InventoryBatch.expiry_date != None
    ).all()
    
    for b, rm_name, wh_name in batches:
        expiry = b.expiry_date
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
            
        if expiry < now:
            alerts.append({
                'type': 'EXPIRED_BATCH',
                'severity': 'HIGH',
                'message': f"Batch {b.batch_number} of {rm_name} in {wh_name} has expired on {expiry.strftime('%Y-%m-%d')}."
            })
        elif expiry <= soon_threshold:
            alerts.append({
                'type': 'EXPIRING_SOON',
                'severity': 'MEDIUM',
                'message': f"Batch {b.batch_number} of {rm_name} in {wh_name} will expire on {expiry.strftime('%Y-%m-%d')}."
            })
            
    all_rms = RawMaterial.query.all()
    all_whs = Warehouse.query.all()
    
    for rm in all_rms:
        for wh in all_whs:
            try:
                risk_data = calculate_stockout_risk_for_combination(rm, wh, prediction_date)
                
                if risk_data['risk_level'] == 'HIGH':
                    alerts.append({
                        'type': 'HIGH_STOCKOUT_RISK',
                        'severity': 'HIGH',
                        'message': f"High stockout risk for {rm.name} in {wh.name} (Coverage: {risk_data['stock_coverage_days']} days)."
                    })
                elif risk_data['risk_level'] == 'MEDIUM':
                    alerts.append({
                        'type': 'MEDIUM_STOCKOUT_RISK',
                        'severity': 'MEDIUM',
                        'message': f"Medium stockout risk for {rm.name} in {wh.name} (Coverage: {risk_data['stock_coverage_days']} days)."
                    })
                    
                if risk_data['reorder_quantity'] > 0:
                    alerts.append({
                        'type': 'REORDER_RECOMMENDED',
                        'severity': 'INFO',
                        'message': f"Reorder recommended for {rm.name} in {wh.name}. Quantity: {risk_data['reorder_quantity']} {rm.unit}."
                    })
            except Exception:
                pass
                
    return jsonify(alerts), 200
