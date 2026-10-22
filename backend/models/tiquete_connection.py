import math
from datetime import datetime
from decimal import Decimal
from typing import Optional


def calcular_valor_total(entrada: datetime, salida: datetime, valor_hora: Decimal, valor_dia: Decimal) -> Decimal:
    """Cobra días completos a `valor_dia` y las horas restantes (fracción = hora completa, mínimo una)
    a `valor_hora`, sin que las horas de un día superen el valor del día."""
    horas = max(1, math.ceil((salida - entrada).total_seconds() / 3600))
    dias, horas_restantes = divmod(horas, 24)
    return dias * valor_dia + min(horas_restantes * valor_hora, valor_dia)


class TiqueteConnection:
    """Registro de entradas y salidas sobre la tabla `tiquete`. Las operaciones que tocan
    `tiquete` y `espacio` a la vez se ejecutan en una sola transacción."""

    def __init__(self, conn):
        self.conn = conn

    def get_by_id(self, id_tiquete: int) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM tiquete WHERE id_tiquete = %s", (id_tiquete,))
            return cur.fetchone()

    def get_abierto_por_placa(self, placa: str) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM tiquete WHERE placa = %s AND fecha_hora_salida IS NULL", (placa,))
            return cur.fetchone()

    def list_all(self, placa: Optional[str] = None, abiertos: Optional[bool] = None) -> list:
        conditions, values = [], []
        if placa is not None:
            conditions.append("placa = %s")
            values.append(placa)
        if abiertos is not None:
            conditions.append("fecha_hora_salida IS NULL" if abiertos else "fecha_hora_salida IS NOT NULL")
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        with self.conn.cursor() as cur:
            cur.execute(f"SELECT * FROM tiquete {where} ORDER BY fecha_hora_entrada DESC", values)
            return cur.fetchall()

    def registrar_entrada(self, placa: str, tipo_vehiculo: str, id_tarifa: int, id_usuario_entrada: int) -> Optional[dict]:
        """Ocupa el primer espacio disponible compatible con el tipo de vehículo y abre el tiquete.
        Retorna None si no hay espacios disponibles."""
        try:
            with self.conn.cursor() as cur:
                # SKIP LOCKED evita que dos entradas simultáneas tomen el mismo espacio.
                cur.execute(
                    """
                    UPDATE espacio SET estado = 'Ocupado'
                    WHERE id_espacio = (
                        SELECT id_espacio FROM espacio
                        WHERE estado = 'Disponible' AND tipo_permitido IN (%s, 'Todos')
                        ORDER BY tipo_permitido = 'Todos', numero_espacio
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id_espacio
                    """,
                    (tipo_vehiculo,),
                )
                espacio = cur.fetchone()
                if espacio is None:
                    self.conn.rollback()
                    return None

                cur.execute(
                    """
                    INSERT INTO tiquete (placa, id_espacio, id_tarifa, id_usuario_entrada)
                    VALUES (%s, %s, %s, %s)
                    RETURNING *
                    """,
                    (placa, espacio["id_espacio"], id_tarifa, id_usuario_entrada),
                )
                tiquete = cur.fetchone()
            self.conn.commit()
            return tiquete
        except Exception:
            self.conn.rollback()
            raise

    def registrar_salida(self, id_tiquete: int, id_usuario_salida: int) -> Optional[dict]:
        """Cierra el tiquete, calcula el valor con su tarifa y libera el espacio.
        Retorna None si el tiquete no existe o ya tiene salida."""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT t.*, ta.valor_hora, ta.valor_dia, LOCALTIMESTAMP AS ahora
                    FROM tiquete t JOIN tarifa ta ON ta.id_tarifa = t.id_tarifa
                    WHERE t.id_tiquete = %s AND t.fecha_hora_salida IS NULL
                    FOR UPDATE OF t
                    """,
                    (id_tiquete,),
                )
                abierto = cur.fetchone()
                if abierto is None:
                    self.conn.rollback()
                    return None

                valor_total = calcular_valor_total(
                    abierto["fecha_hora_entrada"], abierto["ahora"], abierto["valor_hora"], abierto["valor_dia"]
                )
                cur.execute(
                    """
                    UPDATE tiquete
                    SET fecha_hora_salida = %s, id_usuario_salida = %s, valor_total = %s
                    WHERE id_tiquete = %s
                    RETURNING *
                    """,
                    (abierto["ahora"], id_usuario_salida, valor_total, id_tiquete),
                )
                tiquete = cur.fetchone()
                cur.execute("UPDATE espacio SET estado = 'Disponible' WHERE id_espacio = %s", (abierto["id_espacio"],))
            self.conn.commit()
            return tiquete
        except Exception:
            self.conn.rollback()
            raise
