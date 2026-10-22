from datetime import date, timedelta
from typing import Optional

from config import DIAS_ALERTA, DIAS_VIGENCIA


def calcular_vigencia(fecha_pago: date, hoy: date) -> dict:
    """RN-04: la mensualidad vale DIAS_VIGENCIA días calendario contando el día del pago,
    es decir, vence en fecha_pago + (DIAS_VIGENCIA - 1). RF-04: alerta si quedan DIAS_ALERTA días o menos."""
    fecha_vencimiento = fecha_pago + timedelta(days=DIAS_VIGENCIA - 1)
    dias_restantes = (fecha_vencimiento - hoy).days
    if dias_restantes < 0:
        estado = "Vencida"
    elif dias_restantes <= DIAS_ALERTA:
        estado = "Por vencer"
    else:
        estado = "Vigente"
    return {
        "fecha_pago": fecha_pago,
        "fecha_vencimiento": fecha_vencimiento,
        "dias_restantes": dias_restantes,
        "estado": estado,
    }


class PagoConnection:
    """Consulta de pagos de mensualidad. La vigencia se toma del pago más reciente."""

    def __init__(self, conn):
        self.conn = conn

    def get_ultimo(self, placa: str) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM pago WHERE placa = %s ORDER BY fecha_pago DESC, id_pago DESC LIMIT 1",
                (placa,),
            )
            return cur.fetchone()
