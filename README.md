# PARQUEATE

Sistema para el parqueadero Autos Colombia, en Medellín. Este MVP 1 cubre un solo módulo: **Gestión de Entrada y Salida de Vehículos**, con frontend en React y backend en FastAPI + PostgreSQL.

## Alcance del MVP 1

El servicio es por mensualidad: solo entran vehículos con la mensualidad vigente y no hay cobro por horas.

- Iniciar sesión con roles de administrador y operario.
- Registrar la entrada por placa: valida el usuario, la mensualidad y el doble ingreso, y asigna una celda del tipo del vehículo de forma automática o manual.
- Alertar cuando la mensualidad vence en 3 días o menos, y negar la entrada si está vencida.
- Registrar la salida y liberar la celda.
- Adjuntar novedades (rayón, golpe) a la entrada o la salida.
- Consultar la ocupación en tiempo real, los vehículos dentro y el historial con filtros.
- Anular registros con justificación (solo administrador); nunca se eliminan.

> **Nota:** El registro de usuarios, vehículos y pagos y la configuración de las celdas no hacen parte de esta iteración; corresponden a los módulos de registro de usuarios, manejo de celdas y gestión de pagos de iteraciones siguientes. Para esta iteración, esos datos se cargan con herramientas de apoyo del backend (`registrar_vehiculo.py`, `seed.sql`). Ver [backend/README.md](./backend/README.md#registrar-vehículos-y-mensualidades).

| Regla | Descripción |
| --- | --- |
| Capacidad | 80 celdas: 70 para carros y 10 para motos. |
| Tipo de celda | Las celdas de moto son solo para motos y las de carro solo para carros. |
| Vigencia | 30 días calendario contando el día del pago; vence en la fecha de pago + 29 días. |
| Doble ingreso | Un vehículo con una entrada abierta no puede volver a ingresar. |

Ejemplo: si el pago se hizo el 13/10/2026, el último día vigente es el 11/11/2026; desde el 12/11/2026 está vencido.

## Tecnologías

- React 19 y TypeScript
- Vite 8
- Tailwind CSS 4
- FastAPI, PostgreSQL y JWT en el backend

## Desarrollo

Requiere Node.js 22, pnpm 10.34.3 (declarados en `.mise.toml` y `frontend/package.json`), Python 3.12 y PostgreSQL 14.

### Puesta en marcha

1. **Backend:** instala dependencias, crea la base y el primer usuario siguiendo [backend/README.md](./backend/README.md#instalación). Luego:

   ```sh
   cd backend
   source venv/bin/activate
   python main.py               # API en http://localhost:8000 (documentación en /docs)
   ```

2. **Frontend:** consume la API en `VITE_API_URL` (por defecto `http://localhost:8000`; ver `frontend/.env.example`).

   ```sh
   cd frontend
   corepack pnpm install
   corepack pnpm dev            # http://localhost:5173
   ```

   Sin `pnpm` ni `corepack` en el PATH, con las dependencias ya instaladas funciona `./node_modules/.bin/vite`.

3. **Datos para probar:** `backend/database/datos_prueba.sql` carga 6 placas de ejemplo; para registrar otras, usa `backend/registrar_vehiculo.py`.

### Verificación

```sh
cd backend && python -m pytest                       # 30 pruebas: casos de uso y reglas
cd frontend && corepack pnpm typecheck && corepack pnpm build
```

El chequeo de tipos es separado del build: Vite transpila TypeScript, pero el build no sustituye `typecheck`.

## Organización

```text
frontend/
  src/
    api/client.ts           # Cliente de la API y manejo del token
    domain/parking.ts       # Tipos de los datos que devuelve la API
    shared/formatters.ts    # Formateo de fechas e iniciales
    App.tsx                 # Login, registro, vehículos dentro e historial
    index.css               # Estilos de la interfaz
backend/
  auth/                     # Login JWT y permisos por rol
  config/                   # Variables de entorno
  database/                 # Conexión, schema.sql, celdas, datos de prueba y plantilla de registro
  models/                   # Acceso a datos con SQL, uno por tabla
  schema/                   # Esquemas Pydantic de entrada/salida
  tests/                    # Pruebas automáticas (pytest)
  main.py                   # Endpoints de la API
  create_admin.py           # Crea administradores y operarios
  registrar_vehiculo.py     # Registra usuario, vehículo y mensualidad
  respaldo.sh               # Copia de seguridad (instalar_respaldo.sh la programa)
docs/
  estado-actual.md          # Qué permite el MVP 1, pruebas y limitaciones
  reglas-de-negocio.md      # Reglas, decisiones y trazabilidad requisito → prueba
  arquitectura.md           # Capas, paquetes, clases y modelo de datos
```

## Documentación

- [Estado actual del MVP 1](./docs/estado-actual.md)
- [Reglas de negocio y trazabilidad](./docs/reglas-de-negocio.md)
- [Arquitectura](./docs/arquitectura.md)
- [Backend: instalación, endpoints y herramientas](./backend/README.md)
