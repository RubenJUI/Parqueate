# Backend - Parqueate (Autos Colombia)

API en Python (FastAPI + PostgreSQL) con autenticación JWT, CRUD de propietarios, vehículos, espacios, tarifas y usuarios, y el registro de entradas, salidas y pagos. Sigue la estructura de [sistema-de-credito-fiado](https://github.com/Frank-ospina/sistema-de-credito-fiado/tree/main/backend): FastAPI, `psycopg2` con SQL crudo (sin ORM) y JWT.

## Estructura

- `config/`: variables de entorno (conexión a la base de datos, JWT y CORS).
- `database/database.py`: conexión a PostgreSQL (`get_db` como dependencia de FastAPI).
- `database/schema.sql`: modelo físico (sección 5.3) más índices que impiden la doble ocupación.
- `models/*_connection.py`: acceso a datos (SQL crudo), uno por tabla.
- `schema/*_schema.py`: esquemas Pydantic de entrada/salida, uno por tabla. `schema/tipos.py` reúne los valores permitidos por los `CHECK` de la base.
- `auth/auth.py`: hashing de contraseñas, JWT y dependencias de autorización (`get_current_active_user`, `get_current_admin_user`).
- `auth/auth_routes.py`: login (`POST /auth/token`).
- `main.py`: endpoints.
- `create_admin.py`: crea o resetea el administrador inicial.

## Reglas de negocio implementadas

- **Entrada** (`POST /api/tiquetes/entrada`): la placa debe estar registrada (RF-02) y no tener un tiquete abierto (RN-03). Se toma la tarifa activa más reciente del tipo de vehículo y se ocupa el primer espacio `Disponible` de ese tipo (los de tipo `Todos` se usan al final), todo en una transacción. `FOR UPDATE SKIP LOCKED` y los índices únicos parciales evitan que dos terminales ocupen el mismo espacio o abran dos tiquetes para la misma placa.
- **Salida** (`POST /api/tiquetes/salida`): requiere un ingreso activo (RF-09). Registra la hora de salida y el operador, calcula `valor_total` y libera el espacio en la misma transacción.
- **Cálculo del valor:** toda fracción de hora se cobra como hora completa (mínimo una). Los días completos de 24 h se cobran a `valor_dia` y las horas restantes a `valor_hora`, sin pasar del valor de un día. *Regla provisional, por confirmar.*
- **Pago** (`POST /api/pagos`): solo para tiquetes con salida y aún pendientes. El monto es el `valor_total` del tiquete y el tiquete queda `Pagado`.
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

3. Copia `.env.example` a `.env` y ajusta los valores. Con PostgreSQL de Homebrew, `PGUSER` es tu usuario de macOS y no lleva contraseña. Genera una `SECRET_KEY` propia:

   ```sh
   cp .env.example .env
   python -c 'import secrets; print(secrets.token_urlsafe(32))'
   ```

4. Crea la base de datos y aplica el esquema:

   ```sh
   createdb parqueadero_autos_colombia
   psql -d parqueadero_autos_colombia -f database/schema.sql
   ```

5. Crea el administrador inicial:

   ```sh
   python create_admin.py admin@autoscolombia.co admin123 "Administrador"
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
| GET/POST/PUT/DELETE | `/api/usuarios[/{id}]` | CRUD de usuarios | Administrador |
| GET/POST/PUT/DELETE | `/api/propietarios[/{id}]` | CRUD de propietarios | Usuario activo |
| GET | `/api/vehiculos?id_propietario=` | Lista vehículos, opcionalmente por propietario | Usuario activo |
| GET/POST/PUT/DELETE | `/api/vehiculos[/{placa}]` | CRUD de vehículos | Usuario activo |
| GET | `/api/espacios?estado=&tipo_permitido=` | Lista espacios con filtros | Usuario activo |
| POST/PUT/DELETE | `/api/espacios[/{id}]` | Administración de espacios | Administrador |
| GET | `/api/tarifas?tipo_vehiculo=` | Lista tarifas | Usuario activo |
| POST/PUT/DELETE | `/api/tarifas[/{id}]` | Administración de tarifas | Administrador |
| GET | `/api/tiquetes?placa=&abiertos=` | Historial; `abiertos=true` lista los vehículos dentro | Usuario activo |
| GET | `/api/tiquetes/{id}` | Obtiene un tiquete | Usuario activo |
| POST | `/api/tiquetes/entrada` | Registra la entrada de una placa | Usuario activo |
| POST | `/api/tiquetes/salida` | Registra la salida de una placa | Usuario activo |
| GET | `/api/pagos?id_tiquete=` | Lista pagos | Usuario activo |
| GET/POST | `/api/pagos[/{id}]` | Consulta o registra el pago de un tiquete | Usuario activo |

Las rutas protegidas requieren el header `Authorization: Bearer <token>` obtenido en `/auth/token`.
