"""HU-C01, HU-C05, HU-C06 y HU-C07: conversión de celdas y su restablecimiento.

- HU-C05: una celda de carro libre pasa a 2 celdas de moto con los siguientes códigos (C-20 -> M-11 y M-12).
- HU-C06: una pareja fija de motos originales libres pasa a 1 celda de carro (M-05 y M-06 -> C-71).
- HU-C07: se restablece el espacio original; las celdas resultantes deben estar libres y los códigos no se reutilizan.
- HU-C01: las celdas convertidas se muestran en su espacio original (espacio_original).
"""

import pytest

MOTIVO = "Ajuste por demanda del turno"


def convertir(client, codigo, headers, motivo=MOTIVO):
    return client.post(f"/api/celdas/{codigo}/convertir", json={"motivo": motivo}, headers=headers)


def restablecer(client, codigo, headers, motivo=MOTIVO):
    return client.post(f"/api/celdas/{codigo}/restablecer", json={"motivo": motivo}, headers=headers)


def mapa(client, headers) -> dict:
    return {c["codigo"]: c for c in client.get("/api/celdas", headers=headers).json()}


def entrar(client, placa, codigo, headers):
    celda = mapa(client, headers)[codigo]
    response = client.post("/api/tiquetes/entrada", json={"placa": placa, "id_espacio": celda["id"]}, headers=headers)
    assert response.status_code in (200, 201), response.text


def test_hu_c05_convierte_celda_de_carro_en_dos_de_moto(client, admin, ocupacion):
    response = convertir(client, "C-20", admin)

    assert response.status_code == 200, response.text
    celdas = mapa(client, admin)
    assert "C-20" not in celdas
    for codigo in ("M-11", "M-12"):
        assert celdas[codigo]["tipo"] == "Moto"
        assert celdas[codigo]["estado"] == "Libre"
        assert celdas[codigo]["espacio_original"] == "C-20"
        assert celdas[codigo]["tipo_original"] == "Carro"
    assert celdas["M-11"]["historial"][0]["accion"] == "Conversión a moto: M-11 y M-12, antes C-20"
    # El cambio se ve de inmediato en el resumen de ocupación.
    assert ocupacion("Carro") == "0/69"
    assert ocupacion("Moto") == "0/12"


def test_hu_c05_las_celdas_nuevas_se_asignan_de_forma_independiente(client, admin, operario, registrar):
    convertir(client, "C-20", admin)
    registrar("MOT01A", "Moto")
    registrar("MOT02B", "Moto")

    entrar(client, "MOT01A", "M-11", operario)
    entrar(client, "MOT02B", "M-12", operario)

    celdas = mapa(client, admin)
    assert celdas["M-11"]["placa"] == "MOT01A"
    assert celdas["M-12"]["placa"] == "MOT02B"


def test_hu_c05_rechaza_si_la_celda_esta_ocupada(client, admin, operario, registrar):
    registrar("ABC123")
    entrar(client, "ABC123", "C-20", operario)

    response = convertir(client, "C-20", admin)

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "No se puede convertir la celda C-20 a moto: la celda C-20 está ocupada por el vehículo ABC123."
    )


def test_hu_c05_valida_el_cupo_garantizado(client, admin, registrar, db):
    registrar("ABC123")
    with db.cursor() as cur:
        cur.execute("UPDATE espacio SET estado = 'Mantenimiento' WHERE tipo_permitido = 'Carro' AND numero_espacio <> 'C-30'")

    response = convertir(client, "C-30", admin)

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "No se puede convertir la celda C-30 a moto: quedarían 0 celdas de carro utilizables "
        "para 1 cliente con mensualidad vigente."
    )


