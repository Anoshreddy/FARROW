import re

ID_PATTERN = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]*$')


def clean_text(value):
    """Return a stripped string, or None when the value is missing / not a string."""
    if value is None or not isinstance(value, str):
        return None
    return value.strip()


def validate_fields(data, spec):
    """Validate a JSON body against spec = {field: (label, max_length)}.

    Returns (cleaned, errors). `errors` maps field -> message, so the UI can show it per field.
    """
    cleaned, errors = {}, {}
    for field, (label, max_len) in spec.items():
        value = clean_text(data.get(field))
        if not value:
            errors[field] = f'{label} is required.'
        elif len(value) > max_len:
            errors[field] = f'{label} must be at most {max_len} characters.'
        else:
            cleaned[field] = value
    return cleaned, errors


def validate_business_id(value, label):
    if value and not ID_PATTERN.match(value):
        return f'{label} may only contain letters, numbers, hyphens and underscores.'
    return None


def error_response(jsonify, errors, status=400):
    first = next(iter(errors.values()))
    return jsonify({'error': first, 'fields': errors}), status
