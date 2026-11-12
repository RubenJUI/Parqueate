import psycopg2
from psycopg2.extras import RealDictCursor

from config import DATABASE_URL_OVERRIDE, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_SSLMODE, DB_USER
from models.modulo2_connection import ensure_module2_schema

DATABASE_URL = DATABASE_URL_OVERRIDE or f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={DB_SSLMODE}"

_schema_verified = False


def get_db():
    global _schema_verified
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        if not _schema_verified:
            ensure_module2_schema(conn)
            _schema_verified = True
        yield conn
    finally:
        conn.close()
