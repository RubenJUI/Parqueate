from typing import List, Literal, Optional
from pydantic import BaseModel

from schema.tipos import TipoVehiculo

TipoDocumento = Literal["CC", "CE", "TI", "PAS"]
EstadoRegistro = Literal["Activo", "Inactivo"]
EstadoCeldaUI = Literal["Libre", "Ocupada", "Fuera de servicio"]


class VehiculoModulo2Out(BaseModel):
    """Representación de un vehículo asociado a un usuario en el Módulo 2."""

    id: int
    placa: str
    tipo: TipoVehiculo
    marca: str
    color: str
    estado: EstadoRegistro
    tieneEntradaAbierta: bool = False
    celdaOcupada: Optional[str] = None


class AuditoriaUsuarioOut(BaseModel):
    """Evento de trazabilidad de creación, edición o cambio de estado de un usuario o vehículo."""

    id: int
    fecha: str
    usuario: str
    campo: str
    valorAnterior: str
    valorNuevo: str
    motivo: Optional[str] = None
    placa: Optional[str] = None


class UsuarioModulo2Out(BaseModel):
    """Usuario completo con sus vehículos asociados (1 a N) y su bitácora de auditoría."""

    id: int
    documentoTipo: TipoDocumento
    documento: str
    nombres: str
    apellidos: str
    celular: str
    correo: str
    estado: EstadoRegistro
    fechaRegistro: str
    operario: str
    autorizacionHabeasData: bool
    tieneEntradaAbierta: bool = False
    vehiculos: List[VehiculoModulo2Out]
    auditLogs: List[AuditoriaUsuarioOut]


class UsuarioCrearSchema(BaseModel):
    """Datos para registrar un usuario y su primer vehículo en una sola transacción."""

    documentoTipo: TipoDocumento = "CC"
    documento: str
    nombres: str
    apellidos: str
    celular: str
    correo: Optional[str] = ""
    tipo: TipoVehiculo = "Carro"
    placa: str
    marca: str
    color: str
    autorizacionHabeasData: bool


class UsuarioEditarSchema(BaseModel):
    """Datos permitidos para edición de contacto y vehículo (documento y placa son ineditables)."""

    celular: str
    correo: Optional[str] = ""
    id_vehiculo: Optional[int] = None
    placa_vehiculo: Optional[str] = None
    marca: Optional[str] = None
    color: Optional[str] = None
    documento: Optional[str] = None
    placa: Optional[str] = None


class VehiculoAsociarSchema(BaseModel):
    """Datos para asociar un vehículo adicional a un usuario existente."""

    placa: str
    tipo: TipoVehiculo
    marca: str
    color: str


class EliminacionSchema(BaseModel):
    """Solicitud de eliminación de un usuario o vehículo registrado por error (HU-U08), con motivo obligatorio."""

    motivo: str


class CambioEstadoSchema(BaseModel):
    """Solicitud de inactivación o reactivación de un usuario o vehículo con motivo obligatorio."""

    estado: Optional[EstadoRegistro] = None
    motivo: str


class HistorialCeldaOut(BaseModel):
    """Evento en el historial de trazabilidad de una celda del parqueadero."""

    id: int
    momento: str
    usuario: str
    accion: str
    motivo: str


class CeldaModulo2Out(BaseModel):
    """Representación de una celda del parqueadero para el Mapa de Celdas del Módulo 2."""

    id: int
    codigo: str
    tipo: TipoVehiculo
    estado: EstadoCeldaUI
    placa: Optional[str] = None
    hora: Optional[str] = None
    motivo: Optional[str] = None
    historial: List[HistorialCeldaOut]
    # HU-C01/HU-C05/HU-C06: si la celda resulta de una conversión, el espacio donde está
    # (p. ej. "C-20" o "M-05 y M-06") y el tipo que tenía ese espacio.
    id_conversion: Optional[int] = None
    espacio_original: Optional[str] = None
    tipo_original: Optional[TipoVehiculo] = None
    # HU-C06: pareja fija de una moto original (M-05 -> "M-06"); None si no puede convertirse a carro.
    pareja: Optional[str] = None


class CeldaCrearSchema(BaseModel):
    """Datos para crear una nueva celda con código único."""

    codigo: str
    tipo: TipoVehiculo


class CeldaMotivoSchema(BaseModel):
    """Motivo obligatorio para convertir una celda o restablecer una conversión."""

    motivo: str


class CeldaActualizarSchema(BaseModel):
    """Datos para cambiar estado operativo (Libre / Fuera de servicio) o tipo de una celda."""

    estado: Optional[Literal["Libre", "Fuera de servicio"]] = None
    tipo: Optional[TipoVehiculo] = None
    motivo: str
