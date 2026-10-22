# Reglas de negocio y trazabilidad

Reglas del módulo **Gestión de Entrada y Salida de Vehículos** (requisito versión 1.0 del 18/10/2026) y cómo se implementan.

## Datos del negocio

| Dato | Valor | Dónde se configura |
| --- | --- | --- |
| Capacidad | 80 celdas: 70 para carros (C-01 a C-70) y 10 para motos (M-01 a M-10) | Tabla `espacio` (`database/seed.sql`) |
| Tarifa mensual | $250.000 COP carro, $100.000 COP moto | Tabla `tarifa` |
| Vigencia | 30 días calendario contando el día del pago; fines de semana y festivos cuentan | `DIAS_VIGENCIA` en `backend/.env` |
| Alerta de vencimiento | 3 días calendario o menos | `DIAS_ALERTA` en `backend/.env` |
| Cobro por horas | No existe: solo entran usuarios con mensualidad vigente | — |

Cambiar estos valores no requiere modificar el código (RNF-08).

## Precondiciones

El requerimiento indica qué debe existir antes de usar el módulo, pero no cómo se crea. Así se cumple cada precondición en el MVP 1:

| Precondición | Cómo se cumple |
| --- | --- |
| El operario ha iniciado sesión | `backend/create_admin.py` crea las cuentas; el login está en la aplicación |
| El usuario y su vehículo (placa y tipo) están registrados | `backend/registrar_vehiculo.py`, con el nombre, documento y teléfono del usuario y la placa y el tipo del vehículo |
| El pago de la mensualidad está registrado con su fecha | El mismo script, con la fecha del pago; volver a ejecutarlo registra la renovación |
| Las celdas están configuradas por tipo | `backend/database/seed.sql` carga 70 celdas de carro y 10 de moto |
| Cupo garantizado | `registrar_vehiculo.py` rechaza el pago si las mensualidades vigentes superarían las celdas del tipo |

> **Nota:** El registro de usuarios, vehículos y pagos y la configuración de las celdas no hacen parte de esta iteración; corresponden a los módulos de registro de usuarios, manejo de celdas y gestión de pagos de iteraciones siguientes. Para esta iteración, esos datos se cargan con herramientas de apoyo del backend (`registrar_vehiculo.py`, `seed.sql`).

## Decisiones tomadas al implementar

- **Vigencia:** se toma el pago más reciente de la placa con fecha hasta hoy. Vence en `fecha_pago + 29 días` y ese último día la entrada se permite con la alerta "Su mensualidad vence hoy". Un pago con fecha futura no da vigencia.
- **Renovación:** cada pago inicia una vigencia nueva de 30 días desde su fecha; no se acumula con el anterior.
- **Asignación de celda:** automática (la primera libre del tipo, en orden de número) o manual, eligiendo una celda libre del mismo tipo.
- **Cupo garantizado:** se controla al registrar el pago. `registrar_vehiculo.py` rechaza un pago si, algún día de su vigencia, habría más mensualidades vigentes de ese tipo que celdas de ese tipo.
- **Titular:** un propietario puede tener varios vehículos; la placa es única y pertenece a un solo propietario. El documento es único.
- **Anulación:** solo el administrador, con un motivo de al menos 8 caracteres en pantalla. Se guarda quién anuló y cuándo; si el vehículo estaba dentro, se libera la celda.
- **Habeas Data (RNF-10):** un propietario solo se registra si autorizó el tratamiento de sus datos; se guarda la autorización y su fecha.

## Trazabilidad

Requisito, dónde se implementa y prueba automática que lo verifica (`backend/tests/`).

### Casos de uso

| Caso | Resultado esperado | Prueba | Resultado |
| --- | --- | --- | --- |
| 1 | Entrada el día 30 con la alerta "su mensualidad vence hoy" y ocupación actualizada | `test_casos_de_uso.py::test_cu1_entrada_el_ultimo_dia_de_vigencia` | Aprobada |
| 2 | Entrada negada con "Mensualidad vencida el …" | `test_cu2_mensualidad_vencida` | Aprobada |
| 3 | Placa no registrada: "no está asociado a ningún usuario" | `test_cu3_placa_no_registrada` | Aprobada |
| 4 | Doble ingreso rechazado indicando la celda | `test_cu4_doble_ingreso_indica_la_celda` | Aprobada |
| 5 | Moto ocupa la última celda libre: de 9/10 a 10/10 | `test_cu5_ultima_celda_de_moto` | Aprobada |
| 6 | Salida libera la celda y actualiza la ocupación | `test_cu6_salida_libera_la_celda` | Aprobada |
| 7 | Salida sin entrada: "El vehículo no tiene entrada registrada" | `test_cu7_salida_sin_entrada` | Aprobada |

