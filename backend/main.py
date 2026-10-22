from typing import List, Optional

import psycopg2
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg2 import errors
from starlette.status import HTTP_200_OK, HTTP_201_CREATED, HTTP_204_NO_CONTENT, HTTP_409_CONFLICT

from auth.auth import get_current_active_user, get_current_admin_user, get_password_hash
from auth.auth_routes import router as auth_router
from config import ALLOWED_ORIGINS
from database.database import get_db
from models.espacio_connection import EspacioConnection
from models.pago_connection import PagoConnection
from models.propietario_connection import PropietarioConnection
from models.tarifa_connection import TarifaConnection
from models.tiquete_connection import TiqueteConnection
from models.usuario_connection import UsuarioConnection
from models.vehiculo_connection import VehiculoConnection
from schema.espacio_schema import EspacioCreateSchema, EspacioOut, EspacioUpdateSchema
from schema.pago_schema import PagoCreateSchema, PagoOut
from schema.propietario_schema import PropietarioCreateSchema, PropietarioOut, PropietarioUpdateSchema
from schema.tarifa_schema import TarifaCreateSchema, TarifaOut, TarifaUpdateSchema
from schema.tipos import EstadoEspacio, TipoPermitido, TipoVehiculo, normalizar_placa
from schema.tiquete_schema import PlacaSchema, TiqueteOut
from schema.usuario_schema import UsuarioCreateSchema, UsuarioOut, UsuarioUpdateSchema
from schema.vehiculo_schema import VehiculoCreateSchema, VehiculoOut, VehiculoUpdateSchema

tags_metadata = [
    {"name": "auth", "description": "Login y emisión del token JWT."},
    {"name": "Usuarios", "description": "Administradores y operadores del parqueadero."},
    {"name": "Propietarios", "description": "Titulares de los vehículos."},
    {"name": "Vehículos", "description": "Vehículos registrados, identificados por placa."},
    {"name": "Espacios", "description": "Celdas del parqueadero y su disponibilidad."},
    {"name": "Tarifas", "description": "Valores por hora y por día según el tipo de vehículo."},
    {"name": "Tiquetes", "description": "Registro de entradas y salidas."},
    {"name": "Pagos", "description": "Pago de los tiquetes cerrados."},
    {"name": "Sistema", "description": "Endpoints de estado del servicio."},
]

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


@app.get(
    "/api/usuarios",
    response_model=List[UsuarioOut],
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_200_OK,
    tags=["Usuarios"],
)
def list_usuarios(conn=Depends(get_db)):
    rows = UsuarioConnection(conn).list_all()
    return [UsuarioOut.from_row(row) for row in rows]


@app.get(
    "/api/usuarios/{id_usuario}",
    response_model=UsuarioOut,
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_200_OK,
    tags=["Usuarios"],
)
def get_usuario(id_usuario: int, conn=Depends(get_db)):
    row = UsuarioConnection(conn).get_by_id(id_usuario)
    if not row:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    return UsuarioOut.from_row(row)


@app.post(
    "/api/usuarios",
    response_model=UsuarioOut,
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_201_CREATED,
    tags=["Usuarios"],
)
def create_usuario(usuario: UsuarioCreateSchema, conn=Depends(get_db)):
    repo = UsuarioConnection(conn)
    if repo.get_by_correo(usuario.correo):
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="El correo ya está registrado")

    row = repo.create(
        nombre=usuario.nombre,
        correo=usuario.correo,
        contrasena_hash=get_password_hash(usuario.contrasena),
        rol=usuario.rol,
        estado=usuario.estado,
    )
    return UsuarioOut.from_row(row)


@app.put(
    "/api/usuarios/{id_usuario}",
    response_model=UsuarioOut,
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_200_OK,
    tags=["Usuarios"],
)
def update_usuario(id_usuario: int, usuario: UsuarioUpdateSchema, conn=Depends(get_db)):
    repo = UsuarioConnection(conn)
    if not repo.get_by_id(id_usuario):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    fields = usuario.model_dump(exclude_unset=True)
    if "contrasena" in fields:
        fields["contrasena_hash"] = get_password_hash(fields.pop("contrasena"))
    if "correo" in fields:
        otro = repo.get_by_correo(fields["correo"])
        if otro and otro["id_usuario"] != id_usuario:
            raise HTTPException(status_code=HTTP_409_CONFLICT, detail="El correo ya está registrado")

    row = repo.update(id_usuario, fields)
    return UsuarioOut.from_row(row)


@app.delete(
    "/api/usuarios/{id_usuario}",
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_204_NO_CONTENT,
    tags=["Usuarios"],
)
def delete_usuario(id_usuario: int, conn=Depends(get_db)):
    if not UsuarioConnection(conn).delete(id_usuario):
        raise HTTPException(status_code=404, detail="Usuario no encontrado")


