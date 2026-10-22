from typing import Literal

TipoVehiculo = Literal["Carro", "Moto", "Camioneta"]
TipoPermitido = Literal["Carro", "Moto", "Camioneta", "Todos"]
EstadoEspacio = Literal["Disponible", "Ocupado", "Mantenimiento"]
RolUsuario = Literal["Administrador", "Operador"]
EstadoPago = Literal["Pendiente", "Pagado"]
MetodoPago = Literal["Efectivo", "Tarjeta", "Transferencia"]


def normalizar_placa(placa: str) -> str:
    """Placas en mayúscula y sin espacios ni guiones: 'abc-123' -> 'ABC123'."""
    return placa.replace(" ", "").replace("-", "").upper()
