from typing import Optional

from pydantic import BaseModel, Field

from schema.tipos import EstadoEspacio, TipoPermitido


class EspacioBase(BaseModel):
    numero_espacio: str = Field(..., max_length=10)
    piso_zona: str = Field(..., max_length=20)
    tipo_permitido: TipoPermitido
    estado: EstadoEspacio = "Disponible"


class EspacioCreateSchema(EspacioBase):
    class Config:
        json_schema_extra = {"example": {"numero_espacio": "C-01", "piso_zona": "Piso 1", "tipo_permitido": "Carro", "estado": "Disponible"}}


class EspacioUpdateSchema(BaseModel):
    numero_espacio: Optional[str] = Field(None, max_length=10)
    piso_zona: Optional[str] = Field(None, max_length=20)
    tipo_permitido: Optional[TipoPermitido] = None
    estado: Optional[EstadoEspacio] = None


class EspacioOut(EspacioBase):
    id_espacio: int

    @classmethod
    def from_row(cls, row: dict) -> "EspacioOut":
        return cls.model_validate(row)
