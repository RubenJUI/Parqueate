from datetime import datetime
import re
from typing import Dict, List, Optional

from fastapi import HTTPException
from starlette.status import HTTP_400_BAD_REQUEST, HTTP_404_NOT_FOUND, HTTP_409_CONFLICT

from schema.modulo2_schema import (
    CambioEstadoSchema,
    CeldaActualizarSchema,
    CeldaCrearSchema,
    UsuarioCrearSchema,
    UsuarioEditarSchema,
    VehiculoAsociarSchema,
)

REGEX_PLACA_CARRO = re.compile(r"^[A-Z]{3}[0-9]{3}$")
REGEX_PLACA_MOTO = re.compile(r"^[A-Z]{3}[0-9]{2}[A-Z]{1}$")


def reparar_mojibake(texto: Optional[str]) -> str:
    """Corrige cadenas UTF-8 que fueron almacenadas o interpretadas erróneamente como WIN1252/Latin-1."""
    if not texto:
        return ""
    res = str(texto)
    if "Ã" in res or "\xad" in res or "Â" in res:
        try:
            res = res.encode("cp1252").decode("utf-8")
        except Exception:
            reemplazos = {
                "Ã¡": "á",
                "Ã©": "é",
                "Ã­": "í",
                "Ã\xad": "í",
                "Ã³": "ó",
                "Ãº": "ú",
                "Ã±": "ñ",
                "Ã\x81": "Á",
                "Ã\x89": "É",
                "Ã\x8d": "Í",
                "Ã\x93": "Ó",
                "Ã\x9a": "Ú",
                "Ã\x91": "Ñ",
                "MarÃa": "María",
                "Mar\xada": "María",
                "GÃ³mez": "Gómez",
                "AndrÃ©s": "Andrés",
                "PÃ©rez": "Pérez",
            }
            for k, v in reemplazos.items():
                res = res.replace(k, v)
    return res


def sanitizar_bd(texto: Optional[str]) -> Optional[str]:
    """Normaliza caracteres Unicode (ej. flechas →) para que sean 100% compatibles con bases WIN1252 y UTF-8."""
    if texto is None:
        return None
    limpio = reparar_mojibake(str(texto))
    limpio = (
        limpio.replace("→", "->")
        .replace("←", "<-")
        .replace("—", "-")
        .replace("–", "-")
        .replace("•", "·")
    )
    return limpio.encode("cp1252", errors="replace").decode("cp1252")


def validar_placa_por_tipo(placa: str, tipo: str) -> str:
    """Valida que la placa esté en mayúsculas y cumpla el formato estricto según el tipo de vehículo."""
    normalizada = re.sub(r"[\s-]+", "", placa or "").upper()
    if tipo == "Carro":
        if not REGEX_PLACA_CARRO.match(normalizada):
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="La placa no corresponde al formato de carro (ej. ABC123)",
            )
    else:
        if not REGEX_PLACA_MOTO.match(normalizada):
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="La placa no corresponde al formato de moto (ej. ABC12D)",
            )
    return normalizada


