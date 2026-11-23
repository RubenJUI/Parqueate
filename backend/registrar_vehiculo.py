"""Registra un usuario del parqueadero, su vehículo y el pago de la mensualidad.

Son precondiciones del módulo de entrada y salida (Iteración 1): esta herramienta las carga
sin necesidad de escribir SQL. Si el propietario o el vehículo ya existen se reutilizan, así
que volver a ejecutarla con una fecha nueva registra la renovación de la mensualidad.

Cupo garantizado: las celdas utilizables de un tipo (libres u ocupadas, sin contar las que están
fuera de servicio) deben alcanzar para todos los vehículos activos de ese tipo.

Habeas Data (RNF-10, Ley 1581 de 2012): un propietario solo se registra si autorizó el tratamiento
de sus datos personales; --autoriza-datos deja constancia de esa autorización con su fecha.

Uso:
    python registrar_vehiculo.py <placa> <Carro|Moto> <documento> <nombre> <telefono> [fecha_pago AAAA-MM-DD] [--autoriza-datos]

Ejemplo:
    python registrar_vehiculo.py XYZ987 Carro 1036999999 "Ana Restrepo" 3001234567 2026-10-13 --autoriza-datos
"""

import re
import sys
from datetime import date

import psycopg2
from psycopg2.extras import RealDictCursor

from database.database import DATABASE_URL
from models.pago_connection import calcular_vigencia
from schema.tipos import normalizar_placa

USO = 'Uso: python registrar_vehiculo.py <placa> <Carro|Moto> <documento> <nombre> <telefono> [fecha_pago AAAA-MM-DD] [--autoriza-datos]'
FLAG_AUTORIZA = "--autoriza-datos"


def error(mensaje: str) -> None:
    print(f"Error: {mensaje}")
    raise SystemExit(1)


def verificar_cupo(cur, placa: str, tipo: str, fecha_pago: date = None) -> None:
    """Precondición de cupo garantizado: las celdas utilizables de un tipo (libres u ocupadas,
    sin contar las que están fuera de servicio) deben alcanzar para todos los vehículos activos de ese tipo."""
    # Serializa los registros para que dos ejecuciones simultáneas no tomen el mismo cupo.
    cur.execute("LOCK TABLE vehiculo IN SHARE ROW EXCLUSIVE MODE")
    cur.execute(
        "SELECT COUNT(*) AS celdas FROM espacio WHERE tipo_permitido = %s AND estado IN ('Disponible', 'Ocupado')",
        (tipo,),
    )
    celdas = cur.fetchone()["celdas"]
    cur.execute(
        """
        SELECT COUNT(*) AS otros
        FROM vehiculo v
        JOIN propietario p ON p.id_propietario = v.id_propietario
        WHERE v.tipo_vehiculo = %s
          AND v.placa <> %s
          AND COALESCE(v.estado, 'Activo') = 'Activo'
          AND COALESCE(p.estado, 'Activo') = 'Activo'
        """,
        (tipo, placa),
    )
    otros = cur.fetchone()["otros"]
    if otros + 1 > celdas:
        error(
            f"no hay cupo para {tipo}: las celdas utilizables ({celdas}) deben alcanzar "
            f"para todos los vehículos activos ({otros + 1}) de {tipo.lower()}"
        )


def leer_argumentos() -> tuple:
    autoriza = FLAG_AUTORIZA in sys.argv
    args = [arg for arg in sys.argv[1:] if arg != FLAG_AUTORIZA]
    if len(args) not in (5, 6):
        print(USO)
        raise SystemExit(1)

    placa, tipo, documento, nombre, telefono = args[:5]
    placa = normalizar_placa(placa)
    # La consola de registro acepta placas de 5 o 6 caracteres alfanuméricos.
    if not re.fullmatch(r"[A-Z0-9]{5,6}", placa):
        error("la placa debe tener 5 o 6 letras o números, sin espacios ni guiones")
    tipo = tipo.capitalize()
    if tipo not in ("Carro", "Moto"):
        error("el tipo de vehículo debe ser Carro o Moto")
    try:
        fecha_pago = date.fromisoformat(args[5]) if len(args) == 6 else date.today()
    except ValueError:
        error("la fecha de pago debe tener el formato AAAA-MM-DD")
    # La vigencia cuenta desde el día en que se paga (RN-04), así que no puede ser una fecha futura.
    if fecha_pago > date.today():
        error("la fecha de pago no puede ser posterior a hoy")
    return placa, tipo, documento.strip(), nombre.strip(), telefono.strip(), fecha_pago, autoriza


