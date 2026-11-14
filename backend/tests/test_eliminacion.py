"""HU-U08: eliminar un usuario o vehículo registrado por error.

Criterios:
- Solo el administrador puede eliminar (cubierto en test_reglas.py).
- Solo se elimina si no tiene entradas, salidas, novedades ni pagos recibidos en caja; el pago
  inicial que el sistema genera al registrar el vehículo no cuenta como movimiento.
- Si tiene movimientos, se rechaza, se informa cuáles tiene, se sugiere inactivar y el historial
  se conserva completo.
- Al eliminar un usuario se eliminan sus vehículos, siempre que ninguno tenga movimientos.
- Se exige el motivo y queda registrado quién eliminó, cuándo y por qué.
"""

import pytest

MOTIVO = "Registrado por error en el turno"


@pytest.fixture
def registrar_usuario(client, operario):
    """Registra por la API un usuario con su vehículo, como lo hace el operario (HU-U01)."""

    def _registrar(placa: str = "ABC123", documento: str = "1036111111") -> dict:
        response = client.post(
            "/api/usuarios",
            json={
                "documentoTipo": "CC",
                "documento": documento,
                "nombres": "Ana",
                "apellidos": "Restrepo",
                "celular": "3001234567",
                "correo": "",
                "tipo": "Carro",
                "placa": placa,
                "marca": "Mazda",
                "color": "Rojo",
                "autorizacionHabeasData": True,
            },
            headers=operario,
        )
        assert response.status_code in (200, 201), response.text
        return response.json()

    return _registrar


def eliminar(client, url: str, headers: dict, motivo: str = MOTIVO):
    return client.request("DELETE", url, json={"motivo": motivo}, headers=headers)


def contar(db, sql: str, *params) -> int:
    with db.cursor() as cur:
        cur.execute(sql, params)
        return list(cur.fetchone().values())[0]


def test_hu_u08_elimina_usuario_sin_movimientos_y_deja_constancia(client, admin, registrar_usuario, db):
    usuario = registrar_usuario()

    response = eliminar(client, f"/api/usuarios/{usuario['id']}", admin)

    assert response.status_code == 200, response.text
    assert contar(db, "SELECT COUNT(*) FROM propietario") == 0
    assert contar(db, "SELECT COUNT(*) FROM vehiculo") == 0
    assert contar(db, "SELECT COUNT(*) FROM pago") == 0  # el pago automático del registro se va con él
    with db.cursor() as cur:
        cur.execute("SELECT * FROM registro_eliminacion")
        constancia = cur.fetchone()
    assert constancia["tipo_registro"] == "Usuario"
    assert constancia["documento"] == "1036111111"
    assert constancia["placas"] == "ABC123"
    assert constancia["motivo"] == MOTIVO
    assert constancia["usuario_responsable"] == "Usuario Administrador"
    assert constancia["fecha_eliminacion"] is not None


def test_hu_u08_elimina_vehiculo_sin_movimientos_y_lo_registra_en_el_historial(client, admin, operario, registrar_usuario, db):
    usuario = registrar_usuario()
    otro = client.post(
        f"/api/usuarios/{usuario['id']}/vehiculos",
        json={"placa": "XYZ987", "tipo": "Carro", "marca": "Kia", "color": "Gris"},
        headers=operario,
    )
    assert otro.status_code in (200, 201), otro.text

    response = eliminar(client, "/api/vehiculos/XYZ987", admin)

    assert response.status_code == 200, response.text
    assert [v["placa"] for v in response.json()["vehiculos"]] == ["ABC123"]
    eventos = [log for log in response.json()["auditLogs"] if log.get("placa") == "XYZ987" and log.get("motivo") == MOTIVO]
    assert eventos and eventos[0]["usuario"] == "Usuario Administrador"
    assert contar(db, "SELECT COUNT(*) FROM registro_eliminacion WHERE tipo_registro = 'Vehiculo' AND placas = 'XYZ987'") == 1


def test_hu_u08_rechaza_si_tiene_entradas_y_conserva_el_historial(client, admin, operario, registrar_usuario, db):
    usuario = registrar_usuario()
    assert client.post("/api/tiquetes/entrada", json={"placa": "ABC123", "novedad": "Rayón"}, headers=operario).status_code == 201
    assert client.post("/api/tiquetes/salida", json={"placa": "ABC123"}, headers=operario).status_code == 200

    por_vehiculo = eliminar(client, "/api/vehiculos/ABC123", admin)
    por_usuario = eliminar(client, f"/api/usuarios/{usuario['id']}", admin)

    assert por_vehiculo.status_code == 409
    assert por_vehiculo.json()["detail"] == (
        "No se puede eliminar el vehículo ABC123 porque tiene 1 registro de entrada/salida. "
        "Su historial se conserva: inactívelo en su lugar."
    )
    assert por_usuario.status_code == 409
    assert "inactívelo en su lugar" in por_usuario.json()["detail"]
    assert contar(db, "SELECT COUNT(*) FROM tiquete WHERE placa = 'ABC123'") == 1
    assert contar(db, "SELECT COUNT(*) FROM pago WHERE placa = 'ABC123'") == 1
    assert contar(db, "SELECT COUNT(*) FROM propietario") == 1
    assert contar(db, "SELECT COUNT(*) FROM registro_eliminacion") == 0


def test_hu_u08_un_registro_anulado_tambien_cuenta_como_movimiento(client, admin, operario, registrar_usuario):
    registrar_usuario()
    entrada = client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}, headers=operario).json()
    client.post(f"/api/tiquetes/{entrada['id_tiquete']}/anular", json={"motivo": "Error de digitación"}, headers=admin)

    assert eliminar(client, "/api/vehiculos/ABC123", admin).status_code == 409


def test_hu_u08_rechaza_si_tiene_pagos_en_caja(client, admin, registrar_usuario, db):
    usuario = registrar_usuario()
    with db.cursor() as cur:
        cur.execute("INSERT INTO pago (placa, fecha_pago, monto) VALUES ('ABC123', CURRENT_DATE, 250000)")

    response = eliminar(client, f"/api/usuarios/{usuario['id']}", admin)

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "No se puede eliminar el usuario porque sus vehículos tienen 1 pago de mensualidad recibido. "
        "Su historial se conserva: inactívelo en su lugar."
    )
    assert contar(db, "SELECT COUNT(*) FROM pago WHERE placa = 'ABC123'") == 2


@pytest.mark.parametrize("motivo", ["", "   "])
def test_hu_u08_exige_motivo(client, admin, registrar_usuario, db, motivo):
    usuario = registrar_usuario()

    response = eliminar(client, f"/api/usuarios/{usuario['id']}", admin, motivo=motivo)

    assert response.status_code == 400
    assert response.json()["detail"] == "Es obligatorio indicar el motivo de la eliminación."
    assert contar(db, "SELECT COUNT(*) FROM propietario") == 1
