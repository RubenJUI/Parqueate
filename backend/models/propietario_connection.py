from typing import Optional


class PropietarioConnection:
    """Operaciones CRUD sobre la tabla `propietario` usando SQL crudo."""

    def __init__(self, conn):
        self.conn = conn

    def create(self, documento: str, nombre: str, telefono: Optional[str], correo: Optional[str]) -> dict:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO propietario (documento, nombre, telefono, correo) VALUES (%s, %s, %s, %s) RETURNING *",
                (documento, nombre, telefono, correo),
            )
            self.conn.commit()
            return cur.fetchone()

    def get_by_id(self, id_propietario: int) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM propietario WHERE id_propietario = %s", (id_propietario,))
            return cur.fetchone()

    def get_by_documento(self, documento: str) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM propietario WHERE documento = %s", (documento,))
            return cur.fetchone()

    def list_all(self) -> list:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM propietario ORDER BY nombre")
            return cur.fetchall()

    def update(self, id_propietario: int, fields: dict) -> Optional[dict]:
        """`fields` debe contener únicamente claves que sean columnas válidas de `propietario`."""
        if not fields:
            return self.get_by_id(id_propietario)
        assignments = ", ".join(f"{column} = %s" for column in fields)
        values = list(fields.values()) + [id_propietario]
        with self.conn.cursor() as cur:
            cur.execute(f"UPDATE propietario SET {assignments} WHERE id_propietario = %s RETURNING *", values)
            self.conn.commit()
            return cur.fetchone()

    def delete(self, id_propietario: int) -> bool:
        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM propietario WHERE id_propietario = %s", (id_propietario,))
            self.conn.commit()
            return cur.rowcount > 0