@app.get(
    "/api/propietarios",
    response_model=List[PropietarioOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Propietarios"],
)
def list_propietarios(conn=Depends(get_db)):
    rows = PropietarioConnection(conn).list_all()
    return [PropietarioOut.from_row(row) for row in rows]


@app.get(
    "/api/propietarios/{id_propietario}",
    response_model=PropietarioOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Propietarios"],
)
def get_propietario(id_propietario: int, conn=Depends(get_db)):
    row = PropietarioConnection(conn).get_by_id(id_propietario)
    if not row:
        raise HTTPException(status_code=404, detail="Propietario no encontrado")
    return PropietarioOut.from_row(row)


@app.post(
    "/api/propietarios",
    response_model=PropietarioOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_201_CREATED,
    tags=["Propietarios"],
)
def create_propietario(propietario: PropietarioCreateSchema, conn=Depends(get_db)):
    repo = PropietarioConnection(conn)
    if repo.get_by_documento(propietario.documento):
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="Ya existe un propietario con ese documento")

    row = repo.create(
        documento=propietario.documento,
        nombre=propietario.nombre,
        telefono=propietario.telefono,
        correo=propietario.correo,
    )
    return PropietarioOut.from_row(row)


@app.put(
    "/api/propietarios/{id_propietario}",
    response_model=PropietarioOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Propietarios"],
)
def update_propietario(id_propietario: int, propietario: PropietarioUpdateSchema, conn=Depends(get_db)):
    repo = PropietarioConnection(conn)
    if not repo.get_by_id(id_propietario):
        raise HTTPException(status_code=404, detail="Propietario no encontrado")

    fields = propietario.model_dump(exclude_unset=True)
    if "documento" in fields:
        otro = repo.get_by_documento(fields["documento"])
        if otro and otro["id_propietario"] != id_propietario:
            raise HTTPException(status_code=HTTP_409_CONFLICT, detail="Ya existe un propietario con ese documento")

    row = repo.update(id_propietario, fields)
    return PropietarioOut.from_row(row)


@app.delete(
    "/api/propietarios/{id_propietario}",
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_204_NO_CONTENT,
    tags=["Propietarios"],
)
def delete_propietario(id_propietario: int, conn=Depends(get_db)):
    """Los vehículos del propietario quedan sin propietario (ON DELETE SET NULL)."""
    if not PropietarioConnection(conn).delete(id_propietario):
        raise HTTPException(status_code=404, detail="Propietario no encontrado")


@app.get(
    "/api/vehiculos",
    response_model=List[VehiculoOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Vehículos"],
)
def list_vehiculos(id_propietario: Optional[int] = Query(None), conn=Depends(get_db)):
    rows = VehiculoConnection(conn).list_all(id_propietario=id_propietario)
    return [VehiculoOut.from_row(row) for row in rows]


@app.get(
    "/api/vehiculos/{placa}",
    response_model=VehiculoOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Vehículos"],
)
def get_vehiculo(placa: str, conn=Depends(get_db)):
    row = VehiculoConnection(conn).get_by_placa(normalizar_placa(placa))
    if not row:
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")
    return VehiculoOut.from_row(row)


@app.post(
    "/api/vehiculos",
    response_model=VehiculoOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_201_CREATED,
    tags=["Vehículos"],
)
def create_vehiculo(vehiculo: VehiculoCreateSchema, conn=Depends(get_db)):
    repo = VehiculoConnection(conn)
    if repo.get_by_placa(vehiculo.placa):
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="La placa ya está registrada")
    if vehiculo.id_propietario is not None and not PropietarioConnection(conn).get_by_id(vehiculo.id_propietario):
        raise HTTPException(status_code=404, detail="Propietario no encontrado")

    row = repo.create(
        placa=vehiculo.placa,
        tipo_vehiculo=vehiculo.tipo_vehiculo,
        marca=vehiculo.marca,
        modelo=vehiculo.modelo,
        color=vehiculo.color,
        id_propietario=vehiculo.id_propietario,
    )
    return VehiculoOut.from_row(row)


@app.put(
    "/api/vehiculos/{placa}",
    response_model=VehiculoOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Vehículos"],
)
def update_vehiculo(placa: str, vehiculo: VehiculoUpdateSchema, conn=Depends(get_db)):
    placa = normalizar_placa(placa)
    repo = VehiculoConnection(conn)
    if not repo.get_by_placa(placa):
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")

    fields = vehiculo.model_dump(exclude_unset=True)
    if fields.get("id_propietario") is not None and not PropietarioConnection(conn).get_by_id(fields["id_propietario"]):
        raise HTTPException(status_code=404, detail="Propietario no encontrado")

    row = repo.update(placa, fields)
    return VehiculoOut.from_row(row)


