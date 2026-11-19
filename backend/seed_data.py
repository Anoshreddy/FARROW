"""Documented seed command for FARROW demo data.

    python seed_data.py            # insert any missing demo warehouses / raw materials
    python seed_data.py --status   # only show what is in the database

Safe to run any number of times: existing records are never modified or duplicated.
Records created here are flagged is_demo = true.
"""
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import app, DB_PATH  # noqa: E402
import db_init  # noqa: E402


def seed_data():
    with app.app_context():
        print(f'Database: {DB_PATH}')
        print(f'Before:   {db_init.table_counts()}')
        result = db_init.seed_demo_data()
        print(f'Result:   {result}')
        print(f'After:    {db_init.table_counts()}')
        return result


if __name__ == '__main__':
    if '--status' in sys.argv:
        with app.app_context():
            print(f'Database: {DB_PATH}')
            print(db_init.table_counts())
    else:
        seed_data()
