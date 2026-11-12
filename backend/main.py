from contextlib import asynccontextmanager
import logging
from datetime import date
from typing import List, Optional

import psycopg2
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg2 import errors
from psycopg2.extras import RealDictCursor
from starlette.status import HTTP_200_OK, HTTP_201_CREATED, HTTP_409_CONFLICT

from auth.auth import get_current_active_user, get_current_admin_user
from auth.auth_routes import router as auth_router
from config import ALLOWED_ORIGINS
from database.database import DATABASE_URL, get_db
from models.espacio_connection import EspacioConnection
from models.modulo2_connection import (
    Modulo2CeldaConnection,
    Modulo2UsuarioConnection,
    ensure_module2_schema,
)
from models.pago_connection import PagoConnection, calcular_vigencia
from models.tarifa_connection import TarifaConnection
from models.tiquete_connection import TiqueteConnection
from models.vehiculo_connection import VehiculoConnection
from schema.espacio_schema import EspacioOut, OcupacionOut
from schema.modulo2_schema import (
    CambioEstadoSchema,
    CeldaActualizarSchema,
    CeldaCrearSchema,
    CeldaModulo2Out,
    UsuarioCrearSchema,
    UsuarioEditarSchema,
    UsuarioModulo2Out,
    VehiculoAsociarSchema,
)
from schema.tarifa_schema import TarifaOut
from schema.tipos import EstadoEspacio, TipoVehiculo, normalizar_placa
from schema.tiquete_schema import AnulacionSchema, CambioEspacioSchema, EntradaOut, EntradaSchema, PlacaSchema, TiqueteOut
from schema.usuario_schema import UsuarioOut
from schema.vehiculo_schema import VehiculoConsultaOut

tags_metadata = [
    {"name": "auth", "description": "Login y emisión del token JWT."},
    {"name": "Usuarios", "description": "Operario autenticado y gestión de usuarios del parqueadero."},
    {"name": "Vehículos", "description": "Consulta por placa: usuario, mensualidad y si está dentro."},
    {"name": "Espacios", "description": "Celdas del parqueadero y ocupación."},
    {"name": "Celdas", "description": "Gestión de celdas, mantenimiento y trazabilidad (Módulo 2)."},
    {"name": "Tarifas", "description": "Valor de la mensualidad por tipo de vehículo."},
    {"name": "Tiquetes", "description": "Registro de entradas y salidas, historial y anulaciones."},
    {"name": "Sistema", "description": "Endpoints de estado del servicio."},
]

