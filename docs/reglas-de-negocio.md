# Reglas de negocio: inventario y decisiones pendientes

Este documento reúne reglas de producto ya descritas en el README original del repositorio remoto y comportamientos que solo aparecen en la interfaz. Los códigos RN/RF que aparecen en la interfaz son referencias del prototipo, no una especificación formal aprobada.

## Reglas de producto descritas en el repositorio

- El parqueadero Autos Colombia, en Medellín, presta el servicio por mensualidad.
- La iteración de entrada/salida cubre el registro de entradas por placa, asignación automática de celda, validaciones de usuario y mensualidad, bloqueo de doble ingreso, salida/liberación de celda, consulta de ocupación e historial y novedades.
- La capacidad de referencia es de 80 espacios: 70 para carros y 10 para motos. El tipo de celda debe coincidir con el tipo de vehículo.
- La mensualidad cubre 30 días calendario incluyendo el día del pago. La fecha de vencimiento es la fecha de pago más 29 días. Por ejemplo, pago el 13/10/2026: último día vigente 11/11/2026; desde el 12/11/2026 está vencida.
- El requisito original indica cupo garantizado para cada usuario con mensualidad vigente. Hay que aclarar cómo se concilia esto con una asignación de celdas físicas cuando la capacidad está ocupada.
- Tarifas de referencia: carro $250.000 COP y moto $100.000 COP.
- El README original deja fuera del alcance de esa iteración la gestión de pagos, el registro de usuarios y la administración de celdas. La interfaz actual muestra pantallas de esos temas, pero su presencia visual no los incorpora automáticamente a los requisitos aprobados.

## Reglas expresadas actualmente por la interfaz

| Referencia | Comportamiento mostrado | Estado |
| --- | --- | --- |
| RF-02 | Una placa no registrada no puede completar el movimiento. | Reflejado en validación del cliente; falta definir el proceso para dar de alta el vehículo. |
| RN-03 | No se permite una segunda entrada si el vehículo ya está dentro. | Validación del cliente; debe ser atómica en el servidor para evitar carreras. |
| RN-05 | Una mensualidad vencida bloquea el ingreso. | La interfaz compara un estado fixture; falta precisar el cálculo y posibles excepciones. |
| RF-09 | No se permite una salida sin un ingreso activo. | Validación del cliente; falta definir el tratamiento de incidencias y correcciones. |
| RNF-05 | Anular un movimiento requiere una justificación de al menos 8 caracteres y conserva el registro. | El prototipo cambia el estado local; faltan permisos, auditoría y reglas de inmutabilidad. |
| RNF-08 | La configuración se presenta como exclusiva de administración. | Restricción visual; debe verificarse y aplicarse en servidor. |
| — | Al ingresar se selecciona una celda libre del tipo del vehículo; al salir se libera. | La asignación y disponibilidad actuales son locales y contienen ocupación simulada. |

## Decisiones que hay que confirmar antes de implementar las reglas

- **Mensualidades:** ¿una fecha final incluye todo ese día? ¿El vencimiento depende de días calendario o de hora/minuto? ¿Renovar antes del vencimiento acumula vigencia o reinicia desde el pago? ¿Se permiten ingresos con vencimiento el día actual?
- **Tarifas y pagos:** ¿el registro en pantalla significa pago confirmado o solo anotación manual? ¿Qué medios, comprobantes, reversos y conciliación se requieren? El sistema no debe afirmar pagos exitosos sin verificación.
- **Celdas:** ¿se asigna automáticamente, manualmente o ambas? ¿Puede haber celdas bloqueadas, tipos distintos o niveles? ¿Qué pasa si no hay espacio o la asignación falla concurrentemente?
- **Identidad:** ¿quién es el titular del vehículo y puede tener varios vehículos? ¿Qué identificadores son únicos? ¿Qué datos son obligatorios y cuánto tiempo se conservan?
- **Movimientos:** ¿la salida siempre cierra el ingreso activo más reciente? ¿Se permiten correcciones/anulaciones, por quién y con qué campos de auditoría? ¿Qué información es obligatoria al registrar una novedad?
- **Operación:** ¿hay turnos, varias sedes, zonas horarias o varias terminales? ¿Qué pasa sin conexión y cómo se resuelven conflictos?
- **Permisos:** definir matriz de acciones por rol (consulta/creación/edición/anulación/configuración), no solo por pantalla.

No implementar decisiones abiertas como si fueran requisitos confirmados. Acordarlas, registrar su responsable y cubrirlas con casos de aceptación.
