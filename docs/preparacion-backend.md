# Preparación para el backend

## Límite de responsabilidad recomendado

Conservar React como cliente de presentación y mover la autoridad sobre identidad, permisos, persistencia, asignación de celdas, vigencias y auditoría al servidor. La estructura actual es el primer paso de orden: los tipos viven en `src/domain/parking.ts`, los fixtures en `src/data/mockParking.ts` y el formateo en `src/shared/formatters.ts`. `App.tsx` aún concentra navegación, estado y vistas; conviene dividirlo por módulos al empezar a conectar casos de uso, no introducir capas vacías antes de elegir el contrato.

El frontend no debe conectarse directamente a la base de datos ni incluir secretos. Una capa API sustituirá los fixtures; componentes y reglas de interfaz dependerán de funciones de aplicación tipadas, no de detalles de la base de datos.

## Entidades candidatas

Son un vocabulario inicial para conversar, no un esquema aprobado:

- **Sede / Parqueadero:** capacidad, zona horaria y configuración.
- **Usuario interno:** identidad, estado y rol/permisos.
- **Cliente:** titular y datos de contacto, con consentimiento según política definida.
- **Vehículo:** placa normalizada, tipo y relación con cliente.
- **Celda:** sede, código, tipo y disponibilidad/configuración.
- **Movimiento:** vehículo, celda, entrada, salida, responsables, observaciones y estado. Mantener historial auditable.
- **Pago / vigencia:** monto, moneda, referencia externa opcional, fechas y estado separados; el modelo actual mezcla pago y mensualidad.
- **Auditoría:** actor, acción, entidad, fecha y motivo para operaciones sensibles.

Definir identificadores estables y fechas en formato ISO 8601 con zona horaria o UTC. No persistir fechas ya localizadas como `"Hoy, 07:42"`; ese texto debe producirse en la interfaz.

## Contratos y casos de uso a definir

Antes de generar endpoints, acordar para cada operación: permisos, entrada validada, respuesta, errores de dominio, idempotencia y efectos auditables. Casos prioritarios:

1. Autenticar y obtener sesión/actor y permisos efectivos.
2. Buscar vehículo por placa y consultar elegibilidad de entrada.
3. Registrar entrada con selección/asignación de celda atómica.
4. Registrar salida y liberar la celda en la misma transacción lógica.
5. Consultar ocupación actual e historial filtrado/paginado.
6. Gestionar titulares, vehículos y celdas con validación de duplicados.
7. Registrar o verificar pagos y calcular vigencias según reglas aprobadas.
8. Anular/corregir con autorización, motivo obligatorio y pista de auditoría.
9. Consultar y actualizar configuración con control de permisos.

Los endpoints concretos, formato de errores y mecanismo de autenticación quedan pendientes de escoger con el stack y los requisitos de despliegue.

## Secuencia sugerida

1. **Acordar producto:** responder decisiones de [reglas de negocio](./reglas-de-negocio.md), roles, sedes y entorno de operación.
2. **Especificar contratos:** definir OpenAPI o contrato equivalente, errores esperados, límites y criterios de aceptación.
3. **Crear backend vertical:** empezar por autenticación/autorización y movimiento de entrada/salida con transacciones y pruebas de concurrencia.
4. **Conectar frontend:** crear cliente API, manejo explícito de carga/error, invalidación/actualización de consultas y retirar un fixture por módulo.
5. **Endurecer y desplegar:** auditoría, copias de seguridad, observabilidad, privacidad, pruebas de seguridad y recuperación ante fallos.

## Requisitos mínimos de calidad

- El servidor valida permisos y reglas aunque el cliente las oculte.
- Placas/documentos y entradas externas se normalizan y validan en servidor; unicidad respaldada por la persistencia.
- La asignación de celda y el cambio de estado del movimiento evitan doble ocupación bajo concurrencia.
- Errores de negocio y de infraestructura son explícitos; no se simulan respuestas exitosas ante fallos.
- Pruebas unitarias de reglas y pruebas de integración de transacciones, permisos, duplicados y anulaciones.
- Protección de datos personales, retención, acceso mínimo y secretos fuera del repositorio.
