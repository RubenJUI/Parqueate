# Arquitectura del MVP 1

Aplicación web en tres capas: el navegador ejecuta el frontend en React, que consume la API REST del backend en FastAPI, que a su vez guarda los datos en PostgreSQL.

```text
Navegador (React + Vite)  ──HTTP/JSON + JWT──▶  API (FastAPI, Python)  ──SQL──▶  PostgreSQL
  frontend/                                     backend/                         parqueadero_autos_colombia
```

- El frontend no accede a la base de datos ni guarda secretos: solo conserva el token de sesión en `sessionStorage`.
- Todas las reglas de negocio se validan en el backend; el frontend las anticipa para avisar al operario, pero la API decide.
- La base de datos es la última línea de defensa: llaves foráneas, `CHECK` e índices únicos parciales impiden datos inválidos o la doble ocupación aunque falle el código.

## Paquetes del backend

| Paquete | Responsabilidad | Contenido |
| --- | --- | --- |
| `main.py` | Endpoints REST, validación de reglas y respuestas de error | 12 rutas (el login está en `auth/`) |
| `auth/` | Contraseñas con bcrypt, emisión y validación de JWT, permisos por rol | `auth.py`, `auth_routes.py` |
| `config/` | Variables de entorno: conexión, JWT, CORS, días de vigencia y alerta | `__init__.py` |
| `database/` | Conexión a PostgreSQL y scripts SQL | `database.py`, `schema.sql`, `seed.sql`, `datos_prueba.sql`, `registrar_vehiculo.sql` |
| `models/` | Acceso a datos con SQL, una clase por tabla | `TiqueteConnection`, `EspacioConnection`, `VehiculoConnection`, `PagoConnection`, `TarifaConnection`, `UsuarioConnection` |
| `schema/` | Esquemas Pydantic de entrada y salida de la API | `tiquete_schema`, `espacio_schema`, `vehiculo_schema`, `tarifa_schema`, `usuario_schema`, `auth_schema`, `tipos` |
| `tests/` | Pruebas automáticas con pytest | 30 pruebas |
| Herramientas | Precondiciones y operación | `create_admin.py`, `registrar_vehiculo.py`, `respaldo.sh`, `instalar_respaldo.sh` |

Dependencias entre paquetes: `main` usa `auth`, `models`, `schema` y `database`; `models` y `auth` usan `database` y `config`; `schema` no depende de ningún otro.

## Clases principales del backend

| Clase | Métodos | Tabla |
| --- | --- | --- |
| `TiqueteConnection` | `get_by_id`, `get_abierto_por_placa`, `list_all`, `registrar_entrada`, `registrar_salida`, `cambiar_espacio`, `anular` | `tiquete` |
| `EspacioConnection` | `get_by_id`, `list_all`, `ocupacion` | `espacio` |
| `VehiculoConnection` | `get_by_placa` | `vehiculo` + `propietario` |
| `PagoConnection` | `get_ultimo` | `pago` |
| `TarifaConnection` | `list_all` | `tarifa` |
| `UsuarioConnection` | `create`, `get_by_correo`, `get_by_id`, `update` | `usuario` |

La función `calcular_vigencia(fecha_pago, hoy)` de `models/pago_connection.py` concentra la regla RN-04 y la alerta de RF-04.

## Paquetes del frontend

| Paquete | Responsabilidad |
| --- | --- |
| `src/api/client.ts` | Llamadas a la API, token de sesión y manejo de errores |
| `src/domain/parking.ts` | Tipos de los datos que devuelve la API |
| `src/shared/formatters.ts` | Formato de fechas, iniciales y códigos de movimiento |
| `src/App.tsx` | Vistas: login, registro de entrada y salida, vehículos dentro, historial y anulación |

## Modelo de datos (7 tablas)

```text
propietario 1 ──< vehiculo 1 ──< pago
                       1
                       └──< tiquete >── 1 espacio
                              │
                              └── usuario (entrada, salida, anulación)
tarifa: valor mensual por tipo de vehículo (Carro, Moto)
```

| Tabla | Columnas principales |
| --- | --- |
| `propietario` | `id_propietario`, `documento` (único), `nombre`, `telefono`, `autoriza_datos`, `fecha_autorizacion` |
| `vehiculo` | `placa` (PK), `tipo_vehiculo` (Carro o Moto), `id_propietario` |
| `tarifa` | `tipo_vehiculo` (PK), `valor_mensual` |
| `pago` | `id_pago`, `placa`, `fecha_pago`, `monto` |
| `espacio` | `id_espacio`, `numero_espacio` (único), `tipo_permitido`, `estado` (Disponible, Ocupado, Mantenimiento) |
| `usuario` | `id_usuario`, `nombre`, `correo` (único), `contrasena_hash`, `rol` (Administrador u Operador), `estado` |
| `tiquete` | `id_tiquete`, `placa`, `id_espacio`, `id_usuario_entrada`, `id_usuario_salida`, `fecha_hora_entrada`, `fecha_hora_salida`, `novedad_entrada`, `novedad_salida`, `anulado`, `motivo_anulacion`, `id_usuario_anulacion`, `fecha_hora_anulacion` |

El modelo físico completo está en [backend/database/schema.sql](../backend/database/schema.sql).

## Flujo de una entrada

1. El operario escribe la placa; el frontend consulta `GET /api/vehiculos/{placa}` y muestra el usuario, la mensualidad y si ya está dentro.
2. Al confirmar, `POST /api/tiquetes/entrada` valida en orden: placa registrada, sin entrada abierta, mensualidad vigente y celda del tipo correcto.
3. En una sola transacción toma la celda (`FOR UPDATE SKIP LOCKED`), la marca como ocupada y crea el tiquete con la hora y el operario.
4. La respuesta incluye la celda asignada, la fecha de vencimiento y la alerta si quedan 3 días o menos; el frontend actualiza la ocupación.
