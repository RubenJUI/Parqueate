from pydantic import BaseModel

from schema.tipos import RolUsuario


class UsuarioOut(BaseModel):
    id_usuario: int
    nombre: str
    correo: str
    rol: RolUsuario
    estado: bool

    @classmethod
    def from_row(cls, row: dict) -> "UsuarioOut":
        return cls.model_validate(row)
