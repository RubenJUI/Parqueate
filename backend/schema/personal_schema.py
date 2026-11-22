from typing import Literal, Optional
from pydantic import BaseModel

RolPersonal = Literal["Administrador", "Operario"]
EstadoPersonal = Literal["Activo", "Inactivo"]


class AuthLoginSchema(BaseModel):
    """Credenciales para iniciar sesión en PARQUEATE (POST /api/auth/login)."""

    correo: str
    contrasena: str


class AuthLoginOut(BaseModel):
    """Respuesta de inicio de sesión con datos de la cuenta del personal y token JWT de sesión."""

    id: int
    id_usuario: int
    nombre: str
    correo: str
    rol: RolPersonal
    estado: EstadoPersonal
    token: str
    access_token: str
    token_type: str = "bearer"


class CuentaPersonalOut(BaseModel):
    """Representación pública de una cuenta del personal (sin exponer contrasena_hash)."""

    id: int
    nombre: str
    correo: str
    rol: RolPersonal
    estado: EstadoPersonal
    motivo_inactivacion: Optional[str] = None
    fecha_creacion: str


class CuentaPersonalCrearSchema(BaseModel):
    """Datos para crear una nueva cuenta del personal (POST /api/personal)."""

    nombre: str
    correo: str
    contrasena: str
    rol: RolPersonal = "Operario"


class CuentaPersonalEditarSchema(BaseModel):
    """Datos para editar una cuenta del personal (PUT /api/personal/{id})."""

    nombre: str
    correo: str
    rol: RolPersonal
    contrasena: Optional[str] = None


class CuentaPersonalEstadoSchema(BaseModel):
    """Datos para activar o inactivar una cuenta del personal con motivo obligatorio (PATCH /api/personal/{id}/estado)."""

    estado: Optional[EstadoPersonal] = None
    motivo: str
