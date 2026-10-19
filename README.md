# PARQUEATE

Interfaz de operación para un parqueadero: control de entradas y salidas, ocupación de celdas, clientes, mensualidades y configuración. Actualmente es un prototipo frontend; no tiene API, autenticación real ni persistencia.

## Alcance funcional de referencia

El README preexistente del repositorio remoto define como alcance prioritario la entrada y salida de vehículos: validación por placa, mensualidad y doble ingreso; asignación de celda; liberación al salir; consulta de ocupación e historial y captura de novedades. Indica una capacidad de 70 celdas para carros y 10 para motos, y cupo garantizado para usuarios con mensualidad vigente. Deja fuera de esa iteración los pagos, el alta de usuarios y la administración de celdas. La interfaz puede mostrar otras pantallas que todavía son solo prototipo.

Las reglas y las decisiones aún por confirmar están en [docs/reglas-de-negocio.md](./docs/reglas-de-negocio.md).

## Desarrollo

Requiere Node.js 22 y pnpm 10.34.3. Las versiones están declaradas en `.mise.toml` y `package.json`.

```sh
corepack pnpm install
corepack pnpm dev
corepack pnpm typecheck
corepack pnpm build
```

`corepack pnpm typecheck` valida TypeScript por separado: Vite transpila TypeScript, pero el build no sustituye esta comprobación.

## Organización

```text
src/
  data/
    mockParking.ts       # Datos temporales de demostración
  domain/
    parking.ts           # Tipos de los conceptos del parqueadero
  shared/
    formatters.ts        # Formateo de moneda y fechas
  App.tsx                # Composición de vistas y estado de prototipo
  index.css              # Estilos globales y de la interfaz
docs/
  estado-actual.md       # Alcance y limitaciones del prototipo
  reglas-de-negocio.md   # Reglas visibles y decisiones por confirmar
  preparacion-backend.md # Propuesta de límites, contratos y fases
```

## Documentación

- [Estado actual](./docs/estado-actual.md)
- [Reglas de negocio](./docs/reglas-de-negocio.md)
- [Preparación del backend](./docs/preparacion-backend.md)

## Nota para desarrollo

Los datos de `src/data/mockParking.ts` son fixtures modificables en memoria, no una base inicial para producción. No guardar credenciales, datos reales de clientes ni secretos en el frontend.
