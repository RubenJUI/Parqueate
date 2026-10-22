from typing import Optional


class EspacioConnection:
    """Operaciones CRUD sobre la tabla `espacio` usando SQL crudo."""

    def __init__(self, conn):
        self.conn = conn

    def create(self, numero_espacio: str, piso_zona: str, tipo_permitido: str, estado: str) -> dict:
        with self.conn.cursor() as cur:
            cur.execute(
                "INSERT INTO espacio (numero_espacio, piso_zona, tipo_permitido, estado) VALUES (%s, %s, %s, %s) RETURNING *",
                (numero_espacio, piso_zona, tipo_permitido, estado),
            )
            self.conn.commit()
            return cur.fetchone()

    def get_by_id(self, id_espacio: int) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM espacio WHERE id_espacio = %s", (id_espacio,))
            return cur.fetchone()

    def get_by_numero(self, numero_espacio: str) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM espacio WHERE numero_espacio = %s", (numero_espacio,))
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

    def update(self, id_espacio: int, fields: dict) -> Optional[dict]:
        """`fields` debe contener únicamente claves que sean columnas válidas de `espacio`."""
        if not fields:
            return self.get_by_id(id_espacio)
        assignments = ", ".join(f"{column} = %s" for column in fields)
        values = list(fields.values()) + [id_espacio]
        with self.conn.cursor() as cur:
            cur.execute(f"UPDATE espacio SET {assignments} WHERE id_espacio = %s RETURNING *", values)
            self.conn.commit()
            return cur.fetchone()

    def delete(self, id_espacio: int) -> bool:
        with self.conn.cursor() as cur:
            cur.execute("DELETE FROM espacio WHERE id_espacio = %s", (id_espacio,))
            self.conn.commit()
            return cur.rowcount > 0
