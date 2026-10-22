from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from schema.tipos import EstadoTiquete, TipoVehiculo, normalizar_placa


class PlacaSchema(BaseModel):
    placa: str = Field(..., min_length=5, max_length=10)
    novedad: Optional[str] = Field(None, max_length=255, description="RF-13: rayón, golpe, etc.")

    @field_validator("placa")
    @classmethod
    def _normalizar_placa(cls, placa: str) -> str:
        return normalizar_placa(placa)

    class Config:
        json_schema_extra = {"example": {"placa": "ABC123", "novedad": None}}


class EntradaSchema(PlacaSchema):
    id_espacio: Optional[int] = Field(None, description="RF-05: celda elegida por el operario; si se omite se asigna automáticamente")


class CambioEspacioSchema(BaseModel):
    id_espacio: int


class AnulacionSchema(BaseModel):
    motivo: str = Field(..., min_length=5, max_length=255)


class TiqueteOut(BaseModel):
    id_tiquete: int
    placa: str
    tipo_vehiculo: TipoVehiculo
    id_propietario: int
    propietario: str
    id_espacio: int
    numero_espacio: str
    id_usuario_entrada: int
    id_usuario_salida: Optional[int] = None
    fecha_hora_entrada: datetime
    fecha_hora_salida: Optional[datetime] = None
    novedad_entrada: Optional[str] = None
    novedad_salida: Optional[str] = None
    estado: EstadoTiquete
    motivo_anulacion: Optional[str] = None
    id_usuario_anulacion: Optional[int] = None
    fecha_hora_anulacion: Optional[datetime] = None

    @classmethod
    def from_row(cls, row: dict) -> "TiqueteOut":
        return cls.model_validate(row)


class EntradaOut(TiqueteOut):
    """Tiquete abierto más la vigencia de la mensualidad y la alerta de vencimiento próximo (RF-04)."""

    fecha_vencimiento: date
    dias_restantes: int
    alerta: Optional[str] = None
