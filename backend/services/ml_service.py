import os
import joblib
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore', category=UserWarning)

MIN_HISTORY_DAYS = 28          # lag_28 / rolling_28 features need 28 days of history
STALE_AFTER_DAYS = 7           # warn when the newest history is older than this before the target date


class ForecastError(ValueError):
    """A forecast could not be produced. `code` is machine readable, `status` is the HTTP status to use."""

    def __init__(self, message, code, status=422):
        super().__init__(message)
        self.code = code
        self.status = status


class MLService:
    def __init__(self):
        self.model = None
        self.encoder = None
        self.feature_config = None
        self.historical_data = None
        self.load_error = None
        self._coverage = {}
        self._load_artifacts()
        
    def _load_artifacts(self):
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        ml_dir = os.path.join(base_dir, 'ml')
        data_dir = os.path.join(base_dir, 'data')
        
        try:
            import sys
            import sklearn._loss
            
            # Patch missing class in newer scikit-learn versions
            if not hasattr(sklearn._loss, 'CyHalfSquaredError'):
                sklearn._loss.CyHalfSquaredError = getattr(sklearn._loss, 'HalfSquaredError', None)
                
            # Alias the old internal module paths used during pickling
            sys.modules['_loss'] = sklearn._loss
            sys.modules['sklearn.ensemble._loss'] = sklearn._loss
            
            self.model = joblib.load(os.path.join(ml_dir, 'gradient_boosting_model.pkl'))
            self.encoder = joblib.load(os.path.join(ml_dir, 'onehot_encoder.pkl'))
            self.feature_config = joblib.load(os.path.join(ml_dir, 'feature_config.pkl'))
            
            # Load dataset for historical features
            self.historical_data = pd.read_excel(os.path.join(data_dir, 'raw_material_demand_dataset.xlsx'))
            self.historical_data['date'] = pd.to_datetime(self.historical_data['date'])
            self.historical_data = self.historical_data.sort_values(by=['raw_material_id', 'warehouse_id', 'date'])

            grouped = self.historical_data.groupby(['raw_material_id', 'warehouse_id'])['date'].agg(['count', 'min', 'max'])
            self._coverage = {
                key: {'days': int(row['count']), 'start': row['min'], 'end': row['max']}
                for key, row in grouped.iterrows()
            }
        except Exception as e:
            self.load_error = f'{type(e).__name__}: {e}'
            print(f"Warning: Failed to load ML artifacts: {self.load_error}")

    def is_known_to_model(self, raw_material_string_id, warehouse_string_id):
        """True only if the OneHotEncoder was fitted on both IDs (i.e. the model has seen them in training)."""
        if self.encoder is None:
            return False
        rm_cats, wh_cats = self.encoder.categories_
        return raw_material_string_id in set(rm_cats) and warehouse_string_id in set(wh_cats)

    def coverage(self, raw_material_string_id, warehouse_string_id):
        return self._coverage.get((raw_material_string_id, warehouse_string_id))

    def history_context(self, raw_material_string_id, warehouse_string_id, target_date, recent_days=14):
        """Actual consumption history (from the training dataset) strictly before target_date."""
        df = self.historical_data[
            (self.historical_data['raw_material_id'] == raw_material_string_id) &
            (self.historical_data['warehouse_id'] == warehouse_string_id) &
            (self.historical_data['date'] < target_date)
        ]
        if df.empty:
            return None
        end = df['date'].max()
        last_28 = df.tail(MIN_HISTORY_DAYS)['consumed_quantity']
        recent = df.tail(recent_days)
        gap_days = max(0, int((target_date - end).days) - 1)
        return {
            'points': int(len(df)),
            'start_date': df['date'].min().date().isoformat(),
            'end_date': end.date().isoformat(),
            'gap_days': gap_days,
            'is_stale': gap_days > STALE_AFTER_DAYS,
            'average_last_28_days': round(float(last_28.mean()), 2),
            'recent': [
                {'date': d.date().isoformat(), 'consumed_quantity': round(float(q), 2)}
                for d, q in zip(recent['date'], recent['consumed_quantity'])
            ],
            'source': 'raw_material_demand_dataset.xlsx',
        }

    def forecast_demand(self, raw_material_string_id, warehouse_string_id, target_date_str):
        if self.model is None:
            detail = f" ({self.load_error})" if self.load_error else ""
            raise ForecastError(f"The forecasting model or its historical dataset could not be loaded{detail}.", 'MODEL_UNAVAILABLE', 503)

        try:
            target_date = pd.to_datetime(target_date_str)
        except (ValueError, TypeError):
            raise ForecastError("prediction_date must be a valid date in YYYY-MM-DD format.", 'INVALID_DATE', 400)
        if pd.isna(target_date):
            raise ForecastError("prediction_date must be a valid date in YYYY-MM-DD format.", 'INVALID_DATE', 400)

        if not self.is_known_to_model(raw_material_string_id, warehouse_string_id):
            raise ForecastError(
                f"The trained model has not seen this material/warehouse combination "
                f"({raw_material_string_id} / {warehouse_string_id}). It only knows the materials and warehouses it was trained on, "
                f"so a forecast cannot be generated without retraining the model on historical consumption for it.",
                'UNSUPPORTED_ENTITY',
            )
        
        # Filter historical data strictly before target date
        df = self.historical_data[
            (self.historical_data['raw_material_id'] == raw_material_string_id) &
            (self.historical_data['warehouse_id'] == warehouse_string_id) &
            (self.historical_data['date'] < target_date)
        ].copy()
        
        if len(df) == 0:
            raise ForecastError(
                f"There is no historical consumption data for {raw_material_string_id} in {warehouse_string_id} before "
                f"{target_date.date().isoformat()}, so no forecast can be generated.", 'NO_HISTORY')
        if len(df) < MIN_HISTORY_DAYS:
            raise ForecastError(
                f"Only {len(df)} days of historical consumption exist for {raw_material_string_id} in {warehouse_string_id} "
                f"before {target_date.date().isoformat()}; the model needs at least {MIN_HISTORY_DAYS} days to build its lag features.",
                'INSUFFICIENT_HISTORY')
            
        # Get the last 28 days of consumed_quantity
        last_28 = df.tail(28)['consumed_quantity'].values
        
        lag_1 = last_28[-1]
        lag_7 = last_28[-7]
        lag_14 = last_28[-14]
        lag_28 = last_28[-28]
        
        rolling_mean_7 = np.mean(last_28[-7:])
        rolling_mean_14 = np.mean(last_28[-14:])
        rolling_mean_28 = np.mean(last_28[-28:])
        
        rolling_std_7 = np.std(last_28[-7:], ddof=1) if len(last_28[-7:]) > 1 else 0
        rolling_std_28 = np.std(last_28[-28:], ddof=1) if len(last_28[-28:]) > 1 else 0
        
        if np.isnan(rolling_std_7): rolling_std_7 = 0
        if np.isnan(rolling_std_28): rolling_std_28 = 0

        day_of_week = target_date.dayofweek
        month_num = target_date.month
        week_of_year = target_date.isocalendar().week
        quarter = target_date.quarter
        year = target_date.year
        
        input_data = pd.DataFrame([{
            'raw_material_id': raw_material_string_id,
            'warehouse_id': warehouse_string_id,
            'day_of_week': day_of_week,
            'month_num': month_num,
            'week_of_year': week_of_year,
            'quarter': quarter,
            'year': year,
            'lag_1': lag_1,
            'lag_7': lag_7,
            'lag_14': lag_14,
            'lag_28': lag_28,
            'rolling_mean_7': rolling_mean_7,
            'rolling_mean_14': rolling_mean_14,
            'rolling_mean_28': rolling_mean_28,
            'rolling_std_7': rolling_std_7,
            'rolling_std_28': rolling_std_28
        }])
        
        # Categorical Encoding
        cat_cols = ['raw_material_id', 'warehouse_id']
        encoded_cats = self.encoder.transform(input_data[cat_cols])
        encoded_df = pd.DataFrame(encoded_cats, columns=self.encoder.get_feature_names_out(cat_cols))
        
        # Combine numerical and encoded categoricals
        num_cols = input_data.drop(columns=cat_cols)
        final_input = pd.concat([num_cols.reset_index(drop=True), encoded_df.reset_index(drop=True)], axis=1)
        
        # We don't filter by feature_config['feature_columns'] because it contains the 16 original unencoded columns.
        # The model expects the 27 encoded columns. The order is typically numeric followed by encoded categoricals.
        
        prediction = self.model.predict(final_input)[0]
        return max(0, prediction)

# Initialize a singleton instance
ml_service = MLService()
