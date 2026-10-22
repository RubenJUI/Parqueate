from pydantic import BaseModel

from schema.tipos import TipoVehiculo


class TarifaOut(BaseModel):
    tipo_vehiculo: TipoVehiculo
    valor_mensual: float

    @classmethod
    def from_row(cls, row: dict) -> "TarifaOut":
        return cls.model_validate(row)
