from typing import Optional

from pydantic import BaseModel, Field


class PropietarioBase(BaseModel):
    documento: str = Field(..., max_length=20)
    nombre: str = Field(..., max_length=100)
    telefono: Optional[str] = Field(None, max_length=20)
    correo: Optional[str] = Field(None, max_length=100)


class PropietarioCreateSchema(PropietarioBase):
    class Config:
        json_schema_extra = {
            "example": {"documento": "1036123456", "nombre": "Carlos Restrepo", "telefono": "300-456-7890", "correo": "carlos@mail.com"}
        }


class PropietarioUpdateSchema(BaseModel):
    documento: Optional[str] = Field(None, max_length=20)
    nombre: Optional[str] = Field(None, max_length=100)
    telefono: Optional[str] = Field(None, max_length=20)
    correo: Optional[str] = Field(None, max_length=100)


class PropietarioOut(PropietarioBase):
    id_propietario: int

    @classmethod
    def from_row(cls, row: dict) -> "PropietarioOut":
        return cls.model_validate(row)
