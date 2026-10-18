# Parqueate

Sistema para gestionar la entrada y salida de vehículos del Parqueadero **Autos Colombia** (Medellín), que presta su servicio por mensualidad.

## Alcance de esta iteración

Esta iteración cubre la **gestión de entrada y salida de vehículos**:

- Registro de la entrada de un vehículo por placa, con asignación automática de celda.
- Validación de usuario registrado, mensualidad vigente y doble ingreso.
- Registro de la salida y liberación de la celda.
- Consulta de la ocupación en tiempo real, del historial y de los vehículos dentro del parqueadero.
- Registro de novedades durante la entrada o la salida.

Quedan **fuera de esta iteración** la gestión de pagos, el registro de usuarios y la administración de celdas.

## Reglas principales

| Regla | Descripción |
|---|---|
| Capacidad | 80 celdas: 70 para carros y 10 para motos. |
| Tipo de celda | Las celdas de moto son solo para motos y las de carro solo para carros. |
| Vigencia | La mensualidad dura 30 días calendario contados desde el día del pago. La fecha de vencimiento es la fecha de pago + 29 días. |
| Cupo garantizado | Cada usuario con mensualidad vigente tiene su cupo asegurado. |
| Doble ingreso | Un vehículo con una entrada abierta no puede volver a entrar. |

**Ejemplo de vigencia:** si el pago se hizo el 13/10/2026, la mensualidad vence el 11/11/2026. El 12/11/2026 ya está vencida y el sistema niega la entrada.

## Tarifas de referencia

| Tipo | Mensualidad |
|---|---|
| Carro | $250.000 COP |
| Moto | $100.000 COP |

## Tecnologías

<!-- Completar con el stack del proyecto (lenguaje, framework, base de datos). -->

## Instalación y ejecución

<!-- Completar con los pasos para clonar, instalar dependencias y ejecutar el proyecto. -->

```bash
git clone <url-del-repositorio>
cd micupo
```

## Documentación

El documento de requisitos y casos de uso del módulo está en `Requisitos_Entrada_Salida_Autos_Colombia.docx`.

## Equipo

<!-- Completar con los integrantes del equipo. -->
