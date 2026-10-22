"""Crea o actualiza un usuario del sistema (por defecto, administrador).

Uso:
    python create_admin.py <correo> <contrasena> <nombre> [Administrador|Operador]
"""

import sys

import psycopg2
from psycopg2.extras import RealDictCursor

from auth.auth import get_password_hash
from database.database import DATABASE_URL
from models.usuario_connection import UsuarioConnection


def main() -> None:
    if len(sys.argv) not in (4, 5) or (len(sys.argv) == 5 and sys.argv[4] not in ("Administrador", "Operador")):
        print("Uso: python create_admin.py <correo> <contrasena> <nombre> [Administrador|Operador]")
        raise SystemExit(1)

    correo, contrasena, nombre = sys.argv[1:4]
    rol = sys.argv[4] if len(sys.argv) == 5 else "Administrador"
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    try:
        repo = UsuarioConnection(conn)
        contrasena_hash = get_password_hash(contrasena)
        existente = repo.get_by_correo(correo)
        if existente:
            repo.update(
                existente["id_usuario"],
                {"contrasena_hash": contrasena_hash, "nombre": nombre, "rol": rol, "estado": True},
            )
            print(f"Usuario '{correo}' actualizado con rol {rol}.")
        else:
            repo.create(nombre=nombre, correo=correo, contrasena_hash=contrasena_hash, rol=rol, estado=True)
            print(f"Usuario '{correo}' creado con rol {rol}.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
