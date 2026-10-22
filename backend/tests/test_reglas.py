"""Reglas y requerimientos que no cubren directamente los casos de uso."""

from datetime import date


def test_rf04_alerta_tres_dias(client, operario, registrar):
    registrar("DEF456", dias_desde_pago=26)

    entrada = client.post("/api/tiquetes/entrada", json={"placa": "DEF456"}, headers=operario).json()

    assert entrada["alerta"] == "Su mensualidad vence en 3 días"


def test_sin_mensualidad_registrada(client, operario, registrar):
    registrar("PQR56B", dias_desde_pago=None)

    response = client.post("/api/tiquetes/entrada", json={"placa": "PQR56B"}, headers=operario)

    assert response.status_code == 409
    assert response.json()["detail"] == "El vehículo no tiene una mensualidad registrada"


def test_rn01_moto_no_entra_en_celda_de_carro(client, operario, registrar):
    registrar("MOT01A", tipo="Moto")
    celda_carro = client.get("/api/espacios?tipo_permitido=Carro", headers=operario).json()[0]

    response = client.post("/api/tiquetes/entrada", json={"placa": "MOT01A", "id_espacio": celda_carro["id_espacio"]}, headers=operario)

    assert response.status_code == 409
    assert response.json()["detail"] == f"La celda {celda_carro['numero_espacio']} no es para Moto"


def test_rf05_asignacion_manual_y_cambio_de_celda(client, operario, registrar):
    registrar("ABC123")
    celdas = client.get("/api/espacios?tipo_permitido=Carro", headers=operario).json()

    entrada = client.post("/api/tiquetes/entrada", json={"placa": "ABC123", "id_espacio": celdas[9]["id_espacio"]}, headers=operario).json()
    assert entrada["numero_espacio"] == "C-10"

    cambio = client.put(f"/api/tiquetes/{entrada['id_tiquete']}/espacio", json={"id_espacio": celdas[19]["id_espacio"]}, headers=operario)
    assert cambio.json()["numero_espacio"] == "C-20"
    libres = [c["numero_espacio"] for c in client.get("/api/espacios?estado=Disponible&tipo_permitido=Carro", headers=operario).json()]
    assert "C-10" in libres and "C-20" not in libres


def test_rf06_sin_celdas_libres(client, operario, registrar, db):
    registrar("MOT01A", tipo="Moto")
    with db.cursor() as cur:
        cur.execute("UPDATE espacio SET estado = 'Mantenimiento' WHERE tipo_permitido = 'Moto'")

    response = client.post("/api/tiquetes/entrada", json={"placa": "MOT01A"}, headers=operario)

    assert response.status_code == 409
    assert response.json()["detail"] == "No hay celdas disponibles para Moto. Avise al administrador"


def test_rf11_historial_con_filtros(client, operario, registrar):
    registrar("ABC123")
    registrar("DEF456")
    for placa in ("ABC123", "DEF456"):
        client.post("/api/tiquetes/entrada", json={"placa": placa}, headers=operario)

    assert [t["placa"] for t in client.get("/api/tiquetes?placa=abc-123", headers=operario).json()] == ["ABC123"]
    hoy = date.today().isoformat()
    assert len(client.get(f"/api/tiquetes?desde={hoy}&hasta={hoy}", headers=operario).json()) == 2
    assert client.get("/api/tiquetes?desde=2000-01-01&hasta=2000-01-31", headers=operario).json() == []


def test_rf12_y_rf13_vehiculos_dentro_con_novedad(client, operario, registrar):
    registrar("ABC123")
    client.post("/api/tiquetes/entrada", json={"placa": "ABC123", "novedad": "Rayón en la puerta"}, headers=operario)

    dentro = client.get("/api/tiquetes?abiertos=true", headers=operario).json()

    assert len(dentro) == 1
    assert dentro[0]["novedad_entrada"] == "Rayón en la puerta"
    assert dentro[0]["numero_espacio"] and dentro[0]["fecha_hora_entrada"]


def test_rnf03_requiere_autenticacion(client):
    assert client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}).status_code == 401
    assert client.post("/auth/token", data={"username": "nadie@test.co", "password": "x"}).status_code == 401


def test_rnf05_solo_el_administrador_anula_y_el_registro_se_conserva(client, operario, admin, registrar, ocupacion):
    registrar("ABC123")
    entrada = client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}, headers=operario).json()
    url = f"/api/tiquetes/{entrada['id_tiquete']}/anular"

    assert client.post(url, json={"motivo": "Error de digitación"}, headers=operario).status_code == 403

    anulado = client.post(url, json={"motivo": "Error de digitación"}, headers=admin).json()
    assert anulado["estado"] == "Anulado"
    assert anulado["usuario_anulacion"] == "Usuario Administrador"
    assert ocupacion("Carro") == "0/70"
    assert [t["estado"] for t in client.get("/api/tiquetes", headers=admin).json()] == ["Anulado"]


def test_rnf05_no_hay_endpoints_de_borrado(client, admin):
    assert client.delete("/api/tiquetes/1", headers=admin).status_code == 405


def test_pago_futuro_no_da_vigencia(client, operario, registrar, db):
    registrar("ABC123", dias_desde_pago=None)
    with db.cursor() as cur:
        cur.execute("INSERT INTO pago (placa, fecha_pago, monto) VALUES ('ABC123', CURRENT_DATE + 5, 250000)")

    response = client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}, headers=operario)

    assert response.status_code == 409
    assert response.json()["detail"] == "El vehículo no tiene una mensualidad registrada"
