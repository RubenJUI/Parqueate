from typing import Optional

from pydantic import BaseModel, Field

from schema.tipos import RolUsuario


class UsuarioBase(BaseModel):
    nombre: str = Field(..., max_length=100)
    correo: str = Field(..., max_length=100)
    rol: RolUsuario
    estado: bool = True


class UsuarioCreateSchema(UsuarioBase):
    contrasena: str = Field(..., min_length=6)

    class Config:
        json_schema_extra = {
            "example": {
                "nombre": "Laura Gómez",
                "correo": "laura@autoscolombia.co",
                "contrasena": "clave123",
                "rol": "Operador",
                "estado": True,
            }
        }


class UsuarioUpdateSchema(BaseModel):
    nombre: Optional[str] = Field(None, max_length=100)
    correo: Optional[str] = Field(None, max_length=100)
    rol: Optional[RolUsuario] = None
    estado: Optional[bool] = None
    contrasena: Optional[str] = Field(None, min_length=6)


class UsuarioOut(UsuarioBase):
    id_usuario: int

    @classmethod
    def from_row(cls, row: dict) -> "UsuarioOut":
        return cls.model_validate(row)
