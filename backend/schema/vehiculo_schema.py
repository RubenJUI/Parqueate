from datetime import date
from typing import Optional

from pydantic import BaseModel

from schema.tipos import EstadoMensualidad, TipoVehiculo


class MensualidadOut(BaseModel):
    """Vigencia calculada a partir del pago más reciente (RN-04)."""

    fecha_pago: date
    fecha_vencimiento: date
    dias_restantes: int
    estado: EstadoMensualidad


class VehiculoConsultaOut(BaseModel):
    """Lo que el operario necesita al buscar una placa: usuario, mensualidad y si ya está dentro."""

    placa: str
    tipo_vehiculo: TipoVehiculo
    id_propietario: int
    propietario: str
    documento: str
    telefono: Optional[str] = None
    mensualidad: Optional[MensualidadOut] = None
    id_tiquete_abierto: Optional[int] = None
    numero_espacio: Optional[str] = None
