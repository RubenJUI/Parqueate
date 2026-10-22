from datetime import date
from typing import Optional


class TarifaConnection:
    """Operaciones CRUD sobre la tabla `tarifa` usando SQL crudo."""

    def __init__(self, conn):
        self.conn = conn

    def create(self, tipo_vehiculo: str, valor_hora: float, valor_dia: float, fecha_inicio_vigencia: Optional[date], estado: bool) -> dict:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO tarifa (tipo_vehiculo, valor_hora, valor_dia, fecha_inicio_vigencia, estado)
                VALUES (%s, %s, %s, COALESCE(%s, CURRENT_DATE), %s)
                RETURNING *
                """,
                (tipo_vehiculo, valor_hora, valor_dia, fecha_inicio_vigencia, estado),
            )
            self.conn.commit()
            return cur.fetchone()

    def get_by_id(self, id_tarifa: int) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM tarifa WHERE id_tarifa = %s", (id_tarifa,))
            return cur.fetchone()

    def get_vigente(self, tipo_vehiculo: str) -> Optional[dict]:
        """Tarifa activa más reciente cuya vigencia ya empezó para el tipo de vehículo."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM tarifa
                WHERE tipo_vehiculo = %s AND estado AND fecha_inicio_vigencia <= CURRENT_DATE
                ORDER BY fecha_inicio_vigencia DESC, id_tarifa DESC
                LIMIT 1
                """,
                (tipo_vehiculo,),
            )
            return cur.fetchone()

    def list_all(self, tipo_vehiculo: Optional[str] = None) -> list:
        with self.conn.cursor() as cur:
            if tipo_vehiculo is None:
                cur.execute("SELECT * FROM tarifa ORDER BY tipo_vehiculo, fecha_inicio_vigencia DESC")
            else:
                cur.execute("SELECT * FROM tarifa WHERE tipo_vehiculo = %s ORDER BY fecha_inicio_vigencia DESC", (tipo_vehiculo,))
            return cur.fetchall()

    def update(self, id_tarifa: int, fields: dict) -> Optional[dict]:
        """`fields` debe contener únicamente claves que sean columnas válidas de `tarifa`."""
        if not fields:
            return self.get_by_id(id_tarifa)
        assignments = ", ".join(f"{column} = %s" for column in fields)
        values = list(fields.values()) + [id_tarifa]
        with self.conn.cursor() as cur:
            cur.execute(f"UPDATE tarifa SET {assignments} WHERE id_tarifa = %s RETURNING *", values)
            self.conn.commit()
            return cur.fetchone()

    def delete(self, id_tarifa: int) -> bool:
        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM tarifa WHERE id_tarifa = %s", (id_tarifa,))
            self.conn.commit()
            return cur.rowcount > 0