@app.delete(
    "/api/vehiculos/{placa}",
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_204_NO_CONTENT,
    tags=["Vehículos"],
)
def delete_vehiculo(placa: str, conn=Depends(get_db)):
    """No se puede eliminar un vehículo que ya tiene tiquetes (la base responde 409)."""
    if not VehiculoConnection(conn).delete(normalizar_placa(placa)):
        raise HTTPException(status_code=404, detail="Vehículo no encontrado")


@app.get(
    "/api/espacios",
    response_model=List[EspacioOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Espacios"],
)
def list_espacios(
    estado: Optional[EstadoEspacio] = Query(None),
    tipo_permitido: Optional[TipoPermitido] = Query(None),
    conn=Depends(get_db),
):
    rows = EspacioConnection(conn).list_all(estado=estado, tipo_permitido=tipo_permitido)
    return [EspacioOut.from_row(row) for row in rows]


@app.get(
    "/api/espacios/{id_espacio}",
    response_model=EspacioOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Espacios"],
)
def get_espacio(id_espacio: int, conn=Depends(get_db)):
    row = EspacioConnection(conn).get_by_id(id_espacio)
    if not row:
        raise HTTPException(status_code=404, detail="Espacio no encontrado")
    return EspacioOut.from_row(row)


@app.post(
    "/api/espacios",
    response_model=EspacioOut,
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_201_CREATED,
    tags=["Espacios"],
)
def create_espacio(espacio: EspacioCreateSchema, conn=Depends(get_db)):
    repo = EspacioConnection(conn)
    if repo.get_by_numero(espacio.numero_espacio):
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="Ya existe un espacio con ese número")

    row = repo.create(
        numero_espacio=espacio.numero_espacio,
        piso_zona=espacio.piso_zona,
        tipo_permitido=espacio.tipo_permitido,
        estado=espacio.estado,
    )
    return EspacioOut.from_row(row)


@app.put(
    "/api/espacios/{id_espacio}",
    response_model=EspacioOut,
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_200_OK,
    tags=["Espacios"],
)
def update_espacio(id_espacio: int, espacio: EspacioUpdateSchema, conn=Depends(get_db)):
    repo = EspacioConnection(conn)
    if not repo.get_by_id(id_espacio):
        raise HTTPException(status_code=404, detail="Espacio no encontrado")

    fields = espacio.model_dump(exclude_unset=True)
    if "numero_espacio" in fields:
        otro = repo.get_by_numero(fields["numero_espacio"])
        if otro and otro["id_espacio"] != id_espacio:
            raise HTTPException(status_code=HTTP_409_CONFLICT, detail="Ya existe un espacio con ese número")

    row = repo.update(id_espacio, fields)
    return EspacioOut.from_row(row)


@app.delete(
    "/api/espacios/{id_espacio}",
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_204_NO_CONTENT,
    tags=["Espacios"],
)
def delete_espacio(id_espacio: int, conn=Depends(get_db)):
    if not EspacioConnection(conn).delete(id_espacio):
        raise HTTPException(status_code=404, detail="Espacio no encontrado")