def ensure_module2_schema(conn) -> None:
    """Aplica de forma idempotente y retrocompatible las extensiones de esquema y limpieza UTF-8 del Módulo 2."""
    with conn.cursor() as cur:
        # 1. Extender tabla propietario sin afectar columnas del Módulo 1
        cur.execute("ALTER TABLE propietario ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(10) NOT NULL DEFAULT 'CC'")
        cur.execute("ALTER TABLE propietario ADD COLUMN IF NOT EXISTS nombres VARCHAR(100)")
        cur.execute("ALTER TABLE propietario ADD COLUMN IF NOT EXISTS apellidos VARCHAR(100)")
        cur.execute("ALTER TABLE propietario ADD COLUMN IF NOT EXISTS correo VARCHAR(100)")
        cur.execute("ALTER TABLE propietario ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'Activo'")
        cur.execute("ALTER TABLE propietario ADD COLUMN IF NOT EXISTS motivo_inactivacion VARCHAR(255)")
        cur.execute("ALTER TABLE propietario ADD COLUMN IF NOT EXISTS fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")
        cur.execute("ALTER TABLE propietario ADD COLUMN IF NOT EXISTS usuario_registro VARCHAR(100) DEFAULT 'Administrador'")

        # 2. Extender tabla vehiculo sin afectar columnas del Módulo 1
        cur.execute("ALTER TABLE vehiculo ADD COLUMN IF NOT EXISTS id_vehiculo SERIAL")
        cur.execute("ALTER TABLE vehiculo ADD COLUMN IF NOT EXISTS marca VARCHAR(60) NOT NULL DEFAULT ''")
        cur.execute("ALTER TABLE vehiculo ADD COLUMN IF NOT EXISTS color VARCHAR(40) NOT NULL DEFAULT ''")
        cur.execute("ALTER TABLE vehiculo ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'Activo'")
        cur.execute("ALTER TABLE vehiculo ADD COLUMN IF NOT EXISTS motivo_inactivacion VARCHAR(255)")
        cur.execute("ALTER TABLE vehiculo ADD COLUMN IF NOT EXISTS fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP")

        # 3. Extender tabla espacio para motivo de mantenimiento
        cur.execute("ALTER TABLE espacio ADD COLUMN IF NOT EXISTS motivo_mantenimiento VARCHAR(255)")

        # 4. Crear tablas de trazabilidad del Módulo 2 si no existen
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS auditoria_usuario (
                id SERIAL PRIMARY KEY,
                id_propietario INT NOT NULL REFERENCES propietario(id_propietario) ON DELETE CASCADE,
                placa_vehiculo VARCHAR(10),
                campo_modificado VARCHAR(120) NOT NULL,
                valor_anterior TEXT,
                valor_nuevo TEXT,
                motivo VARCHAR(255),
                usuario_responsable VARCHAR(100) NOT NULL,
                fecha_cambio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS historial_celda (
                id SERIAL PRIMARY KEY,
                codigo_celda VARCHAR(10) NOT NULL,
                accion VARCHAR(120) NOT NULL,
                estado_anterior VARCHAR(30),
                estado_nuevo VARCHAR(30),
                motivo VARCHAR(255) NOT NULL,
                usuario_responsable VARCHAR(100) NOT NULL,
                fecha_cambio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute("CREATE INDEX IF NOT EXISTS ix_auditoria_usuario_propietario ON auditoria_usuario (id_propietario, fecha_cambio DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_historial_celda_codigo ON historial_celda (codigo_celda, fecha_cambio DESC)")

        # 5. Reparar mojibake de codificación y sincronizar nombres y apellidos en propietario
        cur.execute("SELECT id_propietario, documento, nombre, nombres, apellidos, tipo_documento, correo, estado, usuario_registro FROM propietario")
        propietarios = cur.fetchall()
        for p in propietarios:
            nombre_limpio = reparar_mojibake(p.get("nombre") or "").strip()
            # Correcciones específicas garantizadas para los datos de semilla
            if p.get("documento") == "1036000002" or "Laura" in nombre_limpio:
                if "G" in nombre_limpio and "mez" in nombre_limpio:
                    nombre_limpio = "Laura Gómez"
            elif p.get("documento") == "1036000003" or "Andr" in nombre_limpio:
                if "rez" in nombre_limpio:
                    nombre_limpio = "Andrés Pérez"
            elif p.get("documento") == "1036000004" or ("Mar" in nombre_limpio and "Ospina" in nombre_limpio):
                nombre_limpio = "María Ospina"

            partes = nombre_limpio.split(" ", 1)
            nombres_actual = reparar_mojibake(p.get("nombres") or "").strip()
            apellidos_actual = reparar_mojibake(p.get("apellidos") or "").strip()

            if not nombres_actual or "Ã" in (p.get("nombres") or "") or "\xad" in (p.get("nombres") or "") or p.get("documento") in ("1036000002", "1036000003", "1036000004"):
                nombres_final = partes[0] if partes else nombre_limpio
                apellidos_final = partes[1] if len(partes) > 1 else ""
            else:
                nombres_final = nombres_actual
                apellidos_final = apellidos_actual
                nombre_limpio = f"{nombres_final} {apellidos_final}".strip()

            cur.execute(
                """
                UPDATE propietario
                SET nombre = %s,
                    nombres = %s,
                    apellidos = %s,
                    tipo_documento = %s,
                    correo = %s,
                    estado = %s,
                    usuario_registro = %s
                WHERE id_propietario = %s
                """,
                (
                    sanitizar_bd(nombre_limpio),
                    sanitizar_bd(nombres_final),
                    sanitizar_bd(apellidos_final),
                    sanitizar_bd(p.get("tipo_documento") or "CC"),
                    sanitizar_bd(p.get("correo") or ""),
                    sanitizar_bd(p.get("estado") or "Activo"),
                    sanitizar_bd(p.get("usuario_registro") or "Administrador"),
                    p["id_propietario"],
                ),
            )

        # 6. Completar marca y color por defecto en vehículos de semilla que no los tenían definidos
        cur.execute(
            """
            UPDATE vehiculo
            SET marca = CASE WHEN tipo_vehiculo = 'Carro' THEN 'Renault' ELSE 'Yamaha' END,
                color = CASE WHEN tipo_vehiculo = 'Carro' THEN 'Gris' ELSE 'Negro' END
            WHERE marca = '' AND color = ''
            """
        )
    conn.commit()


def _formatear_iso(valor: Optional[datetime]) -> str:
    if not valor:
        return datetime.now().isoformat()
    if isinstance(valor, datetime):
        return valor.isoformat()
    return str(valor)


class Modulo2UsuarioConnection:
    """Operaciones de base de datos para la gestión de usuarios, vehículos (1 a N) y auditoría del Módulo 2."""

    def __init__(self, conn):
        self.conn = conn

    def list_usuarios(self, id_propietario_filtro: Optional[int] = None) -> List[dict]:
        with self.conn.cursor() as cur:
            if id_propietario_filtro is not None:
                cur.execute(
                    "SELECT * FROM propietario WHERE id_propietario = %s ORDER BY id_propietario DESC",
                    (id_propietario_filtro,),
                )
            else:
                cur.execute("SELECT * FROM propietario ORDER BY id_propietario DESC")
            propietarios = cur.fetchall()
            if not propietarios:
                return []

            cur.execute(
                """
                SELECT v.placa,
                       v.id_vehiculo,
                       v.tipo_vehiculo,
                       v.id_propietario,
                       COALESCE(NULLIF(v.marca, ''), 'Sin marca') AS marca,
                       COALESCE(NULLIF(v.color, ''), 'Sin color') AS color,
                       COALESCE(NULLIF(v.estado, ''), 'Activo') AS estado,
                       t.id_tiquete AS id_tiquete_abierto,
                       e.numero_espacio AS celda_ocupada
                FROM vehiculo v
                LEFT JOIN tiquete t
                       ON t.placa = v.placa AND t.fecha_hora_salida IS NULL AND NOT t.anulado
                LEFT JOIN espacio e
                       ON e.id_espacio = t.id_espacio
                ORDER BY v.id_vehiculo ASC, v.placa ASC
                """
            )
            vehiculos_rows = cur.fetchall()

            cur.execute(
                """
                SELECT id,
                       id_propietario,
                       placa_vehiculo,
                       campo_modificado,
                       valor_anterior,
                       valor_nuevo,
                       motivo,
                       usuario_responsable,
                       fecha_cambio
                FROM auditoria_usuario
                ORDER BY fecha_cambio DESC, id DESC
                """
            )
            auditoria_rows = cur.fetchall()

        vehiculos_por_prop: Dict[int, List[dict]] = {}
        for index, v in enumerate(vehiculos_rows, start=1):
            prop_id = v["id_propietario"]
            vehiculos_por_prop.setdefault(prop_id, []).append(
                {
                    "id": v.get("id_vehiculo") or index,
                    "placa": v["placa"],
                    "tipo": v["tipo_vehiculo"],
                    "marca": reparar_mojibake(v["marca"]),
                    "color": reparar_mojibake(v["color"]),
                    "estado": "Inactivo" if v["estado"] == "Inactivo" else "Activo",
                    "tieneEntradaAbierta": v["id_tiquete_abierto"] is not None,
                    "celdaOcupada": v["celda_ocupada"],
                }
            )

        auditoria_por_prop: Dict[int, List[dict]] = {}
        for a in auditoria_rows:
            prop_id = a["id_propietario"]
            auditoria_por_prop.setdefault(prop_id, []).append(
                {
                    "id": a["id"],
                    "fecha": _formatear_iso(a["fecha_cambio"]),
                    "usuario": reparar_mojibake(a["usuario_responsable"]),
                    "campo": reparar_mojibake(a["campo_modificado"]),
                    "valorAnterior": reparar_mojibake(a["valor_anterior"] or "Sin registro"),
                    "valorNuevo": reparar_mojibake(a["valor_nuevo"] or ""),
                    "motivo": reparar_mojibake(a.get("motivo")) if a.get("motivo") else None,
                    "placa": a.get("placa_vehiculo"),
                }
            )

        resultado: List[dict] = []
        for p in propietarios:
            prop_id = p["id_propietario"]
            nombre_completo = reparar_mojibake(p.get("nombre") or "").strip()
            partes = nombre_completo.split(" ", 1)
            nombres = reparar_mojibake(p.get("nombres") or partes[0] or "").strip()
            apellidos = reparar_mojibake(
                p.get("apellidos") if p.get("apellidos") is not None else (partes[1] if len(partes) > 1 else "")
            ).strip()
            tipo_doc = (p.get("tipo_documento") or "CC").strip().upper()
            if tipo_doc not in ("CC", "CE", "TI", "PAS"):
                tipo_doc = "CC"

            vehs = vehiculos_por_prop.get(prop_id, [])
            logs = auditoria_por_prop.get(prop_id, [])
            if not logs:
                placas_txt = ", ".join(f"{v['placa']} ({v['tipo']})" for v in vehs) or "Sin vehículos"
                logs = [
                    {
                        "id": prop_id * 1000,
                        "fecha": _formatear_iso(p.get("fecha_registro") or p.get("fecha_autorizacion")),
                        "usuario": reparar_mojibake(p.get("usuario_registro") or "Administrador"),
                        "campo": "Registro inicial (Usuario + Vehículo + Habeas Data)",
                        "valorAnterior": "Sin registro",
                        "valorNuevo": f"{tipo_doc} {p['documento']} · {nombres} {apellidos}".strip() + f" · {placas_txt}",
                        "motivo": None,
                        "placa": vehs[0]["placa"] if vehs else None,
                    }
                ]

            resultado.append(
                {
                    "id": prop_id,
                    "documentoTipo": tipo_doc,
                    "documento": p["documento"],
                    "nombres": nombres,
                    "apellidos": apellidos,
                    "celular": p.get("telefono") or "",
                    "correo": p.get("correo") or "",
                    "estado": "Inactivo" if p.get("estado") == "Inactivo" else "Activo",
                    "fechaRegistro": _formatear_iso(p.get("fecha_registro") or p.get("fecha_autorizacion")),
                    "operario": reparar_mojibake(p.get("usuario_registro") or "Administrador"),
                    "autorizacionHabeasData": bool(p.get("autoriza_datos", True)),
                    "tieneEntradaAbierta": any(v["tieneEntradaAbierta"] for v in vehs),
                    "vehiculos": vehs,
                    "auditLogs": logs,
                }
            )
        return resultado

    def get_usuario(self, id_propietario: int) -> dict:
        usuarios = self.list_usuarios(id_propietario_filtro=id_propietario)
        if not usuarios:
            raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
        return usuarios[0]

    def _asegurar_pago_inicial(self, cur, placa: str, tipo_vehiculo: str) -> None:
        """Garantiza que el vehículo recién creado en el Módulo 2 tenga mensualidad vigente para operar en el Módulo 1."""
        cur.execute("SELECT 1 FROM pago WHERE placa = %s LIMIT 1", (placa,))
        if cur.fetchone():
            return
        cur.execute("SELECT valor_mensual FROM tarifa WHERE tipo_vehiculo = %s", (tipo_vehiculo,))
        tarifa_row = cur.fetchone()
        monto = tarifa_row["valor_mensual"] if tarifa_row else (250000 if tipo_vehiculo == "Carro" else 100000)
        cur.execute(
            "INSERT INTO pago (placa, fecha_pago, monto) VALUES (%s, CURRENT_DATE, %s)",
            (placa, monto),
        )

    def crear_usuario_con_vehiculo(self, datos: UsuarioCrearSchema, usuario_responsable: str) -> dict:
        documento = (datos.documento or "").strip()
        nombres = reparar_mojibake(datos.nombres or "").strip()
        apellidos = reparar_mojibake(datos.apellidos or "").strip()
        celular = (datos.celular or "").strip()
        correo = (datos.correo or "").strip()
        marca = reparar_mojibake(datos.marca or "").strip()
        color = reparar_mojibake(datos.color or "").strip()

        if not documento or not nombres or not apellidos or not celular or not marca or not color:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Completa todos los campos obligatorios antes de guardar.",
            )
        if not datos.autorizacionHabeasData:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Debes autorizar el tratamiento de datos personales (Ley 1581 de 2012) para continuar.",
            )

        placa = validar_placa_por_tipo(datos.placa, datos.tipo)
        nombre_completo = f"{nombres} {apellidos}".strip()

        with self.conn.cursor() as cur:
            cur.execute(
                "SELECT id_propietario, tipo_documento, documento, nombre FROM propietario WHERE documento = %s",
                (documento,),
            )
            existente_doc = cur.fetchone()
            if existente_doc:
                tipo_existente = existente_doc.get("tipo_documento") or "CC"
                raise HTTPException(
                    status_code=HTTP_409_CONFLICT,
                    detail=f"El documento {tipo_existente} {documento} ya está registrado para {reparar_mojibake(existente_doc['nombre'])}.",
                )

            cur.execute("SELECT placa FROM vehiculo WHERE placa = %s", (placa,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=HTTP_409_CONFLICT,
                    detail=f"La placa {placa} ya está registrada en otro usuario del sistema.",
                )

            cur.execute(
                """
                INSERT INTO propietario (
                    tipo_documento, documento, nombre, nombres, apellidos,
                    telefono, correo, estado, autoriza_datos, fecha_autorizacion,
                    fecha_registro, usuario_registro
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 'Activo', TRUE, LOCALTIMESTAMP, LOCALTIMESTAMP, %s)
                RETURNING id_propietario
                """,
                (
                    datos.documentoTipo,
                    sanitizar_bd(documento),
                    sanitizar_bd(nombre_completo),
                    sanitizar_bd(nombres),
                    sanitizar_bd(apellidos),
                    sanitizar_bd(celular),
                    sanitizar_bd(correo),
                    sanitizar_bd(usuario_responsable),
                ),
            )
            id_propietario = cur.fetchone()["id_propietario"]

            cur.execute(
                """
                INSERT INTO vehiculo (placa, tipo_vehiculo, id_propietario, marca, color, estado, fecha_registro)
                VALUES (%s, %s, %s, %s, %s, 'Activo', LOCALTIMESTAMP)
                """,
                (placa, datos.tipo, id_propietario, sanitizar_bd(marca), sanitizar_bd(color)),
            )

            self._asegurar_pago_inicial(cur, placa, datos.tipo)

            cur.execute(
                """
                INSERT INTO auditoria_usuario (
                    id_propietario, placa_vehiculo, campo_modificado,
                    valor_anterior, valor_nuevo, usuario_responsable
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    id_propietario,
                    placa,
                    sanitizar_bd("Registro inicial (Usuario + Vehículo + Habeas Data)"),
                    "Sin registro",
                    sanitizar_bd(f"{datos.documentoTipo} {documento} · {nombre_completo} · Vehículo {placa} ({datos.tipo})"),
                    sanitizar_bd(usuario_responsable),
                ),
            )

        self.conn.commit()
        return self.get_usuario(id_propietario)

    def editar_usuario(self, id_propietario: int, datos: UsuarioEditarSchema, usuario_responsable: str) -> dict:
        celular = (datos.celular or "").strip()
        correo = (datos.correo or "").strip()
        if not celular:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="El celular del usuario es obligatorio.",
            )

        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM propietario WHERE id_propietario = %s", (id_propietario,))
            prop = cur.fetchone()
            if not prop:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

            if datos.documento is not None and datos.documento.strip() != prop["documento"]:
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail="El documento es único e ineditable tras su creación.",
                )

            vehiculo_target = None
            if datos.id_vehiculo is not None:
                cur.execute(
                    "SELECT * FROM vehiculo WHERE id_propietario = %s AND id_vehiculo = %s",
                    (id_propietario, datos.id_vehiculo),
                )
                vehiculo_target = cur.fetchone()
            if not vehiculo_target and datos.placa_vehiculo:
                cur.execute(
                    "SELECT * FROM vehiculo WHERE id_propietario = %s AND placa = %s",
                    (id_propietario, datos.placa_vehiculo.strip().upper()),
                )
                vehiculo_target = cur.fetchone()
            if not vehiculo_target:
                cur.execute(
                    "SELECT * FROM vehiculo WHERE id_propietario = %s ORDER BY id_vehiculo ASC, placa ASC LIMIT 1",
                    (id_propietario,),
                )
                vehiculo_target = cur.fetchone()

            if vehiculo_target and datos.placa is not None and datos.placa.strip().upper() != vehiculo_target["placa"]:
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail="La placa es única e ineditable tras su creación.",
                )

            prev_tel = (prop.get("telefono") or "").strip()
            prev_correo = (prop.get("correo") or "").strip()

            if prev_tel != celular or prev_correo != correo:
                nombres = reparar_mojibake(prop.get("nombres") or "").strip()
                apellidos = reparar_mojibake(prop.get("apellidos") or "").strip()
                nombre_sincronizado = f"{nombres} {apellidos}".strip() or reparar_mojibake(prop["nombre"])
                cur.execute(
                    "UPDATE propietario SET telefono = %s, correo = %s, nombre = %s WHERE id_propietario = %s",
                    (sanitizar_bd(celular), sanitizar_bd(correo), sanitizar_bd(nombre_sincronizado), id_propietario),
                )
                cur.execute(
                    """
                    INSERT INTO auditoria_usuario (
                        id_propietario, campo_modificado, valor_anterior, valor_nuevo, usuario_responsable
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        id_propietario,
                        sanitizar_bd("Datos de contacto (Celular / Correo)"),
                        sanitizar_bd(f"{prev_tel or 'Sin celular'} / {prev_correo or 'Sin correo'}"),
                        sanitizar_bd(f"{celular} / {correo or 'Sin correo'}"),
                        sanitizar_bd(usuario_responsable),
                    ),
                )

            if vehiculo_target and (datos.marca is not None or datos.color is not None):
                nueva_marca = reparar_mojibake(datos.marca if datos.marca is not None else vehiculo_target.get("marca") or "").strip()
                nuevo_color = reparar_mojibake(datos.color if datos.color is not None else vehiculo_target.get("color") or "").strip()
                if not nueva_marca or not nuevo_color:
                    raise HTTPException(
                        status_code=HTTP_400_BAD_REQUEST,
                        detail="El celular, la marca y el color del vehículo son obligatorios.",
                    )
                prev_marca = reparar_mojibake(vehiculo_target.get("marca") or "").strip()
                prev_color = reparar_mojibake(vehiculo_target.get("color") or "").strip()
                if prev_marca != nueva_marca or prev_color != nuevo_color:
                    placa_v = vehiculo_target["placa"]
                    cur.execute(
                        "UPDATE vehiculo SET marca = %s, color = %s WHERE placa = %s",
                        (sanitizar_bd(nueva_marca), sanitizar_bd(nuevo_color), placa_v),
                    )
                    cur.execute(
                        """
                        INSERT INTO auditoria_usuario (
                            id_propietario, placa_vehiculo, campo_modificado,
                            valor_anterior, valor_nuevo, usuario_responsable
                        )
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            id_propietario,
                            placa_v,
                            sanitizar_bd(f"Vehículo {placa_v} (Marca / Color)"),
                            sanitizar_bd(f"{prev_marca or 'Sin marca'} · {prev_color or 'Sin color'}"),
                            sanitizar_bd(f"{nueva_marca} · {nuevo_color}"),
                            sanitizar_bd(usuario_responsable),
                        ),
                    )

        self.conn.commit()
        return self.get_usuario(id_propietario)

    def asociar_vehiculo(self, id_propietario: int, datos: VehiculoAsociarSchema, usuario_responsable: str) -> dict:
        marca = reparar_mojibake(datos.marca or "").strip()
        color = reparar_mojibake(datos.color or "").strip()
        if not marca or not color:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Completa la placa, marca y color del vehículo.",
            )
        placa = validar_placa_por_tipo(datos.placa, datos.tipo)

        with self.conn.cursor() as cur:
            cur.execute("SELECT id_propietario FROM propietario WHERE id_propietario = %s", (id_propietario,))
            if not cur.fetchone():
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

            cur.execute("SELECT placa FROM vehiculo WHERE placa = %s", (placa,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=HTTP_409_CONFLICT,
                    detail=f"La placa {placa} ya está registrada en el sistema.",
                )

            cur.execute(
                """
                INSERT INTO vehiculo (placa, tipo_vehiculo, id_propietario, marca, color, estado, fecha_registro)
                VALUES (%s, %s, %s, %s, %s, 'Activo', LOCALTIMESTAMP)
                """,
                (placa, datos.tipo, id_propietario, sanitizar_bd(marca), sanitizar_bd(color)),
            )

            self._asegurar_pago_inicial(cur, placa, datos.tipo)

            cur.execute(
                """
                INSERT INTO auditoria_usuario (
                    id_propietario, placa_vehiculo, campo_modificado,
                    valor_anterior, valor_nuevo, usuario_responsable
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    id_propietario,
                    placa,
                    sanitizar_bd(f"Asociación de vehículo ({placa})"),
                    "Sin registro",
                    sanitizar_bd(f"{placa} · {datos.tipo} · {marca} · {color}"),
                    sanitizar_bd(usuario_responsable),
                ),
            )

        self.conn.commit()
        return self.get_usuario(id_propietario)

    def cambiar_estado_usuario(self, id_propietario: int, datos: CambioEstadoSchema, usuario_responsable: str) -> dict:
        motivo = reparar_mojibake(datos.motivo or "").strip()
        if not motivo:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Es obligatorio indicar un motivo para realizar este cambio de estado.",
            )

        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM propietario WHERE id_propietario = %s", (id_propietario,))
            prop = cur.fetchone()
            if not prop:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

            estado_anterior = "Inactivo" if prop.get("estado") == "Inactivo" else "Activo"
            nuevo_estado = datos.estado or ("Inactivo" if estado_anterior == "Activo" else "Activo")

            if nuevo_estado == "Inactivo":
                cur.execute(
                    """
                    SELECT t.placa, e.numero_espacio
                    FROM tiquete t
                    JOIN vehiculo v ON v.placa = t.placa
                    JOIN espacio e ON e.id_espacio = t.id_espacio
                    WHERE v.id_propietario = %s
                      AND t.fecha_hora_salida IS NULL
                      AND NOT t.anulado
                    LIMIT 1
                    """,
                    (id_propietario,),
                )
                abierto = cur.fetchone()
                if abierto:
                    raise HTTPException(
                        status_code=HTTP_400_BAD_REQUEST,
                        detail=(
                            f"No se puede inactivar al usuario porque el vehículo {abierto['placa']} "
                            f"tiene una entrada abierta en la celda {abierto['numero_espacio']}."
                        ),
                    )

            cur.execute(
                "UPDATE propietario SET estado = %s, motivo_inactivacion = %s WHERE id_propietario = %s",
                (nuevo_estado, sanitizar_bd(motivo) if nuevo_estado == "Inactivo" else None, id_propietario),
            )
            cur.execute(
                """
                INSERT INTO auditoria_usuario (
                    id_propietario, campo_modificado, valor_anterior, valor_nuevo, motivo, usuario_responsable
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    id_propietario,
                    "Estado de usuario",
                    estado_anterior,
                    sanitizar_bd(f"{nuevo_estado} (Motivo: {motivo})"),
                    sanitizar_bd(motivo),
                    sanitizar_bd(usuario_responsable),
                ),
            )

        self.conn.commit()
        return self.get_usuario(id_propietario)

    def cambiar_estado_vehiculo(self, placa: str, datos: CambioEstadoSchema, usuario_responsable: str) -> dict:
        placa_norm = re.sub(r"[\s-]+", "", placa or "").upper()
        motivo = reparar_mojibake(datos.motivo or "").strip()
        if not motivo:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Es obligatorio indicar un motivo para realizar este cambio de estado.",
            )

        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM vehiculo WHERE placa = %s", (placa_norm,))
            veh = cur.fetchone()
            if not veh:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")

            estado_anterior = "Inactivo" if veh.get("estado") == "Inactivo" else "Activo"
            nuevo_estado = datos.estado or ("Inactivo" if estado_anterior == "Activo" else "Activo")

            if nuevo_estado == "Inactivo":
                cur.execute(
                    """
                    SELECT t.placa, e.numero_espacio
                    FROM tiquete t
                    JOIN espacio e ON e.id_espacio = t.id_espacio
                    WHERE t.placa = %s
                      AND t.fecha_hora_salida IS NULL
                      AND NOT t.anulado
                    LIMIT 1
                    """,
                    (placa_norm,),
                )
                abierto = cur.fetchone()
                if abierto:
                    raise HTTPException(
                        status_code=HTTP_400_BAD_REQUEST,
                        detail=(
                            f"No se puede inactivar el vehículo {placa_norm} porque tiene "
                            f"una entrada abierta en la celda {abierto['numero_espacio']}."
                        ),
                    )

            cur.execute(
                "UPDATE vehiculo SET estado = %s, motivo_inactivacion = %s WHERE placa = %s",
                (nuevo_estado, sanitizar_bd(motivo) if nuevo_estado == "Inactivo" else None, placa_norm),
            )
            cur.execute(
                """
                INSERT INTO auditoria_usuario (
                    id_propietario, placa_vehiculo, campo_modificado,
                    valor_anterior, valor_nuevo, motivo, usuario_responsable
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    veh["id_propietario"],
                    placa_norm,
                    sanitizar_bd(f"Estado de vehículo {placa_norm}"),
                    estado_anterior,
                    sanitizar_bd(f"{nuevo_estado} (Motivo: {motivo})"),
                    sanitizar_bd(motivo),
                    sanitizar_bd(usuario_responsable),
                ),
            )

        self.conn.commit()
        return self.get_usuario(veh["id_propietario"])

    def eliminar_vehiculo(self, placa: str, usuario_responsable: str) -> dict:
        """Elimina/retira definitivamente un vehículo de un usuario siempre que no tenga entrada abierta."""
        placa_norm = re.sub(r"[\s-]+", "", placa or "").upper()
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM vehiculo WHERE placa = %s", (placa_norm,))
            veh = cur.fetchone()
            if not veh:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Vehículo no encontrado")

            cur.execute(
                """
                SELECT t.placa, e.numero_espacio
                FROM tiquete t
                JOIN espacio e ON e.id_espacio = t.id_espacio
                WHERE t.placa = %s
                  AND t.fecha_hora_salida IS NULL
                  AND NOT t.anulado
                LIMIT 1
                """,
                (placa_norm,),
            )
            abierto = cur.fetchone()
            if abierto:
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=(
                        f"No se puede eliminar el vehículo {placa_norm} porque tiene "
                        f"una entrada abierta en la celda {abierto['numero_espacio']}."
                    ),
                )

            id_propietario = veh["id_propietario"]
            tipo_v = veh["tipo_vehiculo"]
            marca_v = reparar_mojibake(veh.get("marca") or "Sin marca")
            color_v = reparar_mojibake(veh.get("color") or "Sin color")

            cur.execute("DELETE FROM pago WHERE placa = %s", (placa_norm,))
            cur.execute("DELETE FROM tiquete WHERE placa = %s", (placa_norm,))
            cur.execute("DELETE FROM vehiculo WHERE placa = %s", (placa_norm,))

            cur.execute(
                """
                INSERT INTO auditoria_usuario (
                    id_propietario, placa_vehiculo, campo_modificado,
                    valor_anterior, valor_nuevo, usuario_responsable
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    id_propietario,
                    placa_norm,
                    sanitizar_bd(f"Retiro de vehículo ({placa_norm})"),
                    sanitizar_bd(f"{placa_norm} · {tipo_v} · {marca_v} · {color_v}"),
                    sanitizar_bd("Vehículo eliminado del titular"),
                    sanitizar_bd(usuario_responsable),
                ),
            )

        self.conn.commit()
        return self.get_usuario(id_propietario)

    def eliminar_usuario(self, id_propietario: int, usuario_responsable: str) -> dict:
        """Elimina un usuario y sus vehículos asociados siempre que ninguno esté dentro del parqueadero."""
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM propietario WHERE id_propietario = %s", (id_propietario,))
            prop = cur.fetchone()
            if not prop:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Usuario no encontrado")

            cur.execute(
                """
                SELECT t.placa, e.numero_espacio
                FROM tiquete t
                JOIN vehiculo v ON v.placa = t.placa
                JOIN espacio e ON e.id_espacio = t.id_espacio
                WHERE v.id_propietario = %s
                  AND t.fecha_hora_salida IS NULL
                  AND NOT t.anulado
                LIMIT 1
                """,
                (id_propietario,),
            )
            abierto = cur.fetchone()
            if abierto:
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=(
                        f"No se puede eliminar al usuario porque el vehículo {abierto['placa']} "
                        f"tiene una entrada abierta en la celda {abierto['numero_espacio']}."
                    ),
                )

            cur.execute("SELECT placa FROM vehiculo WHERE id_propietario = %s", (id_propietario,))
            placas = [r["placa"] for r in cur.fetchall()]
            if placas:
                cur.execute("DELETE FROM pago WHERE placa = ANY(%s)", (placas,))
                cur.execute("DELETE FROM tiquete WHERE placa = ANY(%s)", (placas,))
                cur.execute("DELETE FROM vehiculo WHERE id_propietario = %s", (id_propietario,))

            cur.execute("DELETE FROM auditoria_usuario WHERE id_propietario = %s", (id_propietario,))
            cur.execute("DELETE FROM propietario WHERE id_propietario = %s", (id_propietario,))

        self.conn.commit()
        return {"detail": "Usuario eliminado correctamente", "id": id_propietario}


class Modulo2CeldaConnection:
    """Operaciones de base de datos para el Mapa de Celdas y su bitácora en el Módulo 2."""

    def __init__(self, conn):
        self.conn = conn

    def list_celdas(self, codigo_filtro: Optional[str] = None) -> List[dict]:
        with self.conn.cursor() as cur:
            if codigo_filtro:
                cur.execute(
                    """
                    SELECT e.id_espacio,
                           e.numero_espacio,
                           e.tipo_permitido,
                           e.estado,
                           e.motivo_mantenimiento,
                           t.placa AS placa_abierta,
                           t.fecha_hora_entrada
                    FROM espacio e
                    LEFT JOIN tiquete t
                           ON t.id_espacio = e.id_espacio
                          AND t.fecha_hora_salida IS NULL
                          AND NOT t.anulado
                    WHERE e.numero_espacio = %s
                    """,
                    (codigo_filtro,),
                )
            else:
                cur.execute(
                    """
                    SELECT e.id_espacio,
                           e.numero_espacio,
                           e.tipo_permitido,
                           e.estado,
                           e.motivo_mantenimiento,
                           t.placa AS placa_abierta,
                           t.fecha_hora_entrada
                    FROM espacio e
                    LEFT JOIN tiquete t
                           ON t.id_espacio = e.id_espacio
                          AND t.fecha_hora_salida IS NULL
                          AND NOT t.anulado
                    ORDER BY CASE WHEN e.tipo_permitido = 'Carro' THEN 0 ELSE 1 END,
                             e.numero_espacio ASC
                    """
                )
            espacios = cur.fetchall()
            if not espacios:
                return []

            cur.execute(
                """
                SELECT id, codigo_celda, accion, estado_anterior, estado_nuevo, motivo, usuario_responsable, fecha_cambio
                FROM historial_celda
                ORDER BY fecha_cambio DESC, id DESC
                """
            )
            historial_rows = cur.fetchall()

        hist_por_celda: Dict[str, List[dict]] = {}
        for h in historial_rows:
            cod = h["codigo_celda"]
            hist_por_celda.setdefault(cod, []).append(
                {
                    "id": h["id"],
                    "momento": _formatear_iso(h["fecha_cambio"]),
                    "usuario": reparar_mojibake(h["usuario_responsable"]),
                    "accion": reparar_mojibake(h["accion"]),
                    "motivo": reparar_mojibake(h["motivo"]),
                }
            )

        resultado: List[dict] = []
        for row in espacios:
            codigo = row["numero_espacio"]
            placa_abierta = row.get("placa_abierta")
            fecha_entrada = row.get("fecha_hora_entrada")

            if placa_abierta or row["estado"] == "Ocupado":
                estado_ui = "Ocupada"
                hora_str = fecha_entrada.strftime("%H:%M") if isinstance(fecha_entrada, datetime) else None
                motivo_actual = None
            elif row["estado"] == "Mantenimiento":
                estado_ui = "Fuera de servicio"
                hora_str = None
                hist_celda = hist_por_celda.get(codigo, [])
                motivo_raw = row.get("motivo_mantenimiento") or (hist_celda[0]["motivo"] if hist_celda else "En mantenimiento")
                motivo_actual = reparar_mojibake(motivo_raw)
            else:
                estado_ui = "Libre"
                hora_str = None
                motivo_actual = None

            historial = hist_por_celda.get(codigo)
            if not historial:
                historial = [
                    {
                        "id": row["id_espacio"] * 1000,
                        "momento": datetime.now().isoformat(),
                        "usuario": "Administrador",
                        "accion": "Configuración inicial",
                        "motivo": "Celda creada y habilitada.",
                    }
                ]

            resultado.append(
                {
                    "id": row["id_espacio"],
                    "codigo": codigo,
                    "tipo": row["tipo_permitido"],
                    "estado": estado_ui,
                    "placa": placa_abierta,
                    "hora": hora_str,
                    "motivo": motivo_actual,
                    "historial": historial,
                }
            )
        return resultado

    def inicializar_celdas(self, usuario_responsable: str) -> List[dict]:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO espacio (numero_espacio, tipo_permitido)
                SELECT 'C-' || LPAD(n::text, 2, '0'), 'Carro' FROM generate_series(1, 70) AS n
                ON CONFLICT (numero_espacio) DO NOTHING
                """
            )
            cur.execute(
                """
                INSERT INTO espacio (numero_espacio, tipo_permitido)
                SELECT 'M-' || LPAD(n::text, 2, '0'), 'Moto' FROM generate_series(1, 10) AS n
                ON CONFLICT (numero_espacio) DO NOTHING
                """
            )
            cur.execute(
                """
                INSERT INTO historial_celda (codigo_celda, accion, estado_anterior, estado_nuevo, motivo, usuario_responsable)
                SELECT e.numero_espacio, %s, 'Sin registro', 'Libre', 'Celda creada y habilitada.', %s
                FROM espacio e
                WHERE NOT EXISTS (
                    SELECT 1 FROM historial_celda h WHERE h.codigo_celda = e.numero_espacio
                )
                """,
                (sanitizar_bd("Configuración inicial"), sanitizar_bd(usuario_responsable)),
            )
        self.conn.commit()
        return self.list_celdas()

    def crear_celda(self, datos: CeldaCrearSchema, usuario_responsable: str) -> dict:
        codigo = (datos.codigo or "").strip().upper()
        if not codigo:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Debes ingresar un código para la celda (ej. C-71).",
            )

        with self.conn.cursor() as cur:
            cur.execute("SELECT 1 FROM espacio WHERE UPPER(numero_espacio) = %s", (codigo,))
            if cur.fetchone():
                raise HTTPException(
                    status_code=HTTP_409_CONFLICT,
                    detail=f"El código de celda {codigo} ya existe en el mapa.",
                )

            cur.execute(
                """
                INSERT INTO espacio (numero_espacio, tipo_permitido, estado)
                VALUES (%s, %s, 'Disponible')
                """,
                (sanitizar_bd(codigo), datos.tipo),
            )
            cur.execute(
                """
                INSERT INTO historial_celda (
                    codigo_celda, accion, estado_anterior, estado_nuevo, motivo, usuario_responsable
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    sanitizar_bd(codigo),
                    sanitizar_bd("Creación de celda"),
                    "Sin registro",
                    "Libre",
                    sanitizar_bd(f"Celda {codigo} ({datos.tipo}) creada por administración."),
                    sanitizar_bd(usuario_responsable),
                ),
            )
        self.conn.commit()
        celdas = self.list_celdas(codigo_filtro=codigo)
        return celdas[0]

    def _contar_cupo_requerido(self, cur, tipo_vehiculo: str) -> int:
        """Calcula las mensualidades/vehículos activos vigentes para garantizar el cupo de un tipo de celda."""
        cur.execute(
            """
            SELECT COUNT(*) AS activos
            FROM vehiculo v
            JOIN propietario p ON p.id_propietario = v.id_propietario
            WHERE v.tipo_vehiculo = %s
              AND COALESCE(v.estado, 'Activo') = 'Activo'
              AND COALESCE(p.estado, 'Activo') = 'Activo'
            """,
            (tipo_vehiculo,),
        )
        activos = cur.fetchone()["activos"]

        cur.execute(
            """
            SELECT COUNT(*) AS ocupadas
            FROM espacio
            WHERE tipo_permitido = %s AND estado = 'Ocupado'
            """,
            (tipo_vehiculo,),
        )
        ocupadas = cur.fetchone()["ocupadas"]
        return max(activos, ocupadas)

    def actualizar_celda(self, codigo: str, datos: CeldaActualizarSchema, usuario_responsable: str) -> dict:
        codigo_norm = (codigo or "").strip().upper()
        motivo = reparar_mojibake(datos.motivo or "").strip()
        if not motivo:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="El motivo es obligatorio para modificar el estado o tipo de la celda.",
            )

        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT e.id_espacio,
                       e.numero_espacio,
                       e.tipo_permitido,
                       e.estado,
                       t.placa AS placa_abierta
                FROM espacio e
                LEFT JOIN tiquete t
                       ON t.id_espacio = e.id_espacio
                      AND t.fecha_hora_salida IS NULL
                      AND NOT t.anulado
                WHERE UPPER(e.numero_espacio) = %s
                """,
                (codigo_norm,),
            )
            celda = cur.fetchone()
            if not celda:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Celda no encontrada")

            codigo_real = celda["numero_espacio"]
            tipo_actual = celda["tipo_permitido"]
            estado_bd_actual = celda["estado"]
            placa_abierta = celda.get("placa_abierta")

            if placa_abierta or estado_bd_actual == "Ocupado":
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=(
                        f"No se puede modificar la celda {codigo_real} porque está ocupada "
                        f"actualmente por el vehículo de placa {placa_abierta or 'registrado'}."
                    ),
                )

            estado_ui_actual = "Fuera de servicio" if estado_bd_actual == "Mantenimiento" else "Libre"

            # Caso 1: cambio de estado operativo (Libre <-> Fuera de servicio)
            if datos.estado is not None and datos.estado != estado_ui_actual:
                if datos.estado == "Fuera de servicio":
                    cur.execute(
                        "SELECT COUNT(*) AS disponibles FROM espacio WHERE tipo_permitido = %s AND estado != 'Mantenimiento'",
                        (tipo_actual,),
                    )
                    disponibles = cur.fetchone()["disponibles"]
                    cupo_requerido = self._contar_cupo_requerido(cur, tipo_actual)
                    if disponibles - 1 < cupo_requerido:
                        raise HTTPException(
                            status_code=HTTP_400_BAD_REQUEST,
                            detail=(
                                f"Cupo garantizado: no se puede poner la celda {codigo_real} en Fuera de servicio "
                                f"porque quedarían {disponibles - 1} celdas disponibles de {tipo_actual.lower()} "
                                f"para {cupo_requerido} mensualidades vigentes."
                            ),
                        )
                    nuevo_estado_bd = "Mantenimiento"
                    motivo_mant = sanitizar_bd(motivo)
                    accion = "Cambio de Libre a Fuera de servicio"
                else:
                    nuevo_estado_bd = "Disponible"
                    motivo_mant = None
                    accion = "Restablecimiento de Fuera de servicio a Libre"

                cur.execute(
                    "UPDATE espacio SET estado = %s, motivo_mantenimiento = %s WHERE id_espacio = %s",
                    (nuevo_estado_bd, motivo_mant, celda["id_espacio"]),
                )
                cur.execute(
                    """
                    INSERT INTO historial_celda (
                        codigo_celda, accion, estado_anterior, estado_nuevo, motivo, usuario_responsable
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        sanitizar_bd(codigo_real),
                        sanitizar_bd(accion),
                        sanitizar_bd(estado_ui_actual),
                        sanitizar_bd(datos.estado),
                        sanitizar_bd(motivo),
                        sanitizar_bd(usuario_responsable),
                    ),
                )

            # Caso 2: cambio de tipo de celda (Carro <-> Moto)
            if datos.tipo is not None:
                if datos.tipo == tipo_actual and datos.estado is None:
                    raise HTTPException(
                        status_code=HTTP_400_BAD_REQUEST,
                        detail=f"La celda {codigo_real} ya está configurada para {tipo_actual}.",
                    )
                if datos.tipo != tipo_actual:
                    if estado_ui_actual != "Fuera de servicio":
                        cur.execute(
                            "SELECT COUNT(*) AS disponibles FROM espacio WHERE tipo_permitido = %s AND estado != 'Mantenimiento'",
                            (tipo_actual,),
                        )
                        disponibles = cur.fetchone()["disponibles"]
                        cupo_requerido = self._contar_cupo_requerido(cur, tipo_actual)
                        if disponibles - 1 < cupo_requerido:
                            raise HTTPException(
                                status_code=HTTP_400_BAD_REQUEST,
                                detail=(
                                    f"Cupo garantizado: no se puede cambiar el tipo de {codigo_real} "
                                    f"porque quedarían {disponibles - 1} celdas disponibles de {tipo_actual.lower()} "
                                    f"para {cupo_requerido} mensualidades vigentes."
                                ),
                            )
                    cur.execute(
                        "UPDATE espacio SET tipo_permitido = %s WHERE id_espacio = %s",
                        (datos.tipo, celda["id_espacio"]),
                    )
                    cur.execute(
                        """
                        INSERT INTO historial_celda (
                            codigo_celda, accion, estado_anterior, estado_nuevo, motivo, usuario_responsable
                        )
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            sanitizar_bd(codigo_real),
                            sanitizar_bd(f"Cambio de tipo ({tipo_actual} a {datos.tipo})"),
                            sanitizar_bd(tipo_actual),
                            sanitizar_bd(datos.tipo),
                            sanitizar_bd(motivo),
                            sanitizar_bd(usuario_responsable),
                        ),
                    )

        self.conn.commit()
        celdas = self.list_celdas(codigo_filtro=codigo_real)
        return celdas[0]

    def eliminar_celda(self, codigo: str, usuario_responsable: str) -> dict:
        """Elimina una celda del inventario validando que no esté ocupada y que respete el cupo garantizado."""
        codigo_norm = (codigo or "").strip().upper()
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT e.id_espacio,
                       e.numero_espacio,
                       e.tipo_permitido,
                       e.estado,
                       t.placa AS placa_abierta
                FROM espacio e
                LEFT JOIN tiquete t
                       ON t.id_espacio = e.id_espacio
                      AND t.fecha_hora_salida IS NULL
                      AND NOT t.anulado
                WHERE UPPER(e.numero_espacio) = %s
                """,
                (codigo_norm,),
            )
            celda = cur.fetchone()
            if not celda:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Celda no encontrada")

            codigo_real = celda["numero_espacio"]
            tipo_actual = celda["tipo_permitido"]
            estado_bd_actual = celda["estado"]
            placa_abierta = celda.get("placa_abierta")

            if placa_abierta or estado_bd_actual == "Ocupado":
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=(
                        f"No se puede eliminar la celda {codigo_real} porque está ocupada "
                        f"actualmente por el vehículo de placa {placa_abierta or 'registrado'}."
                    ),
                )

            if estado_bd_actual != "Mantenimiento":
                cur.execute(
                    "SELECT COUNT(*) AS disponibles FROM espacio WHERE tipo_permitido = %s AND estado != 'Mantenimiento'",
                    (tipo_actual,),
                )
                disponibles = cur.fetchone()["disponibles"]
                cupo_requerido = self._contar_cupo_requerido(cur, tipo_actual)
                if disponibles - 1 < cupo_requerido:
                    raise HTTPException(
                        status_code=HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Cupo garantizado: no se puede eliminar la celda {codigo_real} "
                            f"porque quedarían {disponibles - 1} celdas disponibles de {tipo_actual.lower()} "
                            f"para {cupo_requerido} mensualidades vigentes."
                        ),
                    )

            # Si existen tiquetes cerrados/anulados históricos asociados a este id_espacio,
            # se reasignan a otra celda o se eliminan para evitar violación de Foreign Key.
            cur.execute(
                "SELECT id_espacio FROM espacio WHERE id_espacio <> %s ORDER BY id_espacio ASC LIMIT 1",
                (celda["id_espacio"],),
            )
            otra_celda = cur.fetchone()
            if otra_celda:
                cur.execute(
                    "UPDATE tiquete SET id_espacio = %s WHERE id_espacio = %s",
                    (otra_celda["id_espacio"], celda["id_espacio"]),
                )
            else:
                cur.execute("DELETE FROM tiquete WHERE id_espacio = %s", (celda["id_espacio"],))

            cur.execute("DELETE FROM historial_celda WHERE codigo_celda = %s", (codigo_real,))
            cur.execute("DELETE FROM espacio WHERE id_espacio = %s", (celda["id_espacio"],))

        self.conn.commit()
        return {"detail": f"Celda {codigo_real} eliminada correctamente", "codigo": codigo_real}
