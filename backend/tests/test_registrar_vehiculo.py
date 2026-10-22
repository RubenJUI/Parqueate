"""Herramienta de precondiciones: registro de vehículos, cupo garantizado y Habeas Data."""

import os
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def registrar(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "registrar_vehiculo.py", *args],
        cwd=BACKEND_DIR,
        env={**os.environ},
        capture_output=True,
        text=True,
    )


def contar(db, sql: str, *params) -> int:
    with db.cursor() as cur:
        cur.execute(sql, params)
        return list(cur.fetchone().values())[0]


def test_registra_propietario_vehiculo_y_pago(db):
    result = registrar("xyz-987", "carro", "1036999999", "Ana Restrepo", "3001234567", "--autoriza-datos")

    assert result.returncode == 0, result.stdout
    assert "Pago registrado: $250.000 COP" in result.stdout
    with db.cursor() as cur:
        cur.execute("SELECT autoriza_datos, fecha_autorizacion FROM propietario WHERE documento = '1036999999'")
        propietario = cur.fetchone()
    assert propietario["autoriza_datos"] and propietario["fecha_autorizacion"]
    assert contar(db, "SELECT COUNT(*) FROM pago WHERE placa = 'XYZ987'") == 1


def test_rnf10_sin_autorizacion_no_registra_nada(db):
    result = registrar("XYZ987", "Carro", "1036999999", "Ana Restrepo", "3001234567")

    assert result.returncode == 1
    assert "Ley 1581" in result.stdout
    assert contar(db, "SELECT COUNT(*) FROM propietario") == 0


def test_renovacion_reutiliza_propietario_y_vehiculo(db):
    hace_10_dias = (date.today() - timedelta(days=10)).isoformat()
    registrar("XYZ987", "Carro", "1036999999", "Ana Restrepo", "3001234567", hace_10_dias, "--autoriza-datos")

    result = registrar("XYZ987", "Carro", "1036999999", "Ana Restrepo", "3001234567")

    assert result.returncode == 0, result.stdout
    assert contar(db, "SELECT COUNT(*) FROM pago WHERE placa = 'XYZ987'") == 2
    assert contar(db, "SELECT COUNT(*) FROM propietario") == 1


def test_rechaza_fecha_futura_y_placa_de_otro_propietario(db):
    manana = (date.today() + timedelta(days=1)).isoformat()
    assert "no puede ser posterior a hoy" in registrar("XYZ987", "Carro", "1", "A", "3", manana, "--autoriza-datos").stdout

    registrar("XYZ987", "Carro", "1", "A", "3", "--autoriza-datos")
    result = registrar("XYZ987", "Carro", "2", "B", "3", "--autoriza-datos")
    assert "a nombre de otro propietario" in result.stdout
    assert contar(db, "SELECT COUNT(*) FROM propietario") == 1


def test_cupo_garantizado_de_motos(db):
    with db.cursor() as cur:
        cur.execute(
            """
            INSERT INTO propietario (documento, nombre, autoriza_datos, fecha_autorizacion)
            VALUES ('100', 'Dueño', TRUE, LOCALTIMESTAMP);
            INSERT INTO vehiculo (placa, tipo_vehiculo, id_propietario)
            SELECT 'MOT' || n || '0A', 'Moto', 1 FROM generate_series(0, 9) AS n;
            INSERT INTO pago (placa, fecha_pago, monto) SELECT placa, CURRENT_DATE, 100000 FROM vehiculo;
            """
        )

    lleno = registrar("MOT11A", "Moto", "100", "Dueño", "3")
    assert lleno.returncode == 1
    assert "no hay cupo para Moto" in lleno.stdout
    assert contar(db, "SELECT COUNT(*) FROM vehiculo WHERE placa = 'MOT11A'") == 0

    renovacion = registrar("MOT00A", "Moto", "100", "Dueño", "3")
    assert renovacion.returncode == 0, renovacion.stdout

    hace_un_mes = (date.today() - timedelta(days=40)).isoformat()
    assert registrar("MOT11A", "Moto", "100", "Dueño", "3", hace_un_mes).returncode == 0
