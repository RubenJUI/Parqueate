# Estado actual: MVP 1

## Alcance

El MVP 1 corresponde a la **Iteración 1: Gestión de la entrada y salida de vehículos** del parqueadero Autos Colombia (Medellín), que presta el servicio por mensualidad. Frontend (React), backend (FastAPI) y base de datos (PostgreSQL) están integrados y funcionando.

> **Nota:** El registro de usuarios, vehículos y pagos y la configuración de las celdas no hacen parte de esta iteración; corresponden a los módulos de registro de usuarios, manejo de celdas y gestión de pagos de iteraciones siguientes. Para esta iteración, esos datos se cargan con herramientas de apoyo del backend (`backend/registrar_vehiculo.py`, `backend/database/seed.sql`).

## Qué permite hacer

**Desde la aplicación web (operario y administrador):**

- Iniciar sesión con correo y contraseña; el rol lo define el servidor.
- Registrar la entrada de un vehículo por placa:
  - valida que la placa esté registrada, que la mensualidad esté vigente y que el vehículo no esté dentro;
  - avisa si la mensualidad vence en 3 días o menos;
  - asigna la primera celda libre del tipo del vehículo, o la que elija el operario;
  - guarda la fecha, la hora y el operario.
- Registrar la salida: cierra el registro y libera la celda.
- Adjuntar novedades (rayón, golpe) a la entrada o la salida.
- Consultar la ocupación en tiempo real, con alerta cuando un tipo se queda sin celdas libres.
- Consultar los vehículos dentro y el historial con filtros por placa, usuario, celda y fechas.
- Anular registros con justificación (solo administrador); los registros nunca se eliminan.

**Desde la terminal (precondiciones del módulo):**

| Herramienta | Para qué |
| --- | --- |
| `backend/create_admin.py` | Crear administradores y operarios del sistema |
| `backend/registrar_vehiculo.py` | Registrar un usuario del parqueadero, su vehículo y su pago, o renovar la mensualidad; valida el cupo garantizado y la autorización de datos |
| `backend/database/registrar_vehiculo.sql` | Lo mismo como plantilla SQL para DBeaver |
| `backend/respaldo.sh` e `instalar_respaldo.sh` | Copia de seguridad de la base y su programación diaria |

## Pruebas

`backend/tests/` tiene 30 pruebas automáticas que se ejecutan contra una base de pruebas aparte (ver [backend/README.md](../backend/README.md#pruebas)):

- los 7 casos de uso del documento de requerimientos;
- los ejemplos de vigencia del documento, incluido el caso de febrero;
- las reglas RN-01 y RF-04 a RF-13, autenticación, anulación y ausencia de borrados;
- la herramienta de registro: cupo garantizado, Habeas Data, renovaciones y validaciones.

Resultado al cierre del MVP 1: **30 de 30 pruebas aprobadas**. La relación entre cada requisito y su prueba está en [reglas-de-negocio.md](./reglas-de-negocio.md#trazabilidad).

## Limitaciones conocidas

- No hay pantallas para registrar usuarios, vehículos, pagos ni administrar celdas: se cargan con las herramientas de la terminal (iteraciones siguientes).
- La alerta de RF-06 se muestra en pantalla a todas las sesiones abiertas, pero no envía correos ni notificaciones.
- El cambio de celda de un vehículo que ya está dentro existe en la API (`PUT /api/tiquetes/{id}/espacio`), pero no tiene botón en la interfaz; en pantalla la celda se elige al registrar la entrada.
- RNF-01 (respuesta < 3 s) no se ha medido formalmente; en local las respuestas son inmediatas.
- RNF-06 (disponibilidad del 99 %) depende del despliegue; hoy el sistema corre en local.
- RNF-09: probado en Chrome; falta verificar Edge y Firefox.
- La plantilla SQL de registro no valida el cupo garantizado; el script sí.
