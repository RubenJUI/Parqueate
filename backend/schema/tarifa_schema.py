from datetime import date
from typing import Optional

from pydantic import BaseModel, Field

from schema.tipos import TipoVehiculo


class TarifaBase(BaseModel):
    tipo_vehiculo: TipoVehiculo
    valor_hora: float = Field(..., ge=0)
    valor_dia: float = Field(..., ge=0)
    estado: bool = True


class TarifaCreateSchema(TarifaBase):
    fecha_inicio_vigencia: Optional[date] = None

    class Config:
        json_schema_extra = {"example": {"tipo_vehiculo": "Carro", "valor_hora": 4000, "valor_dia": 30000, "estado": True}}


class TarifaUpdateSchema(BaseModel):
    tipo_vehiculo: Optional[TipoVehiculo] = None
    valor_hora: Optional[float] = Field(None, ge=0)
    valor_dia: Optional[float] = Field(None, ge=0)
    fecha_inicio_vigencia: Optional[date] = None
    estado: Optional[bool] = None


class TarifaOut(TarifaBase):
    id_tarifa: int
    fecha_inicio_vigencia: date

    @classmethod
    def from_row(cls, row: dict) -> "TarifaOut":
        return cls.model_validate(row)
