from datetime import date, datetime
import hashlib
import secrets
from typing import List, Optional

from fastapi import HTTPException
from starlette.status import (
    HTTP_400_BAD_REQUEST,
    HTTP_401_UNAUTHORIZED,
    HTTP_403_FORBIDDEN,
    HTTP_404_NOT_FOUND,
)

from models.modulo2_connection import reparar_mojibake, sanitizar_bd
from models.modulo3_connection import ahora_colombia_naive
from schema.personal_schema import (
    AuthLoginSchema,
    CuentaPersonalCrearSchema,
    CuentaPersonalEditarSchema,
    CuentaPersonalEstadoSchema,
)

PBKDF2_ITERATIONS = 120000


def hash_password_pbkdf2(password: str) -> str:
    """Encripta una contraseña usando PBKDF2-HMAC-SHA256 con salt aleatorio de la librería estándar."""
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PBKDF2_ITERATIONS,
    ).hex()
    return f"pbkdf2_sha256${salt}${dk}"


def verify_password_pbkdf2(plain_password: str, stored_hash: str) -> bool:
    """Verifica una contraseña contra un hash PBKDF2-HMAC-SHA256 (o fallback bcrypt si proviene de tabla legacy)."""
    if not plain_password or not stored_hash:
        return False
    if stored_hash.startswith("pbkdf2_sha256$"):
        try:
            _, salt, expected_hex = stored_hash.split("$", 2)
            dk = hashlib.pbkdf2_hmac(
                "sha256",
                plain_password.encode("utf-8"),
                salt.encode("utf-8"),
                PBKDF2_ITERATIONS,
            ).hex()
            return secrets.compare_digest(dk, expected_hex)
        except Exception:
            return False
    try:
        from passlib.context import CryptContext

        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.verify(plain_password, stored_hash)
    except Exception:
        return False


def _fmt_iso(val) -> str:
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    return str(val or "")


def _sincronizar_en_usuario_legacy(
    cur,
    nombre: str,
    correo: str,
    contrasena_hash: str,
    rol_personal: str,
    estado_personal: str,
    correo_anterior: Optional[str] = None,
) -> int:
    """Mantiene sincronizada la cuenta en la tabla legacy `usuario` para que tiquete.id_usuario_entrada
    y las dependencias JWT existentes funcionen con total retrocompatibilidad."""
    rol_db = "Administrador" if rol_personal == "Administrador" else "Operador"
    estado_bool = estado_personal == "Activo"
    correo_norm = correo.strip().lower()

    if correo_anterior and correo_anterior.strip().lower() != correo_norm:
        cur.execute(
            "SELECT id_usuario FROM usuario WHERE LOWER(correo) = %s",
            (correo_anterior.strip().lower(),),
        )
        existente_ant = cur.fetchone()
        if existente_ant:
            cur.execute(
                """
                UPDATE usuario
                SET nombre = %s, correo = %s, contrasena_hash = %s, rol = %s, estado = %s
                WHERE id_usuario = %s
                RETURNING id_usuario
                """,
                (
                    sanitizar_bd(nombre),
                    sanitizar_bd(correo_norm),
                    contrasena_hash,
                    rol_db,
                    estado_bool,
                    existente_ant["id_usuario"],
                ),
            )
            return int(cur.fetchone()["id_usuario"])

    cur.execute(
        """
        INSERT INTO usuario (nombre, correo, contrasena_hash, rol, estado)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (correo) DO UPDATE
        SET nombre = EXCLUDED.nombre,
            contrasena_hash = EXCLUDED.contrasena_hash,
            rol = EXCLUDED.rol,
            estado = EXCLUDED.estado
        RETURNING id_usuario
        """,
        (
            sanitizar_bd(nombre),
            sanitizar_bd(correo_norm),
            contrasena_hash,
            rol_db,
            estado_bool,
        ),
    )
    return int(cur.fetchone()["id_usuario"])


