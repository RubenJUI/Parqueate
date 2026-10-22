from datetime import date
from typing import Optional

# Datos del tiquete con la celda, el vehículo y su propietario, y el estado derivado del registro.
SELECT_TIQUETE = """
    SELECT t.*, e.numero_espacio, v.tipo_vehiculo, v.id_propietario, p.nombre AS propietario,
           CASE WHEN t.anulado THEN 'Anulado'
                WHEN t.fecha_hora_salida IS NULL THEN 'Activo'
                ELSE 'Finalizado' END AS estado
    FROM tiquete t
    JOIN espacio e ON e.id_espacio = t.id_espacio
    JOIN vehiculo v ON v.placa = t.placa
    JOIN propietario p ON p.id_propietario = v.id_propietario
"""


class TiqueteConnection:
    """Registro de entradas y salidas sobre la tabla `tiquete`. Las operaciones que tocan
    `tiquete` y `espacio` a la vez se ejecutan en una sola transacción."""

    def __init__(self, conn):
        self.conn = conn

    def get_by_id(self, id_tiquete: int) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute(f"{SELECT_TIQUETE} WHERE t.id_tiquete = %s", (id_tiquete,))
            return cur.fetchone()

    def get_abierto_por_placa(self, placa: str) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute(
                f"{SELECT_TIQUETE} WHERE t.placa = %s AND t.fecha_hora_salida IS NULL AND NOT t.anulado",
                (placa,),
            )
            return cur.fetchone()

    def list_all(
        self,
        placa: Optional[str] = None,
        id_propietario: Optional[int] = None,
        id_espacio: Optional[int] = None,
        desde: Optional[date] = None,
        hasta: Optional[date] = None,
        abiertos: Optional[bool] = None,
    ) -> list:
        """RF-11 historial con filtros; `abiertos=True` es el listado de vehículos dentro (RF-12)."""
        conditions, values = [], []
        if placa is not None:
            conditions.append("t.placa = %s")
            values.append(placa)
        if id_propietario is not None:
            conditions.append("v.id_propietario = %s")
            values.append(id_propietario)
        if id_espacio is not None:
            conditions.append("t.id_espacio = %s")
            values.append(id_espacio)
        if desde is not None:
            conditions.append("t.fecha_hora_entrada >= %s")
            values.append(desde)
        if hasta is not None:
            conditions.append("t.fecha_hora_entrada < %s::date + 1")
            values.append(hasta)
        if abiertos is True:
            conditions.append("t.fecha_hora_salida IS NULL AND NOT t.anulado")
        elif abiertos is False:
            conditions.append("(t.fecha_hora_salida IS NOT NULL OR t.anulado)")
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        with self.conn.cursor() as cur:
            cur.execute(f"{SELECT_TIQUETE} {where} ORDER BY t.fecha_hora_entrada DESC", values)
            return cur.fetchall()

    def registrar_entrada(
        self,
        placa: str,
        tipo_vehiculo: str,
        id_usuario_entrada: int,
        novedad: Optional[str],
        id_espacio: Optional[int] = None,
    ) -> Optional[dict]:
        """Ocupa una celda disponible del tipo del vehículo y abre el tiquete. Con `id_espacio` usa esa
        celda (asignación manual); sin él toma la primera libre. Retorna None si no hay celda disponible."""
        try:
            with self.conn.cursor() as cur:
                # SKIP LOCKED evita que dos entradas simultáneas tomen la misma celda (RNF-04).
                cur.execute(
                    """
                    UPDATE espacio SET estado = 'Ocupado'
                    WHERE id_espacio = (
                        SELECT id_espacio FROM espacio
                        WHERE estado = 'Disponible' AND tipo_permitido = %s
                          AND (%s::int IS NULL OR id_espacio = %s)
                        ORDER BY numero_espacio
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING id_espacio
                    """,
                    (tipo_vehiculo, id_espacio, id_espacio),
                )
                espacio = cur.fetchone()
                if espacio is None:
                    self.conn.rollback()
                    return None

                cur.execute(
                    """
                    INSERT INTO tiquete (placa, id_espacio, id_usuario_entrada, novedad_entrada)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id_tiquete
                    """,
                    (placa, espacio["id_espacio"], id_usuario_entrada, novedad),
                )
                id_tiquete = cur.fetchone()["id_tiquete"]
            self.conn.commit()
            return self.get_by_id(id_tiquete)
        except Exception:
            self.conn.rollback()
            raise

    def registrar_salida(self, id_tiquete: int, id_usuario_salida: int, novedad: Optional[str]) -> Optional[dict]:
        """Cierra el tiquete y libera la celda. Retorna None si el tiquete ya no está abierto."""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE tiquete
                    SET fecha_hora_salida = LOCALTIMESTAMP, id_usuario_salida = %s, novedad_salida = %s
                    WHERE id_tiquete = %s AND fecha_hora_salida IS NULL AND NOT anulado
                    RETURNING id_espacio
                    """,
                    (id_usuario_salida, novedad, id_tiquete),
                )
                cerrado = cur.fetchone()
                if cerrado is None:
                    self.conn.rollback()
                    return None
                cur.execute("UPDATE espacio SET estado = 'Disponible' WHERE id_espacio = %s", (cerrado["id_espacio"],))
            self.conn.commit()
            return self.get_by_id(id_tiquete)
        except Exception:
            self.conn.rollback()
            raise

    def cambiar_espacio(self, id_tiquete: int, id_espacio_nuevo: int, tipo_vehiculo: str) -> Optional[dict]:
        """RF-05: cambio manual de celda de un tiquete abierto. Retorna None si la nueva celda
        no está disponible o no es del tipo del vehículo."""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE espacio SET estado = 'Ocupado'
                    WHERE id_espacio = %s AND estado = 'Disponible' AND tipo_permitido = %s
                    RETURNING id_espacio
                    """,
                    (id_espacio_nuevo, tipo_vehiculo),
                )
                if cur.fetchone() is None:
                    self.conn.rollback()
                    return None

                cur.execute(
                    """
                    UPDATE tiquete t SET id_espacio = %s
                    FROM tiquete anterior
                    WHERE t.id_tiquete = %s AND anterior.id_tiquete = t.id_tiquete
                      AND t.fecha_hora_salida IS NULL AND NOT t.anulado
                    RETURNING anterior.id_espacio
                    """,
                    (id_espacio_nuevo, id_tiquete),
                )
                anterior = cur.fetchone()
                if anterior is None:
                    self.conn.rollback()
                    return None
                cur.execute("UPDATE espacio SET estado = 'Disponible' WHERE id_espacio = %s", (anterior["id_espacio"],))
            self.conn.commit()
            return self.get_by_id(id_tiquete)
        except Exception:
            self.conn.rollback()
            raise

    def anular(self, id_tiquete: int, motivo: str, id_usuario: int) -> Optional[dict]:
        """RNF-05: los registros no se eliminan, se anulan con justificación. Si el tiquete estaba
        abierto, la celda se libera. Retorna None si el tiquete ya estaba anulado."""
        try:
            with self.conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE tiquete
                    SET anulado = TRUE, motivo_anulacion = %s, id_usuario_anulacion = %s,
                        fecha_hora_anulacion = LOCALTIMESTAMP
                    WHERE id_tiquete = %s AND NOT anulado
                    RETURNING id_espacio, fecha_hora_salida
                    """,
                    (motivo, id_usuario, id_tiquete),
                )
                anulado = cur.fetchone()
                if anulado is None:
                    self.conn.rollback()
                    return None
                if anulado["fecha_hora_salida"] is None:
                    cur.execute("UPDATE espacio SET estado = 'Disponible' WHERE id_espacio = %s", (anulado["id_espacio"],))
            self.conn.commit()
            return self.get_by_id(id_tiquete)
        except Exception:
            self.conn.rollback()
            raise
