from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from schema.tipos import EstadoPago, normalizar_placa


class PlacaSchema(BaseModel):
    placa: str = Field(..., min_length=5, max_length=10)

    @field_validator("placa")
    @classmethod
    def _normalizar_placa(cls, placa: str) -> str:
        return normalizar_placa(placa)

    class Config:
        json_schema_extra = {"example": {"placa": "ABC123"}}


class TiqueteOut(BaseModel):
    id_tiquete: int
    placa: str
    id_espacio: int
    id_tarifa: int
    id_usuario_entrada: int
    id_usuario_salida: Optional[int] = None
    fecha_hora_entrada: datetime
    fecha_hora_salida: Optional[datetime] = None
    valor_total: Optional[float] = None
    estado_pago: EstadoPago

    @classmethod
    def from_row(cls, row: dict) -> "TiqueteOut":
        return cls.model_validate(row)
