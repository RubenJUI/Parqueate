from typing import Optional


class EspacioConnection:
    """Consulta de celdas y ocupación sobre la tabla `espacio`."""

    def __init__(self, conn):
        self.conn = conn

    def get_by_id(self, id_espacio: int) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM espacio WHERE id_espacio = %s", (id_espacio,))
            return cur.fetchone()

    def list_all(self, estado: Optional[str] = None, tipo_permitido: Optional[str] = None) -> list:
        conditions, values = [], []
        if estado is not None:
            conditions.append("estado = %s")
            values.append(estado)
        if tipo_permitido is not None:
            conditions.append("tipo_permitido = %s")
            values.append(tipo_permitido)
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        with self.conn.cursor() as cur:
            cur.execute(f"SELECT * FROM espacio {where} ORDER BY numero_espacio", values)
            return cur.fetchall()

    def ocupacion(self) -> list:
        """RF-10: celdas por tipo y estado."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT tipo_permitido AS tipo_vehiculo,
                       COUNT(*) AS total,
                       COUNT(*) FILTER (WHERE estado = 'Ocupado') AS ocupadas,
                       COUNT(*) FILTER (WHERE estado = 'Disponible') AS disponibles,
                       COUNT(*) FILTER (WHERE estado = 'Mantenimiento') AS mantenimiento
                FROM espacio
                GROUP BY tipo_permitido
                ORDER BY tipo_permitido
                """
            )
            return cur.fetchall()
