from typing import Optional


class VehiculoConnection:
    """Operaciones CRUD sobre la tabla `vehiculo` usando SQL crudo. La llave primaria es la placa."""

    def __init__(self, conn):
        self.conn = conn

    def create(
        self,
        placa: str,
        tipo_vehiculo: str,
        marca: Optional[str],
        modelo: Optional[str],
        color: Optional[str],
        id_propietario: Optional[int],
    ) -> dict:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO vehiculo (placa, tipo_vehiculo, marca, modelo, color, id_propietario)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (placa, tipo_vehiculo, marca, modelo, color, id_propietario),
            )
            self.conn.commit()
            return cur.fetchone()

    def get_by_placa(self, placa: str) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM vehiculo WHERE placa = %s", (placa,))
            return cur.fetchone()

    def list_all(self, id_propietario: Optional[int] = None) -> list:
        with self.conn.cursor() as cur:
            if id_propietario is None:
                cur.execute("SELECT * FROM vehiculo ORDER BY placa")
            else:
                cur.execute("SELECT * FROM vehiculo WHERE id_propietario = %s ORDER BY placa", (id_propietario,))
            return cur.fetchall()

    def update(self, placa: str, fields: dict) -> Optional[dict]:
        """`fields` debe contener únicamente claves que sean columnas válidas de `vehiculo`."""
        if not fields:
            return self.get_by_placa(placa)
        assignments = ", ".join(f"{column} = %s" for column in fields)
        values = list(fields.values()) + [placa]
        with self.conn.cursor() as cur:
            cur.execute(f"UPDATE vehiculo SET {assignments} WHERE placa = %s RETURNING *", values)
            self.conn.commit()
            return cur.fetchone()

    def delete(self, placa: str) -> bool:
        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM vehiculo WHERE placa = %s", (placa,))
            self.conn.commit()
            return cur.rowcount > 0
