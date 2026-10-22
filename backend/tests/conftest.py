"""Configuración de las pruebas: usan una base aparte que se reinicia en cada corrida.

La base se toma de PGTEST_DATABASE (por defecto parqueadero_test) y debe existir:
    createdb -O parqueate parqueadero_test
"""

import os
from datetime import date, timedelta
from pathlib import Path

import pytest

TEST_DB = os.environ.get("PGTEST_DATABASE", "parqueadero_test")
if not TEST_DB.endswith("_test"):
    raise RuntimeError(f"Las pruebas borran los datos de la base; '{TEST_DB}' debe terminar en _test")

# Se define antes de importar la aplicación para que config/ y database/ apunten a la base de pruebas.
os.environ["PGNAMEDATABASE"] = TEST_DB
os.environ.pop("DATABASE_URL", None)

import psycopg2  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from psycopg2.extras import RealDictCursor  # noqa: E402

from auth.auth import get_password_hash  # noqa: E402
from database.database import DATABASE_URL  # noqa: E402
from main import app  # noqa: E402

DATABASE_DIR = Path(__file__).resolve().parent.parent / "database"
TABLAS = ["tiquete", "pago", "tarifa", "usuario", "espacio", "vehiculo", "propietario"]


@pytest.fixture(scope="session")
def db():
    try:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    except psycopg2.OperationalError as exc:
        pytest.exit(f"No se pudo conectar a la base de pruebas '{TEST_DB}'. Créala con: createdb -O parqueate {TEST_DB}\n{exc}")
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute(f"DROP TABLE IF EXISTS {', '.join(TABLAS)} CASCADE")
        cur.execute((DATABASE_DIR / "schema.sql").read_text())
        cur.execute((DATABASE_DIR / "seed.sql").read_text())
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def limpiar(db):
    """Cada prueba empieza sin movimientos, usuarios ni vehículos y con las 80 celdas libres."""
    with db.cursor() as cur:
        cur.execute("TRUNCATE tiquete, pago, vehiculo, propietario, usuario RESTART IDENTITY CASCADE")
        cur.execute("UPDATE espacio SET estado = 'Disponible'")


@pytest.fixture
def client():
    return TestClient(app)


def crear_usuario(db, correo: str, rol: str) -> None:
    with db.cursor() as cur:
        cur.execute(
            "INSERT INTO usuario (nombre, correo, contrasena_hash, rol) VALUES (%s, %s, %s, %s)",
            (f"Usuario {rol}", correo, get_password_hash("clave123"), rol),
        )


def token(client, correo: str) -> dict:
    response = client.post("/auth/token", data={"username": correo, "password": "clave123"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def operario(db, client):
    crear_usuario(db, "operario@test.co", "Operador")
    return token(client, "operario@test.co")


@pytest.fixture
def admin(db, client):
    crear_usuario(db, "admin@test.co", "Administrador")
    return token(client, "admin@test.co")


@pytest.fixture
def registrar(db):
    """Registra un vehículo con su propietario y, si se indica, un pago hace `dias_desde_pago` días."""

    def _registrar(placa: str, tipo: str = "Carro", dias_desde_pago=0):
        with db.cursor() as cur:
            cur.execute(
                """
                INSERT INTO propietario (documento, nombre, telefono, autoriza_datos, fecha_autorizacion)
                VALUES (%s, %s, '3000000000', TRUE, LOCALTIMESTAMP) RETURNING id_propietario
                """,
                (f"doc-{placa}", f"Dueño {placa}"),
            )
            id_propietario = cur.fetchone()["id_propietario"]
            cur.execute(
                "INSERT INTO vehiculo (placa, tipo_vehiculo, id_propietario) VALUES (%s, %s, %s)",
                (placa, tipo, id_propietario),
            )
            if dias_desde_pago is not None:
                cur.execute(
                    "INSERT INTO pago (placa, fecha_pago, monto) VALUES (%s, %s, 250000)",
                    (placa, date.today() - timedelta(days=dias_desde_pago)),
                )

    return _registrar


@pytest.fixture
def ocupacion(client, operario):
    def _ocupacion(tipo: str) -> str:
        fila = next(o for o in client.get("/api/ocupacion", headers=operario).json() if o["tipo_vehiculo"] == tipo)
        return f"{fila['ocupadas']}/{fila['total']}"

    return _ocupacion
