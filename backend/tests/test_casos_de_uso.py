"""Casos de uso 1 a 7 del documento de requerimientos, ejecutados contra la API.

Las fechas del documento se reproducen relativas a hoy: "pago del 13/10/2026 y entrada el
11/11/2026" equivale a un pago de hace 29 días (día 30 de la vigencia).
"""

from datetime import date, timedelta


def test_cu1_entrada_el_ultimo_dia_de_vigencia(client, operario, registrar, ocupacion):
    registrar("ABC123", dias_desde_pago=29)

    response = client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}, headers=operario)

    assert response.status_code == 201
    entrada = response.json()
    assert entrada["numero_espacio"].startswith("C-")
    assert entrada["alerta"] == "Su mensualidad vence hoy"
    assert entrada["fecha_vencimiento"] == date.today().isoformat()
    assert entrada["usuario_entrada"] == "Usuario Operador"
    assert ocupacion("Carro") == "1/70"


def test_cu2_mensualidad_vencida(client, operario, registrar, ocupacion):
    registrar("ABC123", dias_desde_pago=30)

    response = client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}, headers=operario)

    assert response.status_code == 409
    ayer = date.today() - timedelta(days=1)
    assert response.json()["detail"] == f"Mensualidad vencida el {ayer:%d/%m/%Y}"
    assert ocupacion("Carro") == "0/70"


def test_cu3_placa_no_registrada(client, operario):
    response = client.post("/api/tiquetes/entrada", json={"placa": "ZZZ999"}, headers=operario)

    assert response.status_code == 404
    assert response.json()["detail"] == "El vehículo no está asociado a ningún usuario registrado"
    assert client.get("/api/tiquetes", headers=operario).json() == []


def test_cu4_doble_ingreso_indica_la_celda(client, operario, registrar):
    registrar("ABC123")
    primera = client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}, headers=operario).json()

    response = client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}, headers=operario)

    assert response.status_code == 409
    assert response.json()["detail"] == f"El vehículo ya se encuentra dentro del parqueadero en la celda {primera['numero_espacio']}"
    assert len(client.get("/api/tiquetes", headers=operario).json()) == 1


def test_cu5_ultima_celda_de_moto(client, operario, registrar, ocupacion):
    for n in range(9):
        registrar(f"MOT{n}0A", tipo="Moto")
        assert client.post("/api/tiquetes/entrada", json={"placa": f"MOT{n}0A"}, headers=operario).status_code == 201
    registrar("MOT99Z", tipo="Moto")
    assert ocupacion("Moto") == "9/10"

    response = client.post("/api/tiquetes/entrada", json={"placa": "MOT99Z"}, headers=operario)

    assert response.status_code == 201
    assert response.json()["numero_espacio"] == "M-10"
    assert ocupacion("Moto") == "10/10"


def test_cu6_salida_libera_la_celda(client, operario, registrar, ocupacion):
    registrar("ABC123")
    entrada = client.post("/api/tiquetes/entrada", json={"placa": "ABC123"}, headers=operario).json()
    assert ocupacion("Carro") == "1/70"

    response = client.post("/api/tiquetes/salida", json={"placa": "ABC123"}, headers=operario)

    assert response.status_code == 200
    salida = response.json()
    assert salida["estado"] == "Finalizado"
    assert salida["fecha_hora_salida"] is not None
    assert ocupacion("Carro") == "0/70"
    libres = client.get("/api/espacios?estado=Disponible&tipo_permitido=Carro", headers=operario).json()
    assert entrada["id_espacio"] in [c["id_espacio"] for c in libres]


def test_cu7_salida_sin_entrada(client, operario, registrar, ocupacion):
    registrar("ABC123")

    response = client.post("/api/tiquetes/salida", json={"placa": "ABC123"}, headers=operario)

    assert response.status_code == 404
    assert response.json()["detail"] == "El vehículo no tiene entrada registrada"
    assert client.get("/api/tiquetes", headers=operario).json() == []
    assert ocupacion("Carro") == "0/70"
