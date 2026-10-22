from typing import Optional


class UsuarioConnection:
    """Operaciones sobre la tabla `usuario` usando SQL crudo."""

    def __init__(self, conn):
        self.conn = conn

    def create(self, nombre: str, correo: str, contrasena_hash: str, rol: str, estado: bool) -> dict:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO usuario (nombre, correo, contrasena_hash, rol, estado)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING *
                """,
                (nombre, correo, contrasena_hash, rol, estado),
            )
            self.conn.commit()
            return cur.fetchone()

    def get_by_correo(self, correo: str) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM usuario WHERE correo = %s", (correo,))
            return cur.fetchone()

    def get_by_id(self, id_usuario: int) -> Optional[dict]:
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM usuario WHERE id_usuario = %s", (id_usuario,))
            return cur.fetchone()

    def update(self, id_usuario: int, fields: dict) -> Optional[dict]:
        """`fields` debe contener únicamente claves que sean columnas válidas de `usuario`."""
        if not fields:
            return self.get_by_id(id_usuario)
        assignments = ", ".join(f"{column} = %s" for column in fields)
        values = list(fields.values()) + [id_usuario]
        with self.conn.cursor() as cur:
            cur.execute(f"UPDATE usuario SET {assignments} WHERE id_usuario = %s RETURNING *", values)
            self.conn.commit()
            return cur.fetchone()
