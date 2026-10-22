from typing import Optional

from pydantic import BaseModel, Field, field_validator

from schema.tipos import TipoVehiculo, normalizar_placa


class VehiculoBase(BaseModel):
    tipo_vehiculo: TipoVehiculo
    marca: Optional[str] = Field(None, max_length=50)
    modelo: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=30)
    id_propietario: Optional[int] = None


class VehiculoCreateSchema(VehiculoBase):
    placa: str = Field(..., min_length=5, max_length=10)

    @field_validator("placa")
    @classmethod
    def _normalizar_placa(cls, placa: str) -> str:
        return normalizar_placa(placa)

    class Config:
        json_schema_extra = {
            "example": {"placa": "ABC123", "tipo_vehiculo": "Carro", "marca": "Mazda", "modelo": "2022", "color": "Gris", "id_propietario": 1}
        }


class VehiculoUpdateSchema(BaseModel):
    tipo_vehiculo: Optional[TipoVehiculo] = None
    marca: Optional[str] = Field(None, max_length=50)
    modelo: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=30)
    id_propietario: Optional[int] = None


class VehiculoOut(VehiculoBase):
    placa: str

    @classmethod
    def from_row(cls, row: dict) -> "VehiculoOut":
        return cls.model_validate(row)
