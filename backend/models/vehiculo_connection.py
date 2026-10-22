from typing import Optional


class VehiculoConnection:
    """Consulta de vehículos registrados con su propietario. La llave primaria es la placa."""

    def __init__(self, conn):
        self.conn = conn

    def get_by_placa(self, placa: str) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT v.placa, v.tipo_vehiculo, v.id_propietario,
                       p.nombre AS propietario, p.documento, p.telefono
                FROM vehiculo v
                JOIN propietario p ON p.id_propietario = v.id_propietario
                WHERE v.placa = %s
                """,
                (placa,),
            )
            return cur.fetchone()
