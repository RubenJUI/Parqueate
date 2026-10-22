"""RN-04 y RF-04: ejemplos de vigencia del documento de requerimientos (pago el 13/10/2026)."""

from datetime import date

import pytest

from models.pago_connection import calcular_vigencia

PAGO = date(2026, 10, 13)


@pytest.mark.parametrize(
    "hoy, estado, dias_restantes",
    [
        (date(2026, 10, 13), "Vigente", 29),  # Día 1
        (date(2026, 10, 31), "Vigente", 11),  # Día 19: la cuenta sigue en noviembre
        (date(2026, 11, 8), "Por vencer", 3),  # Día 27: alerta "vence en 3 días"
        (date(2026, 11, 11), "Por vencer", 0),  # Día 30: último día
        (date(2026, 11, 12), "Vencida", -1),  # Día 31: se niega la entrada
    ],
)
def test_ejemplo_de_vigencia(hoy, estado, dias_restantes):
    vigencia = calcular_vigencia(PAGO, hoy)
    assert vigencia["fecha_vencimiento"] == date(2026, 11, 11)
    assert vigencia["estado"] == estado
    assert vigencia["dias_restantes"] == dias_restantes


def test_caso_febrero():
    assert calcular_vigencia(date(2027, 1, 31), date(2027, 1, 31))["fecha_vencimiento"] == date(2027, 3, 1)


def test_alerta_solo_con_tres_dias_o_menos():
    assert calcular_vigencia(PAGO, date(2026, 11, 7))["estado"] == "Vigente"  # quedan 4 días
