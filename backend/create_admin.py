"""Crea o actualiza el usuario administrador inicial.

Uso:
    python create_admin.py <correo> <contrasena> <nombre>
"""

import sys

import psycopg2
from psycopg2.extras import RealDictCursor

from auth.auth import get_password_hash
from database.database import DATABASE_URL
from models.usuario_connection import UsuarioConnection


def main() -> None:
    if len(sys.argv) != 4:
        print("Uso: python create_admin.py <correo> <contrasena> <nombre>")
        raise SystemExit(1)

    correo, contrasena, nombre = sys.argv[1:4]
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        repo = UsuarioConnection(conn)
        contrasena_hash = get_password_hash(contrasena)
        existente = repo.get_by_correo(correo)
        if existente:
            repo.update(
                existente["id_usuario"],
                {"contrasena_hash": contrasena_hash, "nombre": nombre, "rol": "Administrador", "estado": True},
            )
            print(f"Usuario '{correo}' actualizado como administrador.")
        else:
            repo.create(nombre=nombre, correo=correo, contrasena_hash=contrasena_hash, rol="Administrador", estado=True)
            print(f"Usuario administrador '{correo}' creado.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