def ensure_auth_schema(conn) -> None:
    """Crea la tabla `cuenta_personal` si no existe e inserta las 2 cuentas semilla iniciales."""
    ahora = ahora_colombia_naive()
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS cuenta_personal (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(120) NOT NULL,
                correo VARCHAR(120) UNIQUE NOT NULL,
                contrasena_hash TEXT NOT NULL,
                rol VARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Operario')),
                estado VARCHAR(20) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
                motivo_inactivacion TEXT,
                fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        cur.execute("SELECT COUNT(*) AS total FROM cuenta_personal")
        if cur.fetchone()["total"] == 0:
            semillas = [
                ("Administrador General", "admin@parqueate.co", "Admin123*", "Administrador"),
                ("Operario Turno", "operario@parqueate.co", "Operario123*", "Operario"),
            ]
            for nombre, correo, clave, rol in semillas:
                h = hash_password_pbkdf2(clave)
                cur.execute(
                    """
                    INSERT INTO cuenta_personal (nombre, correo, contrasena_hash, rol, estado, fecha_creacion)
                    VALUES (%s, %s, %s, %s, 'Activo', %s)
                    ON CONFLICT (correo) DO NOTHING
                    """,
                    (sanitizar_bd(nombre), correo, h, rol, ahora),
                )
                _sincronizar_en_usuario_legacy(cur, nombre, correo, h, rol, "Activo")

    conn.commit()


class PersonalConnection:
    """Operaciones de autenticación (Login) y gestión de cuentas del personal (RF-A01, RF-A02, HU-P13, HU-P14)."""

    def __init__(self, conn):
        self.conn = conn

    @staticmethod
    def _formatear_cuenta(row: dict) -> dict:
        rol_raw = row.get("rol") or "Operario"
        rol_norm = "Administrador" if rol_raw == "Administrador" else "Operario"
        estado_raw = row.get("estado")
        if isinstance(estado_raw, bool):
            estado_norm = "Activo" if estado_raw else "Inactivo"
        else:
            estado_norm = "Inactivo" if estado_raw == "Inactivo" else "Activo"

        return {
            "id": int(row["id"]),
            "nombre": reparar_mojibake(row.get("nombre") or ""),
            "correo": reparar_mojibake(row.get("correo") or "").lower(),
            "rol": rol_norm,
            "estado": estado_norm,
            "motivo_inactivacion": reparar_mojibake(row.get("motivo_inactivacion") or "") or None,
            "fecha_creacion": _fmt_iso(row.get("fecha_creacion") or ahora_colombia_naive()),
        }

    def autenticar_login(self, datos: AuthLoginSchema, create_token_fn) -> dict:
        """POST /api/auth/login: valida credenciales contra cuenta_personal (y fallback legacy usuario)."""
        correo_norm = (datos.correo or "").strip().lower()
        clave = datos.contrasena or ""

        if not correo_norm or not clave:
            raise HTTPException(
                status_code=HTTP_401_UNAUTHORIZED,
                detail="Correo o contraseña incorrectos.",
            )

        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM cuenta_personal WHERE LOWER(correo) = %s", (correo_norm,))
            cuenta = cur.fetchone()

            # Fallback retrocompatible si el usuario existe en la tabla legacy `usuario` pero aún no en `cuenta_personal`
            if not cuenta:
                cur.execute("SELECT * FROM usuario WHERE LOWER(correo) = %s", (correo_norm,))
                leg = cur.fetchone()
                if leg and verify_password_pbkdf2(clave, leg["contrasena_hash"]):
                    rol_p = "Administrador" if leg["rol"] == "Administrador" else "Operario"
                    est_p = "Activo" if leg.get("estado", True) else "Inactivo"
                    nuevo_hash = hash_password_pbkdf2(clave)
                    cur.execute(
                        """
                        INSERT INTO cuenta_personal (nombre, correo, contrasena_hash, rol, estado, fecha_creacion)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        ON CONFLICT (correo) DO UPDATE SET contrasena_hash = EXCLUDED.contrasena_hash
                        RETURNING *
                        """,
                        (
                            sanitizar_bd(reparar_mojibake(leg["nombre"])),
                            correo_norm,
                            nuevo_hash,
                            rol_p,
                            est_p,
                            ahora_colombia_naive(),
                        ),
                    )
                    cuenta = cur.fetchone()
                    self.conn.commit()

            if not cuenta or not verify_password_pbkdf2(clave, cuenta["contrasena_hash"]):
                raise HTTPException(
                    status_code=HTTP_401_UNAUTHORIZED,
                    detail="Correo o contraseña incorrectos.",
                )

            if cuenta["estado"] != "Activo":
                raise HTTPException(
                    status_code=HTTP_403_FORBIDDEN,
                    detail="Tu cuenta se encuentra inactiva. Contacta al Administrador.",
                )

            id_usuario = _sincronizar_en_usuario_legacy(
                cur,
                reparar_mojibake(cuenta["nombre"]),
                cuenta["correo"],
                cuenta["contrasena_hash"],
                cuenta["rol"],
                cuenta["estado"],
            )
            self.conn.commit()

        token = create_token_fn(data={"sub": cuenta["correo"].lower()})
        cuenta_fmt = self._formatear_cuenta(cuenta)
        return {
            **cuenta_fmt,
            "id_usuario": id_usuario,
            "token": token,
            "access_token": token,
            "token_type": "bearer",
        }

    def listar_personal(self) -> List[dict]:
        """GET /api/personal: retorna todas las cuentas del personal sin exponer contrasena_hash."""
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, nombre, correo, rol, estado, motivo_inactivacion, fecha_creacion
                FROM cuenta_personal
                ORDER BY CASE WHEN rol = 'Administrador' THEN 0 ELSE 1 END, id ASC
                """
            )
            rows = cur.fetchall()
        return [self._formatear_cuenta(r) for r in rows]

    def crear_personal(self, datos: CuentaPersonalCrearSchema) -> dict:
        """POST /api/personal: crea una nueva cuenta de personal encriptando su contraseña con PBKDF2-SHA256."""
        nombre = reparar_mojibake(datos.nombre or "").strip()
        correo = reparar_mojibake(datos.correo or "").strip().lower()
        clave = (datos.contrasena or "").strip()
        rol = "Administrador" if datos.rol == "Administrador" else "Operario"

        if not nombre or not correo or not clave:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Todos los campos (nombre, correo, rol y contraseña) son obligatorios.",
            )
        if "@" not in correo or "." not in correo.split("@")[-1]:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Ingresa un correo electrónico válido.",
            )
        if len(clave) < 6:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="La contraseña debe tener al menos 6 caracteres.",
            )

        ahora = ahora_colombia_naive()
        with self.conn.cursor() as cur:
            cur.execute("SELECT id FROM cuenta_personal WHERE LOWER(correo) = %s", (correo,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=f"Ya existe una cuenta registrada con el correo {correo}.",
                )

            h = hash_password_pbkdf2(clave)
            cur.execute(
                """
                INSERT INTO cuenta_personal (nombre, correo, contrasena_hash, rol, estado, fecha_creacion)
                VALUES (%s, %s, %s, %s, 'Activo', %s)
                RETURNING id, nombre, correo, rol, estado, motivo_inactivacion, fecha_creacion
                """,
                (sanitizar_bd(nombre), sanitizar_bd(correo), h, rol, ahora),
            )
            creada = cur.fetchone()
            _sincronizar_en_usuario_legacy(cur, nombre, correo, h, rol, "Activo")

        self.conn.commit()
        return self._formatear_cuenta(creada)

    def editar_personal(self, id_cuenta: int, datos: CuentaPersonalEditarSchema) -> dict:
        """PUT /api/personal/{id}: actualiza nombre, correo, rol y opcionalmente contraseña."""
        nombre = reparar_mojibake(datos.nombre or "").strip()
        correo = reparar_mojibake(datos.correo or "").strip().lower()
        rol = "Administrador" if datos.rol == "Administrador" else "Operario"
        nueva_clave = (datos.contrasena or "").strip()

        if not nombre or not correo:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="El nombre completo y el correo electrónico son obligatorios.",
            )
        if "@" not in correo or "." not in correo.split("@")[-1]:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Ingresa un correo electrónico válido.",
            )
        if nueva_clave and len(nueva_clave) < 6:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="La nueva contraseña debe tener al menos 6 caracteres.",
            )

        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM cuenta_personal WHERE id = %s", (id_cuenta,))
            actual = cur.fetchone()
            if not actual:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Cuenta de personal no encontrada.")

            cur.execute(
                "SELECT id FROM cuenta_personal WHERE LOWER(correo) = %s AND id <> %s",
                (correo, id_cuenta),
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=f"El correo {correo} ya está asignado a otra cuenta del personal.",
                )

            if actual["rol"] == "Administrador" and actual["estado"] == "Activo" and rol != "Administrador":
                cur.execute(
                    """
                    SELECT COUNT(*) AS otros_admins
                    FROM cuenta_personal
                    WHERE rol = 'Administrador' AND estado = 'Activo' AND id <> %s
                    """,
                    (id_cuenta,),
                )
                if cur.fetchone()["otros_admins"] == 0:
                    raise HTTPException(
                        status_code=HTTP_400_BAD_REQUEST,
                        detail="No se puede cambiar el rol del último Administrador activo del sistema.",
                    )

            hash_final = hash_password_pbkdf2(nueva_clave) if nueva_clave else actual["contrasena_hash"]
            cur.execute(
                """
                UPDATE cuenta_personal
                SET nombre = %s,
                    correo = %s,
                    rol = %s,
                    contrasena_hash = %s
                WHERE id = %s
                RETURNING id, nombre, correo, rol, estado, motivo_inactivacion, fecha_creacion
                """,
                (sanitizar_bd(nombre), sanitizar_bd(correo), rol, hash_final, id_cuenta),
            )
            actualizada = cur.fetchone()
            _sincronizar_en_usuario_legacy(
                cur,
                nombre,
                correo,
                hash_final,
                rol,
                actualizada["estado"],
                correo_anterior=actual["correo"],
            )

        self.conn.commit()
        return self._formatear_cuenta(actualizada)

    def cambiar_estado_personal(self, id_cuenta: int, datos: CuentaPersonalEstadoSchema) -> dict:
        """PATCH /api/personal/{id}/estado: activa o inactiva una cuenta exigiendo motivo obligatorio
        y bloqueando si se intenta inactivar al último Administrador activo."""
        motivo = reparar_mojibake(datos.motivo or "").strip()
        if not motivo:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Es obligatorio indicar el motivo para activar o inactivar la cuenta.",
            )

        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM cuenta_personal WHERE id = %s", (id_cuenta,))
            actual = cur.fetchone()
            if not actual:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Cuenta de personal no encontrada.")

            estado_actual = "Inactivo" if actual.get("estado") == "Inactivo" else "Activo"
            nuevo_estado = datos.estado or ("Inactivo" if estado_actual == "Activo" else "Activo")

            if nuevo_estado == "Inactivo" and actual["rol"] == "Administrador":
                cur.execute(
                    """
                    SELECT COUNT(*) AS otros_admins
                    FROM cuenta_personal
                    WHERE rol = 'Administrador' AND estado = 'Activo' AND id <> %s
                    """,
                    (id_cuenta,),
                )
                if cur.fetchone()["otros_admins"] == 0:
                    raise HTTPException(
                        status_code=HTTP_400_BAD_REQUEST,
                        detail="No se puede inactivar al último Administrador activo del sistema.",
                    )

            motivo_bd = sanitizar_bd(motivo) if nuevo_estado == "Inactivo" else None
            cur.execute(
                """
                UPDATE cuenta_personal
                SET estado = %s,
                    motivo_inactivacion = %s
                WHERE id = %s
                RETURNING id, nombre, correo, rol, estado, motivo_inactivacion, fecha_creacion
                """,
                (nuevo_estado, motivo_bd, id_cuenta),
            )
            actualizada = cur.fetchone()
            _sincronizar_en_usuario_legacy(
                cur,
                reparar_mojibake(actual["nombre"]),
                actual["correo"],
                actual["contrasena_hash"],
                actual["rol"],
                nuevo_estado,
            )

        self.conn.commit()
        return self._formatear_cuenta(actualizada)
