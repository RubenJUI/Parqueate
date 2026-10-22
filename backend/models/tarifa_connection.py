class TarifaConnection:
    """Consulta del valor de la mensualidad por tipo de vehículo sobre la tabla `tarifa`."""

    def __init__(self, conn):
        self.conn = conn

    def list_all(self) -> list:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM tarifa ORDER BY tipo_vehiculo")
            return cur.fetchall()
