# Backend - Parqueate (Autos Colombia)

API en Python (FastAPI + PostgreSQL) del módulo **Gestión de Entrada y Salida de Vehículos**: el parqueadero presta el servicio por mensualidad, así que solo entran vehículos con la mensualidad vigente y no hay cobro por horas. Incluye autenticación JWT con roles administrador y operador.

El alcance de esta entrega es solo ese módulo. Los usuarios del parqueadero, sus vehículos, los pagos de mensualidad, las celdas y las tarifas son precondiciones: se cargan por SQL y la API solo los consulta. Sigue la estructura de [sistema-de-credito-fiado](https://github.com/Frank-ospina/sistema-de-credito-fiado/tree/main/backend): FastAPI, `psycopg2` con SQL crudo (sin ORM) y JWT.

## Estructura

- `config/`: variables de entorno (conexión a la base de datos, JWT, CORS y días de vigencia y alerta).
- `database/database.py`: conexión a PostgreSQL (`get_db` como dependencia de FastAPI).
- `database/schema.sql`: modelo físico del módulo (7 tablas), con índices que impiden la doble ocupación.
- `database/seed.sql`: las 80 celdas (C-01 a C-70 para carros y M-01 a M-10 para motos) y las tarifas mensuales ($250.000 carro, $100.000 moto).
- `database/datos_prueba.sql`: propietarios, vehículos y pagos ficticios con fechas relativas a hoy, para probar mensualidades vigentes, por vencer, vencidas y sin pago.
- `models/*_connection.py`: acceso a datos con SQL crudo.
- `schema/*_schema.py`: esquemas Pydantic de entrada y salida; `schema/tipos.py` reúne los valores permitidos por los `CHECK` de la base.
- `auth/`: hashing de contraseñas, JWT, permisos por rol y login (`POST /auth/token`).
- `main.py`: endpoints.
- `create_admin.py`: crea o actualiza un usuario del sistema (administrador u operador).

## Tablas

| Tabla | Para qué la usa el módulo |
| --- | --- |
| `propietario` | Usuario del parqueadero dueño del vehículo (RF-02) |
| `vehiculo` | Placa, tipo (Carro o Moto) y propietario |
| `pago` | Fecha del pago de la mensualidad, para validar la vigencia (RF-03) |
| `espacio` | Celdas por tipo y su estado |
| `tarifa` | Valor de la mensualidad por tipo de vehículo (RNF-08) |
| `usuario` | Administradores y operarios que inician sesión (RNF-03) |
| `tiquete` | Cada entrada y salida, con celda, operarios, novedades y anulación |

## Reglas de negocio implementadas

- **Entrada** (`POST /api/tiquetes/entrada`), en este orden:
  - La placa debe estar registrada y asociada a un usuario (RF-02).
  - No puede tener una entrada abierta (RF-07, RN-03). El rechazo indica la celda donde está.
  - La mensualidad debe estar vigente (RF-03, RN-04, RN-05). Si está vencida, se niega la entrada con la fecha de vencimiento.
  - Se asigna la primera celda libre del tipo del vehículo (RF-05, RN-01), o la que elija el operario con `id_espacio`.
  - Si quedan `DIAS_ALERTA` días o menos, la respuesta trae `alerta`, por ejemplo "Su mensualidad vence en 3 días" (RF-04).
  - Si no hay celdas libres, responde `409` y deja un aviso en el log del servidor (RF-06).
- **Vigencia:** se toma el pago más reciente de la placa. Vence en `fecha_pago + (DIAS_VIGENCIA - 1)`: con 30 días, un pago del 13/10/2026 vence el 11/11/2026.
- **Salida** (`POST /api/tiquetes/salida`): requiere una entrada abierta; si no hay, responde "El vehículo no tiene entrada registrada" (RF-09). Registra la hora de salida y el operario y libera la celda (RF-08).
- **Novedades** (RF-13): la entrada y la salida aceptan un campo `novedad` opcional, por ejemplo "rayón en la puerta".
- **Cambio manual de celda** (`PUT /api/tiquetes/{id}/espacio`): solo a una celda libre del mismo tipo.
- **Sin borrados** (RNF-05): la API no tiene endpoints DELETE. Un registro se anula con un motivo (`POST /api/tiquetes/{id}/anular`, solo administrador) y, si el vehículo estaba dentro, se libera la celda.
- **Concurrencia** (RNF-04): `FOR UPDATE SKIP LOCKED` y los índices únicos parciales evitan que dos terminales asignen la misma celda o abran dos entradas para la misma placa.
- **Configuración** (RNF-08): la cantidad de celdas está en la tabla `espacio`, el valor de la mensualidad en `tarifa` y los días de vigencia y de alerta en las variables `DIAS_VIGENCIA` y `DIAS_ALERTA`.
- Las placas se normalizan a mayúsculas, sin espacios ni guiones (`abc-123` → `ABC123`).
- Las violaciones de restricciones de la base (duplicados, llaves foráneas) responden `409`.

## Instalación

1. Crea y activa un entorno virtual (Python 3.12):

   ```sh
   python3.12 -m venv venv
   source venv/bin/activate
   ```

2. Instala las dependencias:

   ```sh
   pip install -r requirements.txt
   ```

3. Copia `.env.example` a `.env` y ajusta los valores: la contraseña de `parqueate` en `PGPASSWORD` y una `SECRET_KEY` propia:

   ```sh
   cp .env.example .env
   python -c 'import secrets; print(secrets.token_urlsafe(32))'
   ```

4. Crea el usuario de base de datos `parqueate`, la base, el esquema, las celdas y, si quieres, los datos de prueba:

   ```sh
   psql -d postgres -c "CREATE ROLE parqueate LOGIN PASSWORD 'tu-contrasena'"
   createdb -O parqueate parqueadero_autos_colombia
   psql -h localhost -U parqueate -d parqueadero_autos_colombia -f database/schema.sql -f database/seed.sql -f database/datos_prueba.sql
   ```

5. Crea el administrador y, si lo necesitas, un operario:

   ```sh
   python create_admin.py admin@autoscolombia.co admin123 "Administrador"
   python create_admin.py operario@autoscolombia.co operario123 "Operario" Operador
   ```

## Uso

```sh
python main.py
# o
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

Documentación interactiva en `http://127.0.0.1:8000/docs`. Para probar desde ahí, usa **Authorize** con el correo como `username`.

## Endpoints

| Método | Ruta | Descripción | Acceso |
| --- | --- | --- | --- |
| POST | `/auth/token` | Login (`username` = correo, `password` como form-data), retorna JWT | Público |
| GET | `/api/usuarios/me` | Perfil del usuario autenticado | Usuario activo |
| GET | `/api/vehiculos/{placa}` | Consulta por placa: usuario, mensualidad y celda si ya está dentro | Usuario activo |
| GET | `/api/espacios?estado=&tipo_permitido=` | Celdas, por ejemplo las libres de un tipo para elegir a mano | Usuario activo |
| GET | `/api/ocupacion` | Ocupación por tipo, por ejemplo Carro 52/70 (RF-10) | Usuario activo |
| GET | `/api/tarifas` | Valor de la mensualidad por tipo (RNF-08) | Usuario activo |
| GET | `/api/tiquetes?placa=&id_propietario=&id_espacio=&desde=&hasta=&abiertos=` | Historial (RF-11); `abiertos=true` lista los vehículos dentro (RF-12) | Usuario activo |
| GET | `/api/tiquetes/{id}` | Obtiene un registro | Usuario activo |
| POST | `/api/tiquetes/entrada` | Registra una entrada (`placa`, `novedad` e `id_espacio` opcionales) | Usuario activo |
| POST | `/api/tiquetes/salida` | Registra una salida (`placa`, `novedad` opcional) | Usuario activo |
| PUT | `/api/tiquetes/{id}/espacio` | Cambio manual de celda | Usuario activo |
| POST | `/api/tiquetes/{id}/anular` | Anula un registro con motivo | Administrador |

Las rutas protegidas requieren el header `Authorization: Bearer <token>` obtenido en `/auth/token`.