Las fechas del documento se reproducen relativas al día de la prueba: "pago del 13/10/2026 y entrada el 11/11/2026" es un pago de hace 29 días.

### Requerimientos y reglas

| Requisito | Implementación | Prueba |
| --- | --- | --- |
| RF-01 Registrar entrada | `POST /api/tiquetes/entrada` | `test_cu1_…` |
| RF-02 Validar usuario y vehículo | Consulta de la placa antes de registrar | `test_cu3_…` |
| RF-03 Validar mensualidad | `calcular_vigencia` y validación de la entrada | `test_vigencia.py`, `test_cu2_…` |
| RF-04 Alerta ≤ 3 días | Campo `alerta` de la entrada; aviso en pantalla | `test_rf04_alerta_tres_dias`, `test_cu1_…` |
| RF-05 Asignar celda (automática o manual) | `id_espacio` opcional en la entrada; `PUT /api/tiquetes/{id}/espacio` | `test_rf05_asignacion_manual_y_cambio_de_celda` |
| RF-06 Mostrar celda y alertar sin celdas | `numero_espacio` en la respuesta; alerta en la barra de ocupación | `test_cu5_…`, `test_rf06_sin_celdas_libres` |
| RF-07 Evitar doble ingreso | Validación más índice único parcial `ux_tiquete_placa_abierto` | `test_cu4_…` |
| RF-08 Registrar salida | `POST /api/tiquetes/salida` | `test_cu6_…` |
| RF-09 Validar salida | Rechazo sin entrada abierta | `test_cu7_…` |
| RF-10 Ocupación | `GET /api/ocupacion`; se actualiza cada 15 s y tras cada movimiento | `test_cu5_…`, `test_cu6_…` |
| RF-11 Historial con filtros | `GET /api/tiquetes?placa=&id_propietario=&id_espacio=&desde=&hasta=` | `test_rf11_historial_con_filtros` |
| RF-12 Vehículos dentro | `GET /api/tiquetes?abiertos=true` | `test_rf12_y_rf13_…` |
| RF-13 Novedades | Campo `novedad` en entrada y salida | `test_rf12_y_rf13_…` |
| RN-01 Celda según tipo | `CHECK` en la base y validación de la celda elegida | `test_rn01_moto_no_entra_en_celda_de_carro` |
| RN-02 Un vehículo por celda | Índice único parcial `ux_tiquete_espacio_abierto` | `test_cu4_…`, `test_rf05_…` |
| RN-03 Sin entrada abierta | Índice único parcial `ux_tiquete_placa_abierto` | `test_cu4_…` |
| RN-04 Vigencia de 30 días | `calcular_vigencia` | `test_vigencia.py` |
| RN-05 Vencida no entra | Validación de la entrada | `test_cu2_…` |
| RNF-02 Máximo 3 pasos | Placa, celda (automática) y novedad opcional en una sola pantalla | Prueba manual |
| RNF-03 Autenticación y roles | JWT; anular solo administrador | `test_rnf03_requiere_autenticacion`, `test_rnf05_solo_el_administrador_…` |
| RNF-04 Concurrencia | `FOR UPDATE SKIP LOCKED` e índices únicos parciales | Índices verificados por `test_cu4_…` |
| RNF-05 Trazabilidad sin borrados | Operario y hora en cada registro; anulación con motivo; sin DELETE | `test_rnf05_…` (2 pruebas) |
| RNF-07 Respaldo diario | `respaldo.sh` programado con `instalar_respaldo.sh` | Prueba manual (respaldo y restauración) |
| RNF-08 Configurable | Tablas `espacio` y `tarifa`; `DIAS_VIGENCIA` y `DIAS_ALERTA` | Prueba manual |
| RNF-10 Habeas Data | Columnas `autoriza_datos` y `fecha_autorizacion` | `test_rnf10_sin_autorizacion_no_registra_nada` |
| Precondición de cupo | `verificar_cupo` en `registrar_vehiculo.py` | `test_cupo_garantizado_de_motos` |

RNF-01, RNF-06 y RNF-09 quedan pendientes de verificar; ver [estado-actual.md](./estado-actual.md#limitaciones-conocidas).
