from datetime import datetime

from pydantic import BaseModel

from schema.tipos import MetodoPago


class PagoCreateSchema(BaseModel):
    """El monto no se envía: se toma del `valor_total` calculado al registrar la salida."""

    id_tiquete: int
    metodo_pago: MetodoPago

    class Config:
        json_schema_extra = {"example": {"id_tiquete": 1, "metodo_pago": "Efectivo"}}


class PagoOut(BaseModel):
    id_pago: int
    id_tiquete: int
    fecha_hora_pago: datetime
    monto: float
    metodo_pago: MetodoPago

    @classmethod
    def from_row(cls, row: dict) -> "PagoOut":
        return cls.model_validate(row)
