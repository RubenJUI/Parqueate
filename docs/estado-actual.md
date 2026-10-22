# Estado actual del producto

## Qué existe

La aplicación es un prototipo frontend de una estación de parqueadero. Está compuesta por:

- Acceso visual por perfiles recordados o identificación manual.
- Operaciones: registro de entrada/salida, consulta de vehículos dentro e historial.
- Usuarios y celdas: matriz de espacios y tabla de clientes/vehículos.
- Pagos: lista de mensualidades y formulario de registro.
- Configuración: capacidad, tarifas, vigencia, alertas y usuarios internos.
- Roles visuales de operario y administrador.

## Qué no existe todavía

- Servidor, API, base de datos o sincronización entre terminales.
- Inicio de sesión: cualquier PIN no vacío permite continuar; el perfil y el rol se pueden simular en el cliente.
- Persistencia: cambios de vehículos, pagos, movimientos y configuración se pierden al recargar.
- Autorización real: las restricciones de rol solo ocultan o bloquean controles visuales.
- Integración de pagos, recibos, notificaciones, carga de archivos o auditoría en servidor.
- Validación completa de datos, errores de red, estados de carga o concurrencia entre operarios.

## Datos de demostración y comportamiento simulado

`frontend/src/data/mockParking.ts` contiene los vehículos, movimientos, pagos y parámetros ficticios. `frontend/src/App.tsx` usa ese estado local para simular operaciones. Algunas cifras y fechas de la interfaz son fijas y no derivan de una fuente de verdad; no deben reutilizarse como cálculos de producción.

El modelo actual mezcla información persistida y valores de presentación. Por ejemplo, `Vehicle` incluye datos del titular, estado de mensualidad y estado de ocupación; `Movement` usa fechas ya formateadas para mostrar en pantalla. Antes de conectarlo a una API se deben separar los modelos de transporte del estado calculado para la UI, y acordar identificadores, fechas ISO, relaciones y estados canónicos.

## Principios para el siguiente trabajo

1. Mantener fixtures explícitamente separados de producción.
2. Mover las reglas de negocio a la capa de dominio/servidor; el frontend puede anticipar validaciones, pero el servidor decide.
3. No elegir framework de backend, base de datos ni proveedor de identidad hasta acordar necesidades operativas y restricciones.
4. Convertir reglas y flujos confirmados en pruebas antes de sustituir los datos simulados.
