from datetime import date, datetime, timedelta, timezone
import json
import os
import re
from typing import Dict, List, Optional

from fastapi import HTTPException
from starlette.status import HTTP_400_BAD_REQUEST, HTTP_404_NOT_FOUND, HTTP_409_CONFLICT

from models.modulo2_connection import reparar_mojibake, sanitizar_bd
from schema.modulo3_schema import PagoAnularSchema, PagoCrearSchema, TarifaCrearSchema

COLOMBIA_TZ = timezone(timedelta(hours=-5))
TARIFA_INICIAL_CARRO = 120000
TARIFA_INICIAL_MOTO = 65000


def hoy_colombia() -> date:
    """Retorna la fecha actual en la zona horaria oficial de Colombia (America/Bogota, UTC-5)."""
    return datetime.now(COLOMBIA_TZ).date()


def ahora_colombia_naive() -> datetime:
    """Retorna fecha y hora actual de Colombia sin tzinfo para columnas TIMESTAMP de PostgreSQL."""
    return datetime.now(COLOMBIA_TZ).replace(tzinfo=None)


def _fmt_iso(val) -> str:
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, date):
        return val.isoformat()
    return str(val or "")


def ensure_module3_schema(conn) -> None:
    """Crea de forma retrocompatible las tablas del Módulo 3 (tarifa_mensualidad, pago_mensualidad, auditoria_reporte)
    e inserta las tarifas iniciales si la tabla está vacía."""
    hoy = hoy_colombia()
    with conn.cursor() as cur:
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS tarifa_mensualidad (
                id SERIAL PRIMARY KEY,
                tipo_vehiculo VARCHAR(20) NOT NULL CHECK (tipo_vehiculo IN ('Carro', 'Moto')),
                valor_cop INTEGER NOT NULL CHECK (valor_cop > 0),
                valor_anterior_cop INTEGER,
                fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
                motivo TEXT NOT NULL,
                usuario_responsable VARCHAR(100) NOT NULL,
                fecha_cambio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS pago_mensualidad (
                id SERIAL PRIMARY KEY,
                numero_comprobante VARCHAR(20) UNIQUE NOT NULL,
                id_propietario INTEGER NOT NULL REFERENCES propietario(id_propietario) ON DELETE CASCADE,
                placa_vehiculo VARCHAR(10) NOT NULL REFERENCES vehiculo(placa) ON DELETE CASCADE,
                tipo_vehiculo VARCHAR(20) NOT NULL CHECK (tipo_vehiculo IN ('Carro', 'Moto')),
                meses_pagados INTEGER NOT NULL CHECK (meses_pagados BETWEEN 1 AND 3),
                valor_unitario_cop INTEGER NOT NULL CHECK (valor_unitario_cop > 0),
                valor_total_cop INTEGER NOT NULL CHECK (valor_total_cop > 0),
                fecha_inicio_vigencia DATE NOT NULL,
                fecha_fin_vigencia DATE NOT NULL,
                metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta')),
                referencia_pago VARCHAR(100),
                valor_recibido_cop INTEGER,
                cambio_cop INTEGER,
                estado VARCHAR(20) NOT NULL DEFAULT 'Registrado' CHECK (estado IN ('Registrado', 'Anulado')),
                operario_registro VARCHAR(100) NOT NULL,
                fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                usuario_anulacion VARCHAR(100),
                fecha_anulacion TIMESTAMP,
                motivo_anulacion TEXT
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS auditoria_reporte (
                id SERIAL PRIMARY KEY,
                usuario_responsable VARCHAR(100) NOT NULL,
                fecha_generacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                rango_fechas VARCHAR(60) NOT NULL,
                filtros TEXT
            )
            """
        )

        cur.execute("CREATE INDEX IF NOT EXISTS ix_pago_mensualidad_placa ON pago_mensualidad (placa_vehiculo, id DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_pago_mensualidad_fecha ON pago_mensualidad (fecha_registro DESC, id DESC)")
        cur.execute("CREATE INDEX IF NOT EXISTS ix_tarifa_mensualidad_tipo ON tarifa_mensualidad (tipo_vehiculo, fecha_inicio DESC, id DESC)")

        # Semilla de tarifas iniciales si tarifa_mensualidad está vacía
        cur.execute("SELECT COUNT(*) AS total FROM tarifa_mensualidad")
        if cur.fetchone()["total"] == 0:
            cur.execute(
                """
                INSERT INTO tarifa_mensualidad (
                    tipo_vehiculo, valor_cop, valor_anterior_cop, fecha_inicio, motivo, usuario_responsable
                )
                VALUES
                    ('Carro', %s, %s, %s, %s, 'Administrador'),
                    ('Moto', %s, %s, %s, %s, 'Administrador')
                """,
                (
                    TARIFA_INICIAL_CARRO,
                    TARIFA_INICIAL_CARRO,
                    hoy,
                    sanitizar_bd("Tarifa mensual base inicial para automóviles"),
                    TARIFA_INICIAL_MOTO,
                    TARIFA_INICIAL_MOTO,
                    hoy,
                    sanitizar_bd("Tarifa mensual base inicial para motocicletas"),
                ),
            )

        # Sincronizar tabla legacy tarifa si está vacía
        cur.execute("SELECT COUNT(*) AS total FROM tarifa")
        if cur.fetchone()["total"] == 0:
            cur.execute(
                """
                INSERT INTO tarifa (tipo_vehiculo, valor_mensual)
                VALUES ('Carro', %s), ('Moto', %s)
                ON CONFLICT (tipo_vehiculo) DO NOTHING
                """,
                (TARIFA_INICIAL_CARRO, TARIFA_INICIAL_MOTO),
            )

        # En entorno de desarrollo (no base _test), si pago_mensualidad está vacía pero ya existen vehículos
        # registrados con pagos iniciales en `pago`, sembramos registros en pago_mensualidad para que el
        # historial y vencimientos reflejen los vehículos actuales de la base de datos.
        db_name = os.environ.get("PGNAMEDATABASE", "")
        if not db_name.endswith("_test"):
            cur.execute("SELECT COUNT(*) AS total FROM pago_mensualidad")
            if cur.fetchone()["total"] == 0:
                cur.execute(
                    """
                    SELECT DISTINCT ON (v.placa)
                           v.placa,
                           v.tipo_vehiculo,
                           v.id_propietario,
                           COALESCE(p.usuario_registro, 'Administrador') AS operario,
                           pg.fecha_pago
                    FROM vehiculo v
                    JOIN propietario p ON p.id_propietario = v.id_propietario
                    LEFT JOIN pago pg ON pg.placa = v.placa
                    ORDER BY v.placa, pg.fecha_pago DESC NULLS LAST, pg.id_pago DESC NULLS LAST
                    """
                )
                rows = cur.fetchall()
                presets = [
                    (-7, "Efectivo", None),   # Al día (+22 días)
                    (-26, "Efectivo", None),  # Por vencer (+3 días)
                    (-33, "Efectivo", None),  # Vencida (-4 días)
                    (-11, "Efectivo", None),  # Al día (+18 días)
                ]
                seq = 1
                for idx, r in enumerate(rows):
                    if r.get("fecha_pago") is not None:
                        fecha_ini = r["fecha_pago"]
                        metodo = "Efectivo"
                        ref = None
                    else:
                        offset, metodo, ref = presets[idx % len(presets)]
                        fecha_ini = hoy + timedelta(days=offset)
                    fecha_fin = fecha_ini + timedelta(days=29)
                    unitario = TARIFA_INICIAL_CARRO if r["tipo_vehiculo"] == "Carro" else TARIFA_INICIAL_MOTO
                    consecutivo = f"REC-{seq:04d}"
                    cur.execute(
                        """
                        INSERT INTO pago_mensualidad (
                            numero_comprobante, id_propietario, placa_vehiculo, tipo_vehiculo,
                            meses_pagados, valor_unitario_cop, valor_total_cop,
                            fecha_inicio_vigencia, fecha_fin_vigencia,
                            metodo_pago, referencia_pago, valor_recibido_cop, cambio_cop,
                            estado, operario_registro, fecha_registro
                        )
                        VALUES (%s, %s, %s, %s, 1, %s, %s, %s, %s, %s, %s, %s, %s, 'Registrado', %s, %s)
                        ON CONFLICT (numero_comprobante) DO NOTHING
                        """,
                        (
                            consecutivo,
                            r["id_propietario"],
                            r["placa"],
                            r["tipo_vehiculo"],
                            unitario,
                            unitario,
                            fecha_ini,
                            fecha_fin,
                            metodo,
                            ref,
                            unitario,
                            0,
                            sanitizar_bd(reparar_mojibake(r["operario"] or "Administrador")),
                            datetime.combine(fecha_ini, datetime.min.time()) + timedelta(hours=9, minutes=15 + idx * 5),
                        ),
                    )
                    seq += 1

        # Normalizar cualquier pago existente a Efectivo
        cur.execute(
            """
            UPDATE pago_mensualidad
            SET metodo_pago = 'Efectivo',
                referencia_pago = NULL,
                valor_recibido_cop = COALESCE(valor_recibido_cop, valor_total_cop),
                cambio_cop = COALESCE(cambio_cop, 0)
            WHERE metodo_pago <> 'Efectivo' OR valor_recibido_cop IS NULL
            """
        )

    conn.commit()


class Modulo3TarifaConnection:
    """Gestión de tarifas de mensualidad e historial de cambios (HU-P10, RN-P09)."""

    def __init__(self, conn):
        self.conn = conn

    def obtener_tarifa_vigente(self, cur, tipo_vehiculo: str) -> int:
        hoy = hoy_colombia()
        cur.execute(
            """
            SELECT valor_cop
            FROM tarifa_mensualidad
            WHERE tipo_vehiculo = %s AND fecha_inicio <= %s
            ORDER BY fecha_inicio DESC, id DESC
            LIMIT 1
            """,
            (tipo_vehiculo, hoy),
        )
        row = cur.fetchone()
        if row and row.get("valor_cop"):
            return int(row["valor_cop"])

        cur.execute(
            """
            SELECT valor_cop
            FROM tarifa_mensualidad
            WHERE tipo_vehiculo = %s
            ORDER BY id DESC
            LIMIT 1
            """,
            (tipo_vehiculo,),
        )
        fallback = cur.fetchone()
        if fallback and fallback.get("valor_cop"):
            return int(fallback["valor_cop"])

        return TARIFA_INICIAL_CARRO if tipo_vehiculo == "Carro" else TARIFA_INICIAL_MOTO

    def listar_tarifas(self) -> dict:
        with self.conn.cursor() as cur:
            carro_val = self.obtener_tarifa_vigente(cur, "Carro")
            moto_val = self.obtener_tarifa_vigente(cur, "Moto")

            cur.execute(
                """
                SELECT id, tipo_vehiculo, valor_cop, valor_anterior_cop,
                       fecha_inicio, motivo, usuario_responsable, fecha_cambio
                FROM tarifa_mensualidad
                ORDER BY fecha_cambio DESC, id DESC
                """
            )
            rows = cur.fetchall()

        historial = [
            {
                "id": r["id"],
                "tipo": r["tipo_vehiculo"],
                "valorAnterior": int(r["valor_anterior_cop"] if r.get("valor_anterior_cop") is not None else r["valor_cop"]),
                "valorNuevo": int(r["valor_cop"]),
                "fechaInicioVigencia": _fmt_iso(r["fecha_inicio"]),
                "motivo": reparar_mojibake(r.get("motivo") or ""),
                "usuarioResponsable": reparar_mojibake(r.get("usuario_responsable") or "Administrador"),
                "fechaRegistro": _fmt_iso(r["fecha_cambio"]),
            }
            for r in rows
        ]

        return {
            "Carro": carro_val,
            "Moto": moto_val,
            "tarifas": [
                {"tipo_vehiculo": "Carro", "valor_mensual": carro_val, "valor_cop": carro_val},
                {"tipo_vehiculo": "Moto", "valor_mensual": moto_val, "valor_cop": moto_val},
            ],
            "historial": historial,
        }

    def crear_tarifa(self, datos: TarifaCrearSchema, usuario_responsable: str) -> dict:
        hoy = hoy_colombia()
        if not isinstance(datos.valor_cop, int) or datos.valor_cop <= 0:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="El nuevo valor de la tarifa debe ser un número entero en COP mayor a 0.",
            )
        fecha_inicio = datos.fecha_inicio or hoy
        if fecha_inicio < hoy:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="La fecha de inicio de vigencia debe ser hoy o una fecha futura (nunca pasada).",
            )
        motivo = reparar_mojibake(datos.motivo or "").strip()
        if not motivo:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="El motivo del cambio de tarifa es obligatorio.",
            )

        with self.conn.cursor() as cur:
            valor_anterior = self.obtener_tarifa_vigente(cur, datos.tipo_vehiculo)
            cur.execute(
                """
                INSERT INTO tarifa_mensualidad (
                    tipo_vehiculo, valor_cop, valor_anterior_cop, fecha_inicio, motivo, usuario_responsable, fecha_cambio
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    datos.tipo_vehiculo,
                    int(datos.valor_cop),
                    int(valor_anterior),
                    fecha_inicio,
                    sanitizar_bd(motivo),
                    sanitizar_bd(usuario_responsable),
                    ahora_colombia_naive(),
                ),
            )
            if fecha_inicio <= hoy:
                cur.execute(
                    """
                    INSERT INTO tarifa (tipo_vehiculo, valor_mensual)
                    VALUES (%s, %s)
                    ON CONFLICT (tipo_vehiculo) DO UPDATE SET valor_mensual = EXCLUDED.valor_mensual
                    """,
                    (datos.tipo_vehiculo, int(datos.valor_cop)),
                )

        self.conn.commit()
        return self.listar_tarifas()


class Modulo3PagoConnection:
    """Gestión de cobros de mensualidades, anulaciones, vencimientos, caja del día y reportes (HU-P01 a HU-P12)."""

    def __init__(self, conn):
        self.conn = conn

    @staticmethod
    def contar_clientes_al_dia_por_tipo(cur, tipo_vehiculo: str) -> int:
        """Cuenta los vehículos activos (de propietarios activos) de ese tipo cuya mensualidad está Vigente o Por vencer."""
        hoy = hoy_colombia()
        cur.execute(
            """
            WITH ultimo_pago AS (
                SELECT DISTINCT ON (placa_vehiculo)
                       placa_vehiculo,
                       fecha_fin_vigencia
                FROM pago_mensualidad
                WHERE estado = 'Registrado'
                ORDER BY placa_vehiculo, id DESC
            )
            SELECT COUNT(*) AS al_dia
            FROM vehiculo v
            JOIN propietario p ON p.id_propietario = v.id_propietario
            JOIN ultimo_pago up ON up.placa_vehiculo = v.placa
            WHERE v.tipo_vehiculo = %s
              AND COALESCE(v.estado, 'Activo') = 'Activo'
              AND COALESCE(p.estado, 'Activo') = 'Activo'
              AND up.fecha_fin_vigencia >= %s
            """,
            (tipo_vehiculo, hoy),
        )
        return int(cur.fetchone()["al_dia"])

    def obtener_estado_placa(self, placa: str) -> dict:
        """HU-P06: calcula en tiempo real el estado de la mensualidad de una placa sin exponer montos ni datos personales."""
        placa_norm = re.sub(r"[\s-]+", "", placa or "").upper()
        hoy = hoy_colombia()

        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT v.placa,
                       v.tipo_vehiculo,
                       COALESCE(v.estado, 'Activo') AS estado_vehiculo,
                       COALESCE(p.estado, 'Activo') AS estado_usuario
                FROM vehiculo v
                JOIN propietario p ON p.id_propietario = v.id_propietario
                WHERE v.placa = %s
                """,
                (placa_norm,),
            )
            veh = cur.fetchone()
            if not veh:
                raise HTTPException(
                    status_code=HTTP_404_NOT_FOUND,
                    detail="El vehículo no está asociado a ningún usuario registrado",
                )

            cur.execute(
                """
                SELECT fecha_inicio_vigencia, fecha_fin_vigencia
                FROM pago_mensualidad
                WHERE placa_vehiculo = %s AND estado = 'Registrado'
                ORDER BY id DESC
                LIMIT 1
                """,
                (placa_norm,),
            )
            ultimo = cur.fetchone()

            # Fallback retrocompatible a tabla legacy `pago` solo si la placa nunca ha tenido registros en pago_mensualidad
            if not ultimo:
                cur.execute("SELECT COUNT(*) AS total FROM pago_mensualidad WHERE placa_vehiculo = %s", (placa_norm,))
                tiene_historial_mod3 = cur.fetchone()["total"] > 0
                if not tiene_historial_mod3:
                    cur.execute(
                        """
                        SELECT fecha_pago
                        FROM pago
                        WHERE placa = %s AND fecha_pago <= CURRENT_DATE
                        ORDER BY fecha_pago DESC, id_pago DESC
                        LIMIT 1
                        """,
                        (placa_norm,),
                    )
                    legacy = cur.fetchone()
                    if legacy:
                        ultimo = {
                            "fecha_inicio_vigencia": legacy["fecha_pago"],
                            "fecha_fin_vigencia": legacy["fecha_pago"] + timedelta(days=29),
                        }

        usuario_activo = veh["estado_usuario"] == "Activo"
        vehiculo_activo = veh["estado_vehiculo"] == "Activo"

        if not ultimo:
            return {
                "placa": veh["placa"],
                "tipo_vehiculo": veh["tipo_vehiculo"],
                "estado": "Sin mensualidad",
                "estado_ui": "Sin mensualidad",
                "fecha_inicio_vigencia": None,
                "fecha_fin_vigencia": None,
                "dias_restantes": None,
                "dias_mora": 0,
                "usuario_activo": usuario_activo,
                "vehiculo_activo": vehiculo_activo,
                "puede_ingresar": False,
            }

        f_ini: date = ultimo["fecha_inicio_vigencia"]
        f_fin: date = ultimo["fecha_fin_vigencia"]
        diff = (f_fin - hoy).days

        if diff < 0:
            estado_bd = "Vencida"
            estado_ui = "Vencida"
            dias_mora = abs(diff)
        elif diff <= 5:
            estado_bd = "Por vencer"
            estado_ui = "Por vencer"
            dias_mora = 0
        else:
            estado_bd = "Vigente"
            estado_ui = "Al día"
            dias_mora = 0

        puede_ingresar = usuario_activo and vehiculo_activo and estado_bd in ("Vigente", "Por vencer")
        return {
            "placa": veh["placa"],
            "tipo_vehiculo": veh["tipo_vehiculo"],
            "estado": estado_bd,
            "estado_ui": estado_ui,
            "fecha_inicio_vigencia": f_ini.isoformat(),
            "fecha_fin_vigencia": f_fin.isoformat(),
            "dias_restantes": diff,
            "dias_mora": dias_mora,
            "usuario_activo": usuario_activo,
            "vehiculo_activo": vehiculo_activo,
            "puede_ingresar": puede_ingresar,
        }

    def registrar_pago(self, datos: PagoCrearSchema, operario_registro: str) -> dict:
        """HU-P02, HU-P03, RN-P01 a RN-P05, RN-P08, RN-P10: registra un pago de mensualidad en una sola transacción."""
        placa_norm = re.sub(r"[\s-]+", "", datos.placa or "").upper()
        if datos.meses_pagados not in (1, 2, 3):
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="La cantidad de meses a pagar debe ser 1, 2 o 3.",
            )

        hoy = hoy_colombia()
        ahora = ahora_colombia_naive()

        with self.conn.cursor() as cur:
            # Bloqueo FOR UPDATE sobre el vehículo para evitar doble cobro simultáneo del mismo período (RN-P08)
            cur.execute(
                """
                SELECT v.placa,
                       v.tipo_vehiculo,
                       v.marca,
                       v.color,
                       COALESCE(v.estado, 'Activo') AS estado_vehiculo,
                       p.id_propietario,
                       p.tipo_documento,
                       p.documento,
                       p.nombre,
                       p.nombres,
                       p.apellidos,
                       p.telefono,
                       COALESCE(p.estado, 'Activo') AS estado_propietario
                FROM vehiculo v
                JOIN propietario p ON p.id_propietario = v.id_propietario
                WHERE v.placa = %s
                FOR UPDATE
                """,
                (placa_norm,),
            )
            veh = cur.fetchone()
            if not veh:
                raise HTTPException(
                    status_code=HTTP_404_NOT_FOUND,
                    detail=f"El vehículo de placa {placa_norm} no existe en el sistema.",
                )

            # RN-P01: validar que titular y vehículo estén activos
            if veh["estado_propietario"] != "Activo":
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail="No se puede registrar el pago: el titular se encuentra Inactivo. El Administrador debe activarlo primero (RN-P01).",
                )
            if veh["estado_vehiculo"] != "Activo":
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=f"No se puede registrar el pago: el vehículo {placa_norm} se encuentra Inactivo. El Administrador debe activarlo primero (RN-P01).",
                )

            tipo_v = veh["tipo_vehiculo"]
            valor_unitario = Modulo3TarifaConnection(self.conn).obtener_tarifa_vigente(cur, tipo_v)
            valor_total = int(valor_unitario) * int(datos.meses_pagados)

            # Pago exclusivamente en Efectivo
            recibido = int(datos.valor_recibido_cop) if datos.valor_recibido_cop is not None else valor_total
            if recibido < valor_total:
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=f"El valor recibido en efectivo ({recibido}) es menor al total a pagar ({valor_total}).",
                )
            cambio = recibido - valor_total
            referencia = None

            # Consultar último pago Registrado de la placa para calcular la vigencia (RN-P03)
            cur.execute(
                """
                SELECT id, fecha_inicio_vigencia, fecha_fin_vigencia
                FROM pago_mensualidad
                WHERE placa_vehiculo = %s AND estado = 'Registrado'
                ORDER BY id DESC
                LIMIT 1
                """,
                (placa_norm,),
            )
            ultimo = cur.fetchone()

            if ultimo and ultimo["fecha_fin_vigencia"] >= hoy:
                # Está Vigente ("Al día") o "Por vencer": inicia al día siguiente del vencimiento actual
                es_renovacion_al_dia = True
                fecha_inicio = ultimo["fecha_fin_vigencia"] + timedelta(days=1)
            else:
                # Está Vencida o Sin mensualidad: inicia hoy
                es_renovacion_al_dia = False
                fecha_inicio = hoy

            dias_cubiertos = 30 * int(datos.meses_pagados)
            fecha_fin = fecha_inicio + timedelta(days=dias_cubiertos - 1)

            # RN-P05: Validar Cupo Garantizado cuando el pago convierte un vehículo en "al día"
            # (primer pago o renovación de una mensualidad Vencida).
            if not es_renovacion_al_dia:
                cur.execute(
                    """
                    SELECT COUNT(*) AS utilizables
                    FROM espacio
                    WHERE tipo_permitido = %s AND estado IN ('Disponible', 'Ocupado')
                    """,
                    (tipo_v,),
                )
                celdas_utilizables = int(cur.fetchone()["utilizables"])
                clientes_al_dia = self.contar_clientes_al_dia_por_tipo(cur, tipo_v)
                if celdas_utilizables > 0 and clientes_al_dia >= celdas_utilizables:
                    raise HTTPException(
                        status_code=HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Cupo garantizado completo para {tipo_v.lower()}s: actualmente hay {clientes_al_dia} "
                            f"mensualidades al día para {celdas_utilizables} celdas utilizables (RN-P05)."
                        ),
                    )

            # RN-P08: evitar doble cobro del mismo período
            cur.execute(
                """
                SELECT numero_comprobante
                FROM pago_mensualidad
                WHERE placa_vehiculo = %s
                  AND estado = 'Registrado'
                  AND fecha_inicio_vigencia = %s
                LIMIT 1
                """,
                (placa_norm, fecha_inicio),
            )
            duplicado = cur.fetchone()
            if duplicado:
                raise HTTPException(
                    status_code=HTTP_409_CONFLICT,
                    detail=f"Ya existe un pago registrado ({duplicado['numero_comprobante']}) para {placa_norm} con inicio de vigencia {fecha_inicio.isoformat()}.",
                )

            # Consecutivo único REC-XXXX que nunca se reutiliza ni al anular (RN-P08)
            cur.execute("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM pago_mensualidad")
            seq_num = int(cur.fetchone()["next_id"])
            while True:
                comprobante = f"REC-{seq_num:04d}"
                cur.execute("SELECT 1 FROM pago_mensualidad WHERE numero_comprobante = %s", (comprobante,))
                if not cur.fetchone():
                    break
                seq_num += 1

            cur.execute(
                """
                INSERT INTO pago_mensualidad (
                    numero_comprobante, id_propietario, placa_vehiculo, tipo_vehiculo,
                    meses_pagados, valor_unitario_cop, valor_total_cop,
                    fecha_inicio_vigencia, fecha_fin_vigencia,
                    metodo_pago, referencia_pago, valor_recibido_cop, cambio_cop,
                    estado, operario_registro, fecha_registro
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Registrado', %s, %s)
                RETURNING id
                """,
                (
                    comprobante,
                    veh["id_propietario"],
                    placa_norm,
                    tipo_v,
                    int(datos.meses_pagados),
                    valor_unitario,
                    valor_total,
                    fecha_inicio,
                    fecha_fin,
                    datos.metodo_pago,
                    sanitizar_bd(referencia) if referencia else None,
                    recibido,
                    cambio,
                    sanitizar_bd(operario_registro),
                    ahora,
                ),
            )
            new_id = cur.fetchone()["id"]

            # Sincronizar con la tabla legacy `pago` (origen = 'Caja') para compatibilidad con Módulo 1 y Módulo 2
            cur.execute(
                """
                INSERT INTO pago (placa, fecha_pago, monto, origen)
                VALUES (%s, %s, %s, 'Caja')
                """,
                (placa_norm, fecha_inicio, valor_total),
            )

        self.conn.commit()
        pagos = self.listar_pagos(id_especifico=new_id)
        return pagos[0]

    def listar_pagos(
        self,
        q: Optional[str] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None,
        metodo_pago: Optional[str] = None,
        estado: Optional[str] = None,
        id_especifico: Optional[int] = None,
    ) -> List[dict]:
        """HU-P07: lista el historial de pagos ordenado del más reciente al más antiguo."""
        condiciones = ["1=1"]
        params: list = []

        if id_especifico is not None:
            condiciones.append("pm.id = %s")
            params.append(id_especifico)
        if fecha_desde is not None:
            condiciones.append("DATE(pm.fecha_registro) >= %s")
            params.append(fecha_desde)
        if fecha_hasta is not None:
            condiciones.append("DATE(pm.fecha_registro) <= %s")
            params.append(fecha_hasta)
        if metodo_pago and metodo_pago != "Todas":
            condiciones.append("pm.metodo_pago = %s")
            params.append(metodo_pago)
        if estado and estado != "Todos":
            condiciones.append("pm.estado = %s")
            params.append(estado)

        where_sql = " AND ".join(condiciones)

        with self.conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT pm.*,
                       p.tipo_documento,
                       p.documento,
                       p.nombre,
                       p.nombres,
                       p.apellidos,
                       p.telefono,
                       v.marca,
                       v.color
                FROM pago_mensualidad pm
                JOIN propietario p ON p.id_propietario = pm.id_propietario
                JOIN vehiculo v ON v.placa = pm.placa_vehiculo
                WHERE {where_sql}
                ORDER BY pm.fecha_registro DESC, pm.id DESC
                """,
                tuple(params),
            )
            rows = cur.fetchall()

            # Mapa del último pago Registrado por cada placa y cadena de vigencias anteriores
            cur.execute(
                """
                SELECT id, placa_vehiculo, fecha_fin_vigencia, estado
                FROM pago_mensualidad
                ORDER BY placa_vehiculo ASC, id ASC
                """
            )
            todos_ordenados = cur.fetchall()

        ultimo_activo_por_placa: Dict[str, int] = {}
        vencimiento_previo_por_id: Dict[int, Optional[str]] = {}
        ultimo_venc_visto_por_placa: Dict[str, str] = {}

        for item in todos_ordenados:
            pl = item["placa_vehiculo"]
            pid = item["id"]
            vencimiento_previo_por_id[pid] = ultimo_venc_visto_por_placa.get(pl)
            if item["estado"] == "Registrado":
                ultimo_activo_por_placa[pl] = pid
                ultimo_venc_visto_por_placa[pl] = _fmt_iso(item["fecha_fin_vigencia"])

        resultado: List[dict] = []
        filtro_q = (q or "").strip().lower()

        for r in rows:
            nombres = reparar_mojibake(r.get("nombres") or "").strip()
            apellidos = reparar_mojibake(r.get("apellidos") or "").strip()
            nombre_completo = f"{nombres} {apellidos}".strip() or reparar_mojibake(r.get("nombre") or "").strip()
            doc_tipo = reparar_mojibake(r.get("tipo_documento") or "CC")
            doc_num = reparar_mojibake(r.get("documento") or "")
            celular = reparar_mojibake(r.get("telefono") or "")
            placa = r["placa_vehiculo"]
            consecutivo = r["numero_comprobante"]
            operario = reparar_mojibake(r.get("operario_registro") or "Administrador")
            referencia = reparar_mojibake(r.get("referencia_pago") or "") or None

            if filtro_q:
                buscable = f"{consecutivo} {doc_tipo} {doc_num} {nombre_completo} {placa} {operario} {referencia or ''}".lower()
                if filtro_q not in buscable:
                    continue

            pid = r["id"]
            es_ultimo_activo = r["estado"] == "Registrado" and ultimo_activo_por_placa.get(placa) == pid
            f_ini = _fmt_iso(r["fecha_inicio_vigencia"])
            f_fin = _fmt_iso(r["fecha_fin_vigencia"])
            f_reg = _fmt_iso(r["fecha_registro"])
            f_anu = _fmt_iso(r["fecha_anulacion"]) if r.get("fecha_anulacion") else None
            motivo_anu = reparar_mojibake(r.get("motivo_anulacion") or "") or None
            usuario_anu = reparar_mojibake(r.get("usuario_anulacion") or "") or None

            resultado.append(
                {
                    "id": pid,
                    "consecutivo": consecutivo,
                    "numero_comprobante": consecutivo,
                    "userId": r["id_propietario"],
                    "id_propietario": r["id_propietario"],
                    "documentoTipo": doc_tipo,
                    "documento": doc_num,
                    "nombreTitular": nombre_completo,
                    "celularTitular": celular,
                    "placa": placa,
                    "placa_vehiculo": placa,
                    "tipoVehiculo": r["tipo_vehiculo"],
                    "tipo_vehiculo": r["tipo_vehiculo"],
                    "marcaVehiculo": reparar_mojibake(r.get("marca") or "Renault"),
                    "colorVehiculo": reparar_mojibake(r.get("color") or "Blanco"),
                    "meses": int(r["meses_pagados"]),
                    "meses_pagados": int(r["meses_pagados"]),
                    "tarifaMensualAplicada": int(r["valor_unitario_cop"]),
                    "valor_unitario_cop": int(r["valor_unitario_cop"]),
                    "totalPagado": int(r["valor_total_cop"]),
                    "valor_total_cop": int(r["valor_total_cop"]),
                    "fechaInicio": f_ini,
                    "fecha_inicio_vigencia": f_ini,
                    "fechaVencimiento": f_fin,
                    "fecha_fin_vigencia": f_fin,
                    "fechaVencimientoAnterior": vencimiento_previo_por_id.get(pid),
                    "formaPago": "Efectivo",
                    "metodo_pago": "Efectivo",
                    "valorRecibidoEfectivo": int(r["valor_recibido_cop"]) if r.get("valor_recibido_cop") is not None else int(r["valor_total_cop"]),
                    "valor_recibido_cop": int(r["valor_recibido_cop"]) if r.get("valor_recibido_cop") is not None else int(r["valor_total_cop"]),
                    "cambioDevueltoEfectivo": int(r["cambio_cop"]) if r.get("cambio_cop") is not None else 0,
                    "cambio_cop": int(r["cambio_cop"]) if r.get("cambio_cop") is not None else 0,
                    "referenciaPago": None,
                    "referencia_pago": None,
                    "fechaHoraPago": f_reg,
                    "fecha_registro": f_reg,
                    "operario": operario,
                    "operario_registro": operario,
                    "estado": r["estado"],
                    "motivoAnulacion": motivo_anu,
                    "motivo_anulacion": motivo_anu,
                    "usuarioAnulacion": usuario_anu,
                    "usuario_anulacion": usuario_anu,
                    "fechaHoraAnulacion": f_anu,
                    "fecha_anulacion": f_anu,
                    "esUltimoActivo": es_ultimo_activo,
                }
            )

        return resultado

    def anular_pago(self, id_pago: int, datos: PagoAnularSchema, usuario_anulacion: str) -> dict:
        """HU-P09, RN-P06, RN-P07: anula el último pago no anulado de un vehículo exigiendo motivo obligatorio."""
        motivo = reparar_mojibake(datos.motivo or "").strip()
        if len(motivo) < 5:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Es obligatorio indicar el motivo de la anulación (mínimo 5 caracteres).",
            )

        ahora = ahora_colombia_naive()
        with self.conn.cursor() as cur:
            cur.execute("SELECT * FROM pago_mensualidad WHERE id = %s FOR UPDATE", (id_pago,))
            pago = cur.fetchone()
            if not pago:
                raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Pago no encontrado.")

            if pago["estado"] != "Registrado":
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=f"El comprobante {pago['numero_comprobante']} ya se encuentra anulado.",
                )

            placa = pago["placa_vehiculo"]
            cur.execute(
                """
                SELECT id, numero_comprobante
                FROM pago_mensualidad
                WHERE placa_vehiculo = %s AND estado = 'Registrado'
                ORDER BY id DESC
                LIMIT 1
                """,
                (placa,),
            )
            ultimo_activo = cur.fetchone()
            if not ultimo_activo or ultimo_activo["id"] != id_pago:
                raise HTTPException(
                    status_code=HTTP_400_BAD_REQUEST,
                    detail=(
                        f"No se puede anular el comprobante {pago['numero_comprobante']} porque existe un pago "
                        f"posterior activo para el vehículo {placa}. Solo se puede anular el último pago no anulado (RN-P07)."
                    ),
                )

            cur.execute(
                """
                UPDATE pago_mensualidad
                SET estado = 'Anulado',
                    usuario_anulacion = %s,
                    fecha_anulacion = %s,
                    motivo_anulacion = %s
                WHERE id = %s
                """,
                (sanitizar_bd(usuario_anulacion), ahora, sanitizar_bd(motivo), id_pago),
            )

            # Si se había creado un registro correspondiente en la tabla legacy `pago` en esa fecha,
            # lo retiramos para que el fallback legacy tampoco lo tome como vigente.
            cur.execute(
                """
                DELETE FROM pago
                WHERE id_pago = (
                    SELECT id_pago FROM pago
                    WHERE placa = %s AND fecha_pago = %s AND origen = 'Caja'
                    ORDER BY id_pago DESC
                    LIMIT 1
                )
                """,
                (placa, pago["fecha_inicio_vigencia"]),
            )

        self.conn.commit()
        return self.listar_pagos(id_especifico=id_pago)[0]

    def listar_vencimientos(
        self,
        estado: Optional[str] = None,
        tipo_vehiculo: Optional[str] = None,
        q: Optional[str] = None,
    ) -> List[dict]:
        """HU-P08: retorna vehículos activos con mensualidad Por vencer (<= 5 días) o Vencida,
        ordenados de la fecha de vencimiento más antigua a la más reciente."""
        hoy = hoy_colombia()
        filtro_q = (q or "").strip().lower()

        with self.conn.cursor() as cur:
            cur.execute(
                """
                WITH ultimo_pago AS (
                    SELECT DISTINCT ON (placa_vehiculo)
                           placa_vehiculo,
                           fecha_inicio_vigencia,
                           fecha_fin_vigencia
                    FROM pago_mensualidad
                    WHERE estado = 'Registrado'
                    ORDER BY placa_vehiculo, id DESC
                )
                SELECT v.placa,
                       v.tipo_vehiculo,
                       v.marca,
                       v.color,
                       p.id_propietario,
                       p.tipo_documento,
                       p.documento,
                       p.nombre,
                       p.nombres,
                       p.apellidos,
                       p.telefono,
                       up.fecha_inicio_vigencia,
                       up.fecha_fin_vigencia
                FROM vehiculo v
                JOIN propietario p ON p.id_propietario = v.id_propietario
                JOIN ultimo_pago up ON up.placa_vehiculo = v.placa
                WHERE COALESCE(v.estado, 'Activo') = 'Activo'
                  AND COALESCE(p.estado, 'Activo') = 'Activo'
                ORDER BY up.fecha_fin_vigencia ASC, v.placa ASC
                """
            )
            rows = cur.fetchall()

        resultado: List[dict] = []
        for r in rows:
            f_fin: date = r["fecha_fin_vigencia"]
            diff = (f_fin - hoy).days
            if diff > 5:
                # Está Al día (> 5 días), no pertenece a la alerta de vencimientos
                continue

            estado_item = "Vencida" if diff < 0 else "Por vencer"
            if estado and estado not in ("Todas", "Todos") and estado_item != estado:
                continue
            if tipo_vehiculo and tipo_vehiculo != "Todos" and r["tipo_vehiculo"] != tipo_vehiculo:
                continue

            nombres = reparar_mojibake(r.get("nombres") or "").strip()
            apellidos = reparar_mojibake(r.get("apellidos") or "").strip()
            nombre_titular = f"{nombres} {apellidos}".strip() or reparar_mojibake(r.get("nombre") or "").strip()
            doc_tipo = reparar_mojibake(r.get("tipo_documento") or "CC")
            doc_num = reparar_mojibake(r.get("documento") or "")
            celular = reparar_mojibake(r.get("telefono") or "")

            if filtro_q:
                buscable = f"{doc_tipo} {doc_num} {nombre_titular} {celular} {r['placa']}".lower()
                if filtro_q not in buscable:
                    continue

            resultado.append(
                {
                    "id_propietario": r["id_propietario"],
                    "userId": r["id_propietario"],
                    "documentoTipo": doc_tipo,
                    "documento": doc_num,
                    "nombreTitular": nombre_titular,
                    "celularTitular": celular,
                    "placa": r["placa"],
                    "tipoVehiculo": r["tipo_vehiculo"],
                    "marcaVehiculo": reparar_mojibake(r.get("marca") or "Renault"),
                    "colorVehiculo": reparar_mojibake(r.get("color") or "Blanco"),
                    "fechaInicio": _fmt_iso(r["fecha_inicio_vigencia"]),
                    "fechaVencimiento": _fmt_iso(f_fin),
                    "estado": estado_item,
                    "diasRestantes": diff,
                    "diasMora": abs(diff) if diff < 0 else 0,
                }
            )

        return resultado

    def obtener_resumen_caja(self, operario_filtro: Optional[str], current_user) -> dict:
        """HU-P11: resumen de caja del día actual filtrable por operario."""
        hoy = hoy_colombia()
        es_admin = getattr(current_user, "rol", "") == "Administrador"

        if not es_admin:
            filtro_op = current_user.nombre
        else:
            filtro_op = operario_filtro if operario_filtro and operario_filtro != "Todos" else "Todos"

        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT operario_registro
                FROM pago_mensualidad
                WHERE operario_registro IS NOT NULL
                ORDER BY operario_registro ASC
                """
            )
            ops_bd = [reparar_mojibake(r["operario_registro"]) for r in cur.fetchall() if r.get("operario_registro")]

            if filtro_op != "Todos":
                cur.execute(
                    """
                    SELECT *
                    FROM pago_mensualidad
                    WHERE DATE(fecha_registro) = %s AND operario_registro = %s
                    ORDER BY id DESC
                    """,
                    (hoy, sanitizar_bd(filtro_op)),
                )
            else:
                cur.execute(
                    """
                    SELECT *
                    FROM pago_mensualidad
                    WHERE DATE(fecha_registro) = %s
                    ORDER BY id DESC
                    """,
                    (hoy,),
                )
            pagos_hoy = cur.fetchall()

        validos = [p for p in pagos_hoy if p["estado"] == "Registrado"]
        anulados = [p for p in pagos_hoy if p["estado"] == "Anulado"]

        total_recaudado = sum(int(p["valor_total_cop"]) for p in validos)
        total_anulado = sum(int(p["valor_total_cop"]) for p in anulados)

        por_metodo = [
            {
                "metodo": "Efectivo",
                "cantidad": len(validos),
                "total_cop": total_recaudado,
            }
        ]

        por_tipo = []
        for t in ("Carro", "Moto"):
            items = [p for p in validos if p["tipo_vehiculo"] == t]
            por_tipo.append(
                {
                    "tipo": t,
                    "cantidad": len(items),
                    "total_cop": sum(int(p["valor_total_cop"]) for p in items),
                }
            )

        operarios_disponibles = sorted(list(set([current_user.nombre, "Administrador", "Operario", *ops_bd])))

        return {
            "fecha": hoy.isoformat(),
            "operario_filtro": filtro_op,
            "total_recaudado_cop": total_recaudado,
            "cantidad_pagos_validos": len(validos),
            "cantidad_pagos_anulados": len(anulados),
            "total_anulado_cop": total_anulado,
            "por_metodo_pago": por_metodo,
            "por_tipo_vehiculo": por_tipo,
            "operarios_disponibles": operarios_disponibles,
        }

    def obtener_reporte_recaudo(
        self,
        fecha_inicio: date,
        fecha_fin: date,
        tipo_vehiculo: Optional[str],
        metodo_pago: Optional[str],
        operario: Optional[str],
        usuario_responsable: str,
    ) -> dict:
        """HU-P12: reporte de recaudo por período con validación de fechas y registro en auditoria_reporte."""
        hoy = hoy_colombia()
        if fecha_fin < fecha_inicio:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="La fecha final no puede ser anterior a la fecha inicial.",
            )
        if fecha_inicio > hoy or fecha_fin > hoy:
            raise HTTPException(
                status_code=HTTP_400_BAD_REQUEST,
                detail="Las fechas del reporte no pueden ser futuras.",
            )

        filtros_dict = {
            "tipo_vehiculo": tipo_vehiculo or "Todos",
            "metodo_pago": metodo_pago or "Todas",
            "operario": operario or "Todos",
        }
        with self.conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO auditoria_reporte (usuario_responsable, fecha_generacion, rango_fechas, filtros)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    sanitizar_bd(usuario_responsable),
                    ahora_colombia_naive(),
                    f"{fecha_inicio.isoformat()} a {fecha_fin.isoformat()}",
                    sanitizar_bd(json.dumps(filtros_dict, ensure_ascii=True)),
                ),
            )
        self.conn.commit()

        todos_periodo = self.listar_pagos(
            fecha_desde=fecha_inicio,
            fecha_hasta=fecha_fin,
            metodo_pago=metodo_pago,
        )
        if tipo_vehiculo and tipo_vehiculo != "Todos":
            todos_periodo = [p for p in todos_periodo if p["tipoVehiculo"] == tipo_vehiculo]
        if operario and operario != "Todos":
            todos_periodo = [p for p in todos_periodo if p["operario"] == operario]

        validos = [p for p in todos_periodo if p["estado"] == "Registrado"]
        anulados = [p for p in todos_periodo if p["estado"] == "Anulado"]

        total_recaudado = sum(int(p["totalPagado"]) for p in validos)
        total_anulado = sum(int(p["totalPagado"]) for p in anulados)
        ticket_promedio = int(round(total_recaudado / len(validos))) if validos else 0

        # Resumen por día
        por_dia_map: Dict[str, Dict[str, int]] = {}
        for p in validos:
            dia = p["fechaHoraPago"][:10]
            entry = por_dia_map.setdefault(dia, {"cantidad": 0, "total_cop": 0})
            entry["cantidad"] += 1
            entry["total_cop"] += int(p["totalPagado"])
        por_dia = [
            {"fecha": dia, "cantidad": info["cantidad"], "total_cop": info["total_cop"]}
            for dia, info in sorted(por_dia_map.items(), key=lambda x: x[0], reverse=True)
        ]

        # Resumen por tipo de vehículo
        por_tipo = []
        for t in ("Carro", "Moto"):
            items = [p for p in validos if p["tipoVehiculo"] == t]
            por_tipo.append(
                {
                    "tipo": t,
                    "cantidad": len(items),
                    "total_cop": sum(int(p["totalPagado"]) for p in items),
                }
            )

        # Resumen por método de pago (exclusivamente Efectivo)
        por_metodo = [
            {
                "metodo": "Efectivo",
                "cantidad": len(validos),
                "total_cop": total_recaudado,
            }
        ]

        # Resumen por operario
        por_op_map: Dict[str, Dict[str, int]] = {}
        for p in validos:
            op = p["operario"]
            entry = por_op_map.setdefault(op, {"cantidad": 0, "total_cop": 0})
            entry["cantidad"] += 1
            entry["total_cop"] += int(p["totalPagado"])
        por_operario = [
            {"operario": op, "cantidad": info["cantidad"], "total_cop": info["total_cop"]}
            for op, info in sorted(por_op_map.items(), key=lambda x: x[1]["total_cop"], reverse=True)
        ]

        return {
            "fecha_inicio": fecha_inicio.isoformat(),
            "fecha_fin": fecha_fin.isoformat(),
            "total_recaudado_cop": total_recaudado,
            "cantidad_pagos_validos": len(validos),
            "ticket_promedio_cop": ticket_promedio,
            "cantidad_pagos_anulados": len(anulados),
            "total_anulado_cop": total_anulado,
            "por_dia": por_dia,
            "por_tipo_vehiculo": por_tipo,
            "por_metodo_pago": por_metodo,
            "por_operario": por_operario,
            "pagos": todos_periodo,
        }