def test_hu_c06_convierte_pareja_de_motos_en_una_de_carro(client, admin, ocupacion):
    response = convertir(client, "M-06", admin)

    assert response.status_code == 200, response.text
    celdas = mapa(client, admin)
    assert "M-05" not in celdas and "M-06" not in celdas
    assert celdas["C-71"]["tipo"] == "Carro"
    assert celdas["C-71"]["espacio_original"] == "M-05 y M-06"
    assert celdas["C-71"]["historial"][0]["accion"] == "Conversión a carro: C-71, antes M-05 y M-06"
    assert ocupacion("Carro") == "0/71"
    assert ocupacion("Moto") == "0/8"


def test_hu_c06_rechaza_si_una_moto_de_la_pareja_esta_ocupada(client, admin, operario, registrar):
    registrar("MOT01A", "Moto")
    entrar(client, "MOT01A", "M-06", operario)

    response = convertir(client, "M-05", admin)

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "No se puede convertir la pareja M-05 y M-06 a carro: la celda M-06 está ocupada por la moto MOT01A."
    )


def test_hu_c06_y_c07_una_celda_resultante_no_se_vuelve_a_convertir(client, admin):
    convertir(client, "C-20", admin)

    response = convertir(client, "M-11", admin)

    assert response.status_code == 400
    assert "resulta de una conversión y no se puede volver a convertir" in response.json()["detail"]


def test_hu_c07_restablece_el_espacio_y_no_reutiliza_codigos(client, admin, ocupacion):
    convertir(client, "C-20", admin)

    response = restablecer(client, "M-12", admin)

    assert response.status_code == 200, response.text
    celdas = mapa(client, admin)
    assert celdas["C-20"]["tipo"] == "Carro" and celdas["C-20"]["estado"] == "Libre"
    assert "M-11" not in celdas and "M-12" not in celdas
    assert celdas["C-20"]["historial"][0]["accion"] == "Restablecimiento: C-20, antes M-11 y M-12"
    assert ocupacion("Carro") == "0/70"
    assert ocupacion("Moto") == "0/10"

    # Una nueva conversión toma códigos nuevos: M-11 y M-12 no se reutilizan.
    convertir(client, "C-21", admin)
    celdas = mapa(client, admin)
    assert celdas["M-13"]["espacio_original"] == "C-21"
    assert celdas["M-14"]["espacio_original"] == "C-21"


def test_hu_c07_restablece_una_pareja_de_motos(client, admin):
    convertir(client, "M-01", admin)

    response = restablecer(client, "C-71", admin)

    assert response.status_code == 200, response.text
    celdas = mapa(client, admin)
    assert celdas["M-01"]["tipo"] == "Moto" and celdas["M-02"]["tipo"] == "Moto"
    assert "C-71" not in celdas


def test_hu_c07_rechaza_si_una_celda_resultante_esta_ocupada(client, admin, operario, registrar):
    convertir(client, "C-20", admin)
    registrar("MOT01A", "Moto")
    entrar(client, "MOT01A", "M-11", operario)

    response = restablecer(client, "M-12", admin)

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "No se puede restablecer el espacio C-20: la celda M-11 está ocupada por la moto MOT01A."
    )


@pytest.mark.parametrize("accion", ["convertir", "restablecer"])
def test_rnf03_solo_el_administrador_convierte_o_restablece(client, admin, operario, accion):
    convertir(client, "C-20", admin)
    codigo = "C-21" if accion == "convertir" else "M-11"

    response = client.post(f"/api/celdas/{codigo}/{accion}", json={"motivo": MOTIVO}, headers=operario)

    assert response.status_code == 403


def test_hu_c05_exige_motivo(client, admin):
    response = convertir(client, "C-20", admin, motivo="  ")

    assert response.status_code == 400
    assert response.json()["detail"] == "Es obligatorio indicar el motivo para convertir la celda."


def test_el_tipo_no_se_cambia_directamente(client, admin):
    response = client.patch("/api/celdas/C-20", json={"tipo": "Moto", "motivo": MOTIVO}, headers=admin)

    assert response.status_code == 400
    assert "conviértala" in response.json()["detail"]