logger = logging.getLogger("parqueate")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ejecuta la migración retrocompatible del Módulo 2 al iniciar el servidor."""
    try:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        try:
            ensure_module2_schema(conn)
        finally:
            conn.close()
    except Exception as exc:
        logger.warning("No se pudo ejecutar la migración automática al iniciar: %s", exc)
    yield


app = FastAPI(title="Parqueate - Autos Colombia API", openapi_tags=tags_metadata, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)


@app.exception_handler(psycopg2.IntegrityError)
def integrity_error_handler(request: Request, exc: psycopg2.IntegrityError):
    """Las restricciones de la base (únicos, llaves foráneas, CHECK) son la última línea de defensa,
    por ejemplo ante dos entradas simultáneas de la misma placa."""
    if isinstance(exc, errors.UniqueViolation):
        detail = "Ya existe un registro con esos datos"
    elif isinstance(exc, errors.ForeignKeyViolation):
        detail = "El registro está relacionado con otros datos o referencia uno que no existe"
    else:
        detail = "Los datos no cumplen las restricciones de la base de datos"
    return JSONResponse(status_code=HTTP_409_CONFLICT, content={"detail": detail})


@app.exception_handler(Exception)
def unhandled_exception_handler(request: Request, exc: Exception):
    """Garantiza que cualquier error inesperado devuelva un JSON controlado con cabeceras CORS."""
    logger.exception("Error inesperado procesando %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Error interno al procesar la operación: {str(exc)}"},
    )


@app.get("/", status_code=HTTP_200_OK, tags=["Sistema"])
def health_check():
    return {"status": "ok"}


@app.get("/api/usuarios/me", response_model=UsuarioOut, status_code=HTTP_200_OK, tags=["Usuarios"])
def get_me(current_user: UsuarioOut = Depends(get_current_active_user)):
    return current_user


def formatear_fecha(fecha: date) -> str:
    return fecha.strftime("%d/%m/%Y")


def mensaje_alerta(dias_restantes: int) -> str:
    if dias_restantes == 0:
        return "Su mensualidad vence hoy"
    if dias_restantes == 1:
        return "Su mensualidad vence mañana"
    return f"Su mensualidad vence en {dias_restantes} días"


def get_vigencia(conn, placa: str) -> Optional[dict]:
    """Vigencia de la mensualidad según el pago más reciente de la placa, o None si no tiene pagos."""
    ultimo = PagoConnection(conn).get_ultimo(placa)
    if not ultimo:
        return None
    return calcular_vigencia(ultimo["fecha_pago"], date.today())


@app.get(
    "/api/vehiculos/{placa}",
    response_model=VehiculoConsultaOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Vehículos"],
)
def consultar_vehiculo(placa: str, conn=Depends(get_db)):
    """RNF-02: el operario busca la placa y ve el usuario, la vigencia de la mensualidad y si ya está dentro."""
    placa = normalizar_placa(placa)
    vehiculo = VehiculoConnection(conn).get_by_placa(placa)
    if not vehiculo:
        raise HTTPException(status_code=404, detail="El vehículo no está asociado a ningún usuario registrado")

    abierto = TiqueteConnection(conn).get_abierto_por_placa(placa)
    return VehiculoConsultaOut(
        **vehiculo,
        mensualidad=get_vigencia(conn, placa),
        id_tiquete_abierto=abierto["id_tiquete"] if abierto else None,
        numero_espacio=abierto["numero_espacio"] if abierto else None,
    )


@app.get(
    "/api/espacios",
    response_model=List[EspacioOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Espacios"],
)
def list_espacios(
    estado: Optional[EstadoEspacio] = Query(None),
    tipo_permitido: Optional[TipoVehiculo] = Query(None),
    conn=Depends(get_db),
):
    rows = EspacioConnection(conn).list_all(estado=estado, tipo_permitido=tipo_permitido)
    return [EspacioOut.from_row(row) for row in rows]


@app.get(
    "/api/ocupacion",
    response_model=List[OcupacionOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Espacios"],
)
def get_ocupacion(conn=Depends(get_db)):
    """RF-10: celdas ocupadas y libres por tipo en tiempo real."""
    rows = EspacioConnection(conn).ocupacion()
    return [OcupacionOut.model_validate(row) for row in rows]


@app.get(
    "/api/tarifas",
    response_model=List[TarifaOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Tarifas"],
)
def list_tarifas(conn=Depends(get_db)):
    """RNF-08: el valor se configura en la tabla `tarifa`, sin cambiar el código."""
    rows = TarifaConnection(conn).list_all()
    return [TarifaOut.from_row(row) for row in rows]


@app.get(
    "/api/tiquetes",
    response_model=List[TiqueteOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Tiquetes"],
)
def list_tiquetes(
    placa: Optional[str] = Query(None),
    id_propietario: Optional[int] = Query(None),
    id_espacio: Optional[int] = Query(None),
    desde: Optional[date] = Query(None, description="Fecha de entrada desde (incluida)"),
    hasta: Optional[date] = Query(None, description="Fecha de entrada hasta (incluida)"),
    abiertos: Optional[bool] = Query(None, description="true: vehículos dentro (RF-12); false: registros cerrados o anulados"),
    conn=Depends(get_db),
):
    """RF-11: historial de entradas y salidas con filtros."""
    rows = TiqueteConnection(conn).list_all(
        placa=normalizar_placa(placa) if placa else None,
        id_propietario=id_propietario,
        id_espacio=id_espacio,
        desde=desde,
        hasta=hasta,
        abiertos=abiertos,
    )
    return [TiqueteOut.from_row(row) for row in rows]


@app.get(
    "/api/tiquetes/{id_tiquete}",
    response_model=TiqueteOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Tiquetes"],
)
def get_tiquete(id_tiquete: int, conn=Depends(get_db)):
    row = TiqueteConnection(conn).get_by_id(id_tiquete)
    if not row:
        raise HTTPException(status_code=404, detail="Tiquete no encontrado")
    return TiqueteOut.from_row(row)


@app.post("/api/tiquetes/entrada", response_model=EntradaOut, status_code=HTTP_201_CREATED, tags=["Tiquetes"])
def registrar_entrada(
    entrada: EntradaSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """RF-01 a RF-07: valida vehículo, doble ingreso y mensualidad, y asigna una celda del tipo del vehículo."""
    vehiculo = VehiculoConnection(conn).get_by_placa(entrada.placa)
    if not vehiculo:
        raise HTTPException(status_code=404, detail="El vehículo no está asociado a ningún usuario registrado")

    repo = TiqueteConnection(conn)
    abierto = repo.get_abierto_por_placa(entrada.placa)
    if abierto:
        raise HTTPException(
            status_code=HTTP_409_CONFLICT,
            detail=f"El vehículo ya se encuentra dentro del parqueadero en la celda {abierto['numero_espacio']}",
        )

    vigencia = get_vigencia(conn, entrada.placa)
    if not vigencia:
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="El vehículo no tiene una mensualidad registrada")
    if vigencia["estado"] == "Vencida":
        raise HTTPException(
            status_code=HTTP_409_CONFLICT,
            detail=f"Mensualidad vencida el {formatear_fecha(vigencia['fecha_vencimiento'])}",
        )

    tipo = vehiculo["tipo_vehiculo"]
    if entrada.id_espacio is not None:
        espacio = EspacioConnection(conn).get_by_id(entrada.id_espacio)
        if not espacio:
            raise HTTPException(status_code=404, detail="Espacio no encontrado")
        if espacio["tipo_permitido"] != tipo:
            raise HTTPException(status_code=HTTP_409_CONFLICT, detail=f"La celda {espacio['numero_espacio']} no es para {tipo}")

    row = repo.registrar_entrada(
        placa=entrada.placa,
        tipo_vehiculo=tipo,
        id_usuario_entrada=current_user.id_usuario,
        novedad=entrada.novedad,
        id_espacio=entrada.id_espacio,
    )
    if not row:
        if entrada.id_espacio is not None:
            raise HTTPException(status_code=HTTP_409_CONFLICT, detail="La celda elegida no está disponible")
        # RF-06: con el cupo garantizado no debería pasar; queda en el log para el administrador.
        logger.warning("Sin celdas disponibles para %s al registrar la entrada de %s", tipo, entrada.placa)
        raise HTTPException(
            status_code=HTTP_409_CONFLICT,
            detail=f"No hay celdas disponibles para {tipo}. Avise al administrador",
        )

    alerta = mensaje_alerta(vigencia["dias_restantes"]) if vigencia["estado"] == "Por vencer" else None
    return EntradaOut(
        **TiqueteOut.from_row(row).model_dump(),
        fecha_vencimiento=vigencia["fecha_vencimiento"],
        dias_restantes=vigencia["dias_restantes"],
        alerta=alerta,
    )


@app.post("/api/tiquetes/salida", response_model=TiqueteOut, status_code=HTTP_200_OK, tags=["Tiquetes"])
def registrar_salida(
    salida: PlacaSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """RF-08 y RF-09: cierra la entrada abierta de la placa y libera la celda."""
    repo = TiqueteConnection(conn)
    abierto = repo.get_abierto_por_placa(salida.placa)
    if not abierto:
        raise HTTPException(status_code=404, detail="El vehículo no tiene entrada registrada")

    row = repo.registrar_salida(abierto["id_tiquete"], id_usuario_salida=current_user.id_usuario, novedad=salida.novedad)
    if not row:
        # Otra terminal registró la salida entre la consulta y la actualización.
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="La salida de este vehículo ya fue registrada")
    return TiqueteOut.from_row(row)


@app.put(
    "/api/tiquetes/{id_tiquete}/espacio",
    response_model=TiqueteOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Tiquetes"],
)
def cambiar_espacio(id_tiquete: int, cambio: CambioEspacioSchema, conn=Depends(get_db)):
    """RF-05: el operario cambia manualmente la celda de un vehículo que está dentro."""
    repo = TiqueteConnection(conn)
    tiquete = repo.get_by_id(id_tiquete)
    if not tiquete:
        raise HTTPException(status_code=404, detail="Tiquete no encontrado")
    if tiquete["estado"] != "Activo":
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="Solo se puede cambiar la celda de un vehículo que está dentro")

    espacio = EspacioConnection(conn).get_by_id(cambio.id_espacio)
    if not espacio:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    if espacio["tipo_permitido"] != tiquete["tipo_vehiculo"]:
        raise HTTPException(
            status_code=HTTP_409_CONFLICT,
            detail=f"La celda {espacio['numero_espacio']} no es para {tiquete['tipo_vehiculo']}",
        )

    row = repo.cambiar_espacio(id_tiquete, cambio.id_espacio, tiquete["tipo_vehiculo"])
    if not row:
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="La celda elegida no está disponible")
    return TiqueteOut.from_row(row)


@app.post("/api/tiquetes/{id_tiquete}/anular", response_model=TiqueteOut, status_code=HTTP_200_OK, tags=["Tiquetes"])
def anular_tiquete(
    id_tiquete: int,
    anulacion: AnulacionSchema,
    current_user: UsuarioOut = Depends(get_current_admin_user),
    conn=Depends(get_db),
):
    """RNF-05: anula un registro con justificación; si el vehículo estaba dentro, libera la celda."""
    repo = TiqueteConnection(conn)
    if not repo.get_by_id(id_tiquete):
        raise HTTPException(status_code=404, detail="Tiquete no encontrado")

    row = repo.anular(id_tiquete, motivo=anulacion.motivo, id_usuario=current_user.id_usuario)
    if not row:
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="El tiquete ya está anulado")
    return TiqueteOut.from_row(row)


# ==============================================================================
# ENDPOINTS DEL MÓDULO 2: GESTIÓN DE USUARIOS, VEHÍCULOS (1 a N) Y CELDAS
# ==============================================================================


@app.get(
    "/api/usuarios",
    response_model=List[UsuarioModulo2Out],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Usuarios"],
)
def listar_usuarios_modulo2(conn=Depends(get_db)):
    """Retorna los usuarios registrados con sus vehículos asociados (1 a N), bitácora de auditoría y estado de ingreso."""
    return Modulo2UsuarioConnection(conn).list_usuarios()


@app.post(
    "/api/usuarios",
    response_model=UsuarioModulo2Out,
    status_code=HTTP_201_CREATED,
    tags=["Usuarios"],
)
def crear_usuario_modulo2(
    datos: UsuarioCrearSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Registra un usuario y su primer vehículo en una sola transacción validando documento, placa y Habeas Data."""
    return Modulo2UsuarioConnection(conn).crear_usuario_con_vehiculo(datos, usuario_responsable=current_user.nombre)