def main() -> None:
    placa, tipo, documento, nombre, telefono, fecha_pago, autoriza = leer_argumentos()
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    # Los mensajes se muestran solo si todo queda guardado; ante un error no se guarda nada.
    hechos = []
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM propietario WHERE documento = %s", (documento,))
            propietario = cur.fetchone()
            sin_autorizacion = (
                "el propietario debe autorizar el tratamiento de sus datos personales (Ley 1581 de 2012); "
                f"cuando lo haga, agrega {FLAG_AUTORIZA}"
            )
            if propietario:
                hechos.append(f"Propietario existente: {propietario['nombre']} ({documento}).")
                if not propietario["autoriza_datos"]:
                    if not autoriza:
                        error(sin_autorizacion)
                    cur.execute(
                        "UPDATE propietario SET autoriza_datos = TRUE, fecha_autorizacion = LOCALTIMESTAMP WHERE id_propietario = %s",
                        (propietario["id_propietario"],),
                    )
                    hechos.append("Autorización de tratamiento de datos registrada.")
            else:
                if not autoriza:
                    error(sin_autorizacion)
                cur.execute(
                    """
                    INSERT INTO propietario (documento, nombre, telefono, autoriza_datos, fecha_autorizacion)
                    VALUES (%s, %s, %s, TRUE, LOCALTIMESTAMP)
                    RETURNING *
                    """,
                    (documento, nombre, telefono),
                )
                propietario = cur.fetchone()
                hechos.append(f"Propietario registrado: {nombre} ({documento}), con autorización de tratamiento de datos.")

            cur.execute("SELECT * FROM vehiculo WHERE placa = %s", (placa,))
            vehiculo = cur.fetchone()
            if vehiculo:
                if vehiculo["id_propietario"] != propietario["id_propietario"]:
                    error(f"la placa {placa} ya está registrada a nombre de otro propietario")
                if vehiculo["tipo_vehiculo"] != tipo:
                    error(f"la placa {placa} ya está registrada como {vehiculo['tipo_vehiculo']}")
                hechos.append(f"Vehículo existente: {placa} ({tipo}).")
            else:
                cur.execute(
                    "INSERT INTO vehiculo (placa, tipo_vehiculo, id_propietario) VALUES (%s, %s, %s)",
                    (placa, tipo, propietario["id_propietario"]),
                )
                hechos.append(f"Vehículo registrado: {placa} ({tipo}).")

            cur.execute("SELECT 1 FROM pago WHERE placa = %s AND fecha_pago = %s", (placa, fecha_pago))
            if cur.fetchone():
                hechos.append(f"Ya había un pago de {placa} con fecha {fecha_pago:%d/%m/%Y}; no se registró otro.")
            else:
                verificar_cupo(cur, placa, tipo, fecha_pago)
                cur.execute("SELECT valor_mensual FROM tarifa WHERE tipo_vehiculo = %s", (tipo,))
                tarifa = cur.fetchone()
                if not tarifa:
                    error(f"no hay tarifa configurada para {tipo}; carga database/seed.sql")
                cur.execute(
                    "INSERT INTO pago (placa, fecha_pago, monto) VALUES (%s, %s, %s)",
                    (placa, fecha_pago, tarifa["valor_mensual"]),
                )
                hechos.append(f"Pago registrado: ${tarifa['valor_mensual']:,.0f} COP el {fecha_pago:%d/%m/%Y}.".replace(",", "."))

        conn.commit()
        print("\n".join(hechos))

        with conn.cursor() as cur:
            cur.execute("SELECT MAX(fecha_pago) AS fecha_pago FROM pago WHERE placa = %s AND fecha_pago <= CURRENT_DATE", (placa,))
            vigencia = calcular_vigencia(cur.fetchone()["fecha_pago"], date.today())
        print(f"Mensualidad: {vigencia['estado']}, vence el {vigencia['fecha_vencimiento']:%d/%m/%Y}.")
    except psycopg2.Error as exc:
        conn.rollback()
        error(f"no se pudo registrar: {exc.pgerror or exc}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
