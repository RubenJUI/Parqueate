import logging
from datetime import date
from typing import List, Optional

import psycopg2
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg2 import errors
from starlette.status import HTTP_200_OK, HTTP_201_CREATED, HTTP_409_CONFLICT

from auth.auth import get_current_active_user, get_current_admin_user
from auth.auth_routes import router as auth_router
from config import ALLOWED_ORIGINS
from database.database import get_db
from models.espacio_connection import EspacioConnection
from models.pago_connection import PagoConnection, calcular_vigencia
from models.tarifa_connection import TarifaConnection
from models.tiquete_connection import TiqueteConnection
from models.vehiculo_connection import VehiculoConnection
from schema.espacio_schema import EspacioOut, OcupacionOut
from schema.tarifa_schema import TarifaOut
from schema.tipos import EstadoEspacio, TipoVehiculo, normalizar_placa
from schema.tiquete_schema import AnulacionSchema, CambioEspacioSchema, EntradaOut, EntradaSchema, PlacaSchema, TiqueteOut
from schema.usuario_schema import UsuarioOut
from schema.vehiculo_schema import VehiculoConsultaOut

tags_metadata = [
    {"name": "auth", "description": "Login y emisión del token JWT."},
    {"name": "Usuarios", "description": "Operario autenticado."},
    {"name": "Vehículos", "description": "Consulta por placa: usuario, mensualidad y si está dentro."},
    {"name": "Espacios", "description": "Celdas del parqueadero y ocupación."},
    {"name": "Tarifas", "description": "Valor de la mensualidad por tipo de vehículo."},
    {"name": "Tiquetes", "description": "Registro de entradas y salidas, historial y anulaciones."},
    {"name": "Sistema", "description": "Endpoints de estado del servicio."},
]

logger = logging.getLogger("parqueate")

app = FastAPI(title="Parqueate - Autos Colombia API", openapi_tags=tags_metadata)

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


if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
