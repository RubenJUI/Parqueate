# PARQUEATE

Prototipo frontend para apoyar la operación del parqueadero Autos Colombia, en Medellín. La aplicación presenta flujos de entradas y salidas, ocupación, historial, clientes, mensualidades y configuración. Todavía no tiene API, autenticación real ni persistencia.

## Alcance funcional de referencia

El alcance prioritario descrito en el repositorio es gestionar entrada y salida de vehículos:

- Registrar entradas por placa y asignar una celda disponible del tipo de vehículo.
- Validar vehículo registrado, mensualidad vigente y ausencia de otro ingreso abierto.
- Registrar salidas y liberar la celda.
- Consultar vehículos dentro, ocupación e historial, y registrar novedades.

Quedan fuera de esa iteración la gestión de pagos, el registro de usuarios y la administración de celdas, aunque existan pantallas de muestra para algunos de esos flujos.

## Reglas principales de referencia

| Regla | Descripción |
| --- | --- |
| Capacidad | 80 espacios: 70 para carros y 10 para motos. |
| Tipo de celda | Las celdas de moto son solo para motos y las de carro solo para carros. |
| Vigencia | 30 días calendario contando el día del pago; vence en la fecha de pago + 29 días. |
| Cupo | El requisito de referencia indica cupo garantizado para cada usuario con mensualidad vigente. |
| Doble ingreso | Un vehículo con una entrada abierta no puede volver a ingresar. |

Ejemplo: si el pago se hizo el 13/10/2026, el último día vigente es el 11/11/2026; desde el 12/11/2026 está vencido.

Tarifas de referencia: carro $250.000 COP y moto $100.000 COP. Las reglas de producto, los comportamientos de la maqueta y las decisiones pendientes están detallados en [docs/reglas-de-negocio.md](./docs/reglas-de-negocio.md).

## Tecnologías

- React 19 y TypeScript
- Vite 8
- Tailwind CSS 4

Los datos actuales son fixtures locales en memoria: no representan una base de datos ni información real de clientes.

## Desarrollo

Requiere Node.js 22 y pnpm 10.34.3. Las versiones están declaradas en `.mise.toml` y `frontend/package.json`.

### Frontend

```sh
cd frontend
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm build
```

El chequeo de tipos es separado del build: Vite transpila TypeScript, pero el build no sustituye `typecheck`.

### Backend

API en FastAPI + PostgreSQL. Instalación, base de datos y endpoints en [backend/README.md](./backend/README.md).

```sh
cd backend
source venv/bin/activate
python main.py
```

## Organización

```text
frontend/
  src/
    data/mockParking.ts     # Datos temporales de demostración
    domain/parking.ts       # Tipos de los conceptos del parqueadero
    shared/formatters.ts    # Formateo de moneda y fechas
    App.tsx                 # Composición de vistas y estado del prototipo
    index.css               # Estilos de la interfaz
backend/
  auth/                     # Login JWT y permisos por rol
  config/                   # Variables de entorno
  database/                 # Conexión y schema.sql (modelo físico)
  models/                   # Acceso a datos con SQL, uno por tabla
  schema/                   # Esquemas Pydantic de entrada/salida
  main.py                   # Endpoints de la API
docs/
  estado-actual.md          # Alcance y limitaciones del prototipo
  reglas-de-negocio.md      # Reglas conocidas y decisiones por confirmar
  preparacion-backend.md    # Propuesta de límites, contratos y fases
```

## Documentación

- [Estado actual](./docs/estado-actual.md)
- [Reglas de negocio](./docs/reglas-de-negocio.md)
- [Preparación del backend](./docs/preparacion-backend.md)
