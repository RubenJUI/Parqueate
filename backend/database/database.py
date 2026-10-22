import psycopg2
from psycopg2.extras import RealDictCursor

from config import DATABASE_URL_OVERRIDE, DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_SSLMODE, DB_USER

DATABASE_URL = DATABASE_URL_OVERRIDE or f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={DB_SSLMODE}"


def get_db():
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        yield conn
    finally:
        conn.close()
