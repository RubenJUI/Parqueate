import os

from dotenv import load_dotenv

load_dotenv()

DB_NAME = os.getenv("PGNAMEDATABASE", "parqueadero_autos_colombia")
DB_USER = os.getenv("PGUSER", "postgres")
DB_HOST = os.getenv("PGHOST", "localhost")
DB_PASSWORD = os.getenv("PGPASSWORD", "")
DB_PORT = os.getenv("PGPORT", "5432")
DB_SSLMODE = os.getenv("PGSSLMODE", "prefer")

# Si se define, se usa tal cual (por ejemplo, el connection string de un proveedor cloud)
# en vez de construirlo a partir de las variables PG* individuales.
DATABASE_URL_OVERRIDE = os.getenv("DATABASE_URL", "")

SECRET_KEY = os.getenv("SECRET_KEY", "")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# Lista separada por comas de origenes permitidos para CORS (ej: http://localhost:5173).
_allowed_origins_raw = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = ["*"] if _allowed_origins_raw == "*" else [o.strip() for o in _allowed_origins_raw.split(",") if o.strip()]

# RN-04 / RNF-08: dias de vigencia de la mensualidad (el dia del pago cuenta como dia 1)
# y dias antes del vencimiento a partir de los cuales se alerta (RF-04).
DIAS_VIGENCIA = int(os.getenv("DIAS_VIGENCIA", "30"))
DIAS_ALERTA = int(os.getenv("DIAS_ALERTA", "3"))
