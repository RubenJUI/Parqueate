from typing import Literal

TipoVehiculo = Literal["Carro", "Moto"]
EstadoEspacio = Literal["Disponible", "Ocupado", "Mantenimiento"]
RolUsuario = Literal["Administrador", "Operador"]
EstadoMensualidad = Literal["Vigente", "Por vencer", "Vencida"]
EstadoTiquete = Literal["Activo", "Finalizado", "Anulado"]


def normalizar_placa(placa: str) -> str:
    """Placas en mayúscula y sin espacios ni guiones: 'abc-123' -> 'ABC123'."""
    return placa.replace(" ", "").replace("-", "").upper()
