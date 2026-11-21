from datetime import date
from typing import List, Literal, Optional
from pydantic import BaseModel

from schema.tipos import TipoVehiculo

MetodoPago = Literal["Efectivo", "Transferencia", "Tarjeta"]
EstadoPago = Literal["Registrado", "Anulado"]
EstadoMensualidadBackend = Literal["Vigente", "Por vencer", "Vencida", "Sin mensualidad"]
EstadoMensualidadUI = Literal["Al día", "Por vencer", "Vencida", "Sin mensualidad"]


class EstadoMensualidadPlacaOut(BaseModel):
    """Interoperabilidad HU-P06: estado en vivo de la mensualidad de una placa sin exponer dinero ni datos sensibles."""

    placa: str
    tipo_vehiculo: TipoVehiculo
    estado: EstadoMensualidadBackend
    estado_ui: EstadoMensualidadUI
    fecha_inicio_vigencia: Optional[str] = None
    fecha_fin_vigencia: Optional[str] = None
    dias_restantes: Optional[int] = None
    dias_mora: int = 0
    usuario_activo: bool
    vehiculo_activo: bool
    puede_ingresar: bool


class PagoCrearSchema(BaseModel):
    """Datos para registrar un cobro de mensualidad (1, 2 o 3 meses)."""

    placa: str
    meses_pagados: int = 1
    metodo_pago: MetodoPago = "Efectivo"
    valor_recibido_cop: Optional[int] = None
    referencia_pago: Optional[str] = None


class PagoAnularSchema(BaseModel):
    """Datos para anular el último pago no anulado de un vehículo (HU-P09, RN-P07)."""

    motivo: str


class PagoModulo3Out(BaseModel):
    """Representación completa de un pago de mensualidad y su comprobante (REC-XXXX)."""

    id: int
    consecutivo: str
    numero_comprobante: str
    userId: int
    id_propietario: int
    documentoTipo: str
    documento: str
    nombreTitular: str
    celularTitular: str
    placa: str
    placa_vehiculo: str
    tipoVehiculo: TipoVehiculo
    tipo_vehiculo: TipoVehiculo
    marcaVehiculo: str
    colorVehiculo: str
    meses: int
    meses_pagados: int
    tarifaMensualAplicada: int
    valor_unitario_cop: int
    totalPagado: int
    valor_total_cop: int
    fechaInicio: str
    fecha_inicio_vigencia: str
    fechaVencimiento: str
    fecha_fin_vigencia: str
    fechaVencimientoAnterior: Optional[str] = None
    formaPago: MetodoPago
    metodo_pago: MetodoPago
    valorRecibidoEfectivo: Optional[int] = None
    valor_recibido_cop: Optional[int] = None
    cambioDevueltoEfectivo: Optional[int] = None
    cambio_cop: Optional[int] = None
    referenciaPago: Optional[str] = None
    referencia_pago: Optional[str] = None
    fechaHoraPago: str
    fecha_registro: str
    operario: str
    operario_registro: str
    estado: EstadoPago
    motivoAnulacion: Optional[str] = None
    motivo_anulacion: Optional[str] = None
    usuarioAnulacion: Optional[str] = None
    usuario_anulacion: Optional[str] = None
    fechaHoraAnulacion: Optional[str] = None
    fecha_anulacion: Optional[str] = None
    esUltimoActivo: bool = False


class VencimientoItemOut(BaseModel):
    """Vehículo activo con mensualidad Por vencer (<= 5 días) o Vencida (HU-P08)."""

    id_propietario: int
    userId: int
    documentoTipo: str
    documento: str
    nombreTitular: str
    celularTitular: str
    placa: str
    tipoVehiculo: TipoVehiculo
    marcaVehiculo: str
    colorVehiculo: str
    fechaInicio: str
    fechaVencimiento: str
    estado: Literal["Por vencer", "Vencida"]
    diasRestantes: int
    diasMora: int


class ResumenMetodoOut(BaseModel):
    metodo: MetodoPago
    cantidad: int
    total_cop: int


class ResumenTipoOut(BaseModel):
    tipo: TipoVehiculo
    cantidad: int
    total_cop: int


class ResumenDiaOut(BaseModel):
    fecha: str
    cantidad: int
    total_cop: int


class ResumenOperarioOut(BaseModel):
    operario: str
    cantidad: int
    total_cop: int


class CajaDiaOut(BaseModel):
    """Resumen de caja del día actual (HU-P11)."""

    fecha: str
    operario_filtro: str
    total_recaudado_cop: int
    cantidad_pagos_validos: int
    cantidad_pagos_anulados: int
    total_anulado_cop: int
    por_metodo_pago: List[ResumenMetodoOut]
    por_tipo_vehiculo: List[ResumenTipoOut]
    operarios_disponibles: List[str]


class ReporteRecaudoOut(BaseModel):
    """Reporte consolidado de recaudo por período (HU-P12)."""

    fecha_inicio: str
    fecha_fin: str
    total_recaudado_cop: int
    cantidad_pagos_validos: int
    ticket_promedio_cop: int
    cantidad_pagos_anulados: int
    total_anulado_cop: int
    por_dia: List[ResumenDiaOut]
    por_tipo_vehiculo: List[ResumenTipoOut]
    por_metodo_pago: List[ResumenMetodoOut]
    por_operario: List[ResumenOperarioOut]
    pagos: List[PagoModulo3Out]


class TarifaHistorialOut(BaseModel):
    id: int
    tipo: TipoVehiculo
    valorAnterior: int
    valorNuevo: int
    fechaInicioVigencia: str
    motivo: str
    usuarioResponsable: str
    fechaRegistro: str


class TarifaVigenteItemOut(BaseModel):
    tipo_vehiculo: TipoVehiculo
    valor_mensual: int
    valor_cop: int


class TarifasModulo3Out(BaseModel):
    """Tarifas vigentes de Carro y Moto e historial de cambios (HU-P10)."""

    Carro: int
    Moto: int
    tarifas: List[TarifaVigenteItemOut]
    historial: List[TarifaHistorialOut]


class TarifaCrearSchema(BaseModel):
    """Datos para registrar un cambio de tarifa mensual (HU-P10, RN-P09)."""

    tipo_vehiculo: TipoVehiculo
    valor_cop: int
    fecha_inicio: Optional[date] = None
    motivo: str