@app.put(
    "/api/usuarios/{id_propietario:int}",
    response_model=UsuarioModulo2Out,
    status_code=HTTP_200_OK,
    tags=["Usuarios"],
)
def editar_usuario_modulo2(
    id_propietario: int,
    datos: UsuarioEditarSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Permite editar celular, correo, marca y color (bloqueando cambios en documento y placa) con trazabilidad."""
    return Modulo2UsuarioConnection(conn).editar_usuario(id_propietario, datos, usuario_responsable=current_user.nombre)


@app.post(
    "/api/usuarios/{id_propietario:int}/vehiculos",
    response_model=UsuarioModulo2Out,
    status_code=HTTP_201_CREATED,
    tags=["Usuarios"],
)
def asociar_vehiculo_modulo2(
    id_propietario: int,
    datos: VehiculoAsociarSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Asocia un vehículo adicional a un usuario existente validando placa única y formato según tipo."""
    return Modulo2UsuarioConnection(conn).asociar_vehiculo(id_propietario, datos, usuario_responsable=current_user.nombre)


@app.patch(
    "/api/usuarios/{id_propietario:int}/estado",
    response_model=UsuarioModulo2Out,
    status_code=HTTP_200_OK,
    tags=["Usuarios"],
)
def cambiar_estado_usuario_modulo2(
    id_propietario: int,
    datos: CambioEstadoSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Inactiva o reactiva un usuario exigiendo motivo obligatorio y bloqueando si tiene vehículo dentro (RN-U06)."""
    return Modulo2UsuarioConnection(conn).cambiar_estado_usuario(
        id_propietario, datos, usuario_responsable=current_user.nombre
    )


@app.patch(
    "/api/vehiculos/{placa}/estado",
    response_model=UsuarioModulo2Out,
    status_code=HTTP_200_OK,
    tags=["Vehículos"],
)
def cambiar_estado_vehiculo_modulo2(
    placa: str,
    datos: CambioEstadoSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Inactiva o reactiva un vehículo exigiendo motivo obligatorio y bloqueando si tiene entrada abierta (RN-U06)."""
    return Modulo2UsuarioConnection(conn).cambiar_estado_vehiculo(
        placa, datos, usuario_responsable=current_user.nombre
    )


@app.delete(
    "/api/vehiculos/{placa}",
    response_model=UsuarioModulo2Out,
    status_code=HTTP_200_OK,
    tags=["Vehículos"],
)
def eliminar_vehiculo_modulo2(
    placa: str,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Retira o elimina un vehículo de un usuario cuando ya no pertenece al propietario, bloqueando si está dentro."""
    return Modulo2UsuarioConnection(conn).eliminar_vehiculo(
        placa, usuario_responsable=current_user.nombre
    )


@app.delete(
    "/api/usuarios/{id_propietario:int}",
    status_code=HTTP_200_OK,
    tags=["Usuarios"],
)
def eliminar_usuario_modulo2(
    id_propietario: int,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Elimina un usuario y sus vehículos asociados siempre que ninguno esté dentro del parqueadero."""
    return Modulo2UsuarioConnection(conn).eliminar_usuario(
        id_propietario, usuario_responsable=current_user.nombre
    )


@app.get(
    "/api/celdas",
    response_model=List[CeldaModulo2Out],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Celdas"],
)
def listar_celdas_modulo2(conn=Depends(get_db)):
    """Retorna todas las celdas reales desde `espacio` cruzadas con entradas abiertas e historial de trazabilidad."""
    return Modulo2CeldaConnection(conn).list_celdas()


@app.post(
    "/api/celdas/inicializar",
    response_model=List[CeldaModulo2Out],
    status_code=HTTP_200_OK,
    tags=["Celdas"],
)
def inicializar_celdas_modulo2(
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Crea o asegura las 70 celdas de carro (C-01 a C-70) y 10 de moto (M-01 a M-10) sin borrar las existentes."""
    return Modulo2CeldaConnection(conn).inicializar_celdas(usuario_responsable=current_user.nombre)


@app.post(
    "/api/celdas",
    response_model=CeldaModulo2Out,
    status_code=HTTP_201_CREATED,
    tags=["Celdas"],
)
def crear_celda_modulo2(
    datos: CeldaCrearSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Crea una celda nueva validando código único y registrando su creación en `historial_celda`."""
    return Modulo2CeldaConnection(conn).crear_celda(datos, usuario_responsable=current_user.nombre)


@app.patch(
    "/api/celdas/{codigo}",
    response_model=CeldaModulo2Out,
    status_code=HTTP_200_OK,
    tags=["Celdas"],
)
def actualizar_celda_modulo2(
    codigo: str,
    datos: CeldaActualizarSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Permite cambiar el estado operativo o el tipo de una celda libre validando cupo garantizado y motivo obligatorio."""
    return Modulo2CeldaConnection(conn).actualizar_celda(
        codigo, datos, usuario_responsable=current_user.nombre
    )


@app.delete(
    "/api/celdas/{codigo}",
    status_code=HTTP_200_OK,
    tags=["Celdas"],
)
def eliminar_celda_modulo2(
    codigo: str,
    current_user: UsuarioOut = Depends(get_current_admin_user),
    conn=Depends(get_db),
):
    """Elimina una celda libre del parqueadero (solo Administrador) validando cupo mínimo garantizado."""
    return Modulo2CeldaConnection(conn).eliminar_celda(
        codigo, usuario_responsable=current_user.nombre
    )


if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