@app.get(
    "/api/tarifas",
    response_model=List[TarifaOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Tarifas"],
)
def list_tarifas(tipo_vehiculo: Optional[TipoVehiculo] = Query(None), conn=Depends(get_db)):
    rows = TarifaConnection(conn).list_all(tipo_vehiculo=tipo_vehiculo)
    return [TarifaOut.from_row(row) for row in rows]


@app.get(
    "/api/tarifas/{id_tarifa}",
    response_model=TarifaOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Tarifas"],
)
def get_tarifa(id_tarifa: int, conn=Depends(get_db)):
    row = TarifaConnection(conn).get_by_id(id_tarifa)
    if not row:
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")
    return TarifaOut.from_row(row)


@app.post(
    "/api/tarifas",
    response_model=TarifaOut,
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_201_CREATED,
    tags=["Tarifas"],
)
def create_tarifa(tarifa: TarifaCreateSchema, conn=Depends(get_db)):
    row = TarifaConnection(conn).create(
        tipo_vehiculo=tarifa.tipo_vehiculo,
        valor_hora=tarifa.valor_hora,
        valor_dia=tarifa.valor_dia,
        fecha_inicio_vigencia=tarifa.fecha_inicio_vigencia,
        estado=tarifa.estado,
    )
    return TarifaOut.from_row(row)


@app.put(
    "/api/tarifas/{id_tarifa}",
    response_model=TarifaOut,
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_200_OK,
    tags=["Tarifas"],
)
def update_tarifa(id_tarifa: int, tarifa: TarifaUpdateSchema, conn=Depends(get_db)):
    repo = TarifaConnection(conn)
    if not repo.get_by_id(id_tarifa):
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")

    fields = tarifa.model_dump(exclude_unset=True)
    row = repo.update(id_tarifa, fields)
    return TarifaOut.from_row(row)


@app.delete(
    "/api/tarifas/{id_tarifa}",
    dependencies=[Depends(get_current_admin_user)],
    status_code=HTTP_204_NO_CONTENT,
    tags=["Tarifas"],
)
def delete_tarifa(id_tarifa: int, conn=Depends(get_db)):
    """Una tarifa usada por algún tiquete no se puede eliminar (409); desactívala con `estado: false`."""
    if not TarifaConnection(conn).delete(id_tarifa):
        raise HTTPException(status_code=404, detail="Tarifa no encontrada")


@app.get(
    "/api/tiquetes",
    response_model=List[TiqueteOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Tiquetes"],
)
def list_tiquetes(
    placa: Optional[str] = Query(None),
    abiertos: Optional[bool] = Query(None, description="true: vehículos dentro; false: tiquetes con salida"),
    conn=Depends(get_db),
):
    rows = TiqueteConnection(conn).list_all(placa=normalizar_placa(placa) if placa else None, abiertos=abiertos)
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


@app.post("/api/tiquetes/entrada", response_model=TiqueteOut, status_code=HTTP_201_CREATED, tags=["Tiquetes"])
def registrar_entrada(
    entrada: PlacaSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Abre un tiquete y asigna automáticamente un espacio disponible del tipo del vehículo."""
    vehiculo = VehiculoConnection(conn).get_by_placa(entrada.placa)
    if not vehiculo:
        raise HTTPException(status_code=404, detail="Vehículo no registrado")

    repo = TiqueteConnection(conn)
    if repo.get_abierto_por_placa(entrada.placa):
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="El vehículo ya se encuentra dentro del parqueadero")

    tarifa = TarifaConnection(conn).get_vigente(vehiculo["tipo_vehiculo"])
    if not tarifa:
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail=f"No hay una tarifa vigente para {vehiculo['tipo_vehiculo']}")

    row = repo.registrar_entrada(
        placa=entrada.placa,
        tipo_vehiculo=vehiculo["tipo_vehiculo"],
        id_tarifa=tarifa["id_tarifa"],
        id_usuario_entrada=current_user.id_usuario,
    )
    if not row:
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail=f"No hay espacios disponibles para {vehiculo['tipo_vehiculo']}")
    return TiqueteOut.from_row(row)


@app.post("/api/tiquetes/salida", response_model=TiqueteOut, status_code=HTTP_200_OK, tags=["Tiquetes"])
def registrar_salida(
    salida: PlacaSchema,
    current_user: UsuarioOut = Depends(get_current_active_user),
    conn=Depends(get_db),
):
    """Cierra el tiquete abierto de la placa, calcula `valor_total` y libera el espacio."""
    repo = TiqueteConnection(conn)
    abierto = repo.get_abierto_por_placa(salida.placa)
    if not abierto:
        raise HTTPException(status_code=404, detail="El vehículo no tiene un ingreso activo")

    row = repo.registrar_salida(abierto["id_tiquete"], id_usuario_salida=current_user.id_usuario)
    if not row:
        # Otra terminal registró la salida entre la consulta y la actualización.
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="La salida de este vehículo ya fue registrada")
    return TiqueteOut.from_row(row)


@app.get(
    "/api/pagos",
    response_model=List[PagoOut],
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Pagos"],
)
def list_pagos(id_tiquete: Optional[int] = Query(None), conn=Depends(get_db)):
    rows = PagoConnection(conn).list_all(id_tiquete=id_tiquete)
    return [PagoOut.from_row(row) for row in rows]


@app.get(
    "/api/pagos/{id_pago}",
    response_model=PagoOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_200_OK,
    tags=["Pagos"],
)
def get_pago(id_pago: int, conn=Depends(get_db)):
    row = PagoConnection(conn).get_by_id(id_pago)
    if not row:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return PagoOut.from_row(row)


@app.post(
    "/api/pagos",
    response_model=PagoOut,
    dependencies=[Depends(get_current_active_user)],
    status_code=HTTP_201_CREATED,
    tags=["Pagos"],
)
def create_pago(pago: PagoCreateSchema, conn=Depends(get_db)):
    tiquete = TiqueteConnection(conn).get_by_id(pago.id_tiquete)
    if not tiquete:
        raise HTTPException(status_code=404, detail="Tiquete no encontrado")
    if tiquete["fecha_hora_salida"] is None:
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="Registra la salida antes de pagar el tiquete")
    if tiquete["estado_pago"] == "Pagado":
        raise HTTPException(status_code=HTTP_409_CONFLICT, detail="El tiquete ya está pagado")

    row = PagoConnection(conn).create(id_tiquete=pago.id_tiquete, monto=tiquete["valor_total"], metodo_pago=pago.metodo_pago)
    return PagoOut.from_row(row)


if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
