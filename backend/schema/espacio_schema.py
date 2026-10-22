from pydantic import BaseModel

from schema.tipos import EstadoEspacio, TipoVehiculo


class EspacioOut(BaseModel):
    id_espacio: int
    numero_espacio: str
    tipo_permitido: TipoVehiculo
    estado: EstadoEspacio

    @classmethod
    def from_row(cls, row: dict) -> "EspacioOut":
        return cls.model_validate(row)


class OcupacionOut(BaseModel):
    """RF-10: por ejemplo Carro 52/70."""

    tipo_vehiculo: TipoVehiculo
    total: int
    ocupadas: int
    disponibles: int
    mantenimiento: int
