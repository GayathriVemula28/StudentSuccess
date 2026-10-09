from sqlalchemy import inspect, text

from .database import Base
from . import models as _models


LEGACY_USER_COLUMNS = {
    'status': 'VARCHAR',
    'section': 'VARCHAR',
    'personal_email': 'VARCHAR',
    'phone_number': 'VARCHAR',
    'skills': 'VARCHAR',
    'career_goal': 'VARCHAR',
    'created_at': 'DATETIME',
    'approved_at': 'DATETIME',
    'approved_by': 'INTEGER',
}


def upgrade_database(engine) -> None:
    inspector = inspect(engine)
    if inspector.has_table('users'):
        existing_columns = {column['name'] for column in inspector.get_columns('users')}
        with engine.begin() as connection:
            for column, sql_type in LEGACY_USER_COLUMNS.items():
                if column not in existing_columns:
                    connection.execute(text(f'ALTER TABLE users ADD COLUMN {column} {sql_type}'))

            connection.execute(text(
                "UPDATE users SET status = CASE WHEN role IN ('student', 'faculty', 'admin') "
                "THEN 'APPROVED' ELSE 'PENDING' END WHERE status IS NULL OR status = ''"
            ))

    Base.metadata.create_all(bind=engine)