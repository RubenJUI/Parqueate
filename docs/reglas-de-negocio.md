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

## HU-C01 · Ver el mapa de celdas

**Como:** Administrador u operario del parqueadero. **Requiero:** ver el mapa de celdas con el estado de cada una (libre, ocupada o fuera de servicio). **Para:** saber en todo momento qué espacios hay disponibles y dónde está cada vehículo.

**Criterios de aceptación**

1. El sistema inicia con 80 celdas en estado Libre: C-01 a C-70 y M-01 a M-10.
2. El mapa se divide en dos secciones, Carros y Motos. Cada celda aparece en la sección de su tipo actual.
3. El mapa se puede filtrar por tipo y por estado.
4. En las celdas ocupadas se muestran la placa y la hora de entrada.
5. Las celdas que resultan de una conversión aparecen juntas en un recuadro que indica el espacio de donde salieron.
   - Ejemplo: M-11 y M-12 aparecen en la sección de Motos, en un recuadro marcado "Antes C-20".
   - Ejemplo: C-72 aparece en la sección de Carros, en un recuadro marcado "Antes M-09/M-10".
6. Cada estado se identifica con color y con texto. Las celdas convertidas se distinguen con un recuadro de otro color, sin confundirse con fuera de servicio.
7. El mapa carga en menos de 2 segundos.

## HU-U08 · Eliminar usuario o vehículo registrado por error

**Como:** Administrador del parqueadero. **Requiero:** eliminar un usuario o vehículo que no tiene ningún movimiento. **Para:** corregir registros hechos por error.

**Criterios de aceptación**

1. **Vehículo:** se puede eliminar si no tiene entradas, salidas, novedades ni pagos recibidos en caja.
2. **Usuario:** se puede eliminar si ninguno de sus vehículos tiene entradas, salidas, novedades ni pagos recibidos en caja. Al eliminarlo se eliminan también todos sus vehículos.
3. Si el vehículo tiene movimientos, o si alguno de los vehículos del usuario los tiene, el sistema no elimina nada.
   - Le informa al administrador qué movimientos encontró. Ejemplo: 2 registros de entrada/salida y 1 pago de mensualidad recibido.
   - Le ofrece inactivarlo en lugar de eliminarlo.
   - Al inactivarlo, el registro y todo su historial se conservan. No puede volver a entrar al parqueadero hasta que se reactive.
4. Un vehículo sin movimientos se puede eliminar solo, sin eliminar al usuario. Esto aplica aunque otro vehículo del mismo usuario sí tenga movimientos.
5. El pago que el sistema genera automáticamente al registrar el vehículo no cuenta como movimiento, porque no es un cobro real en caja.
6. Se exige el motivo y queda registrado quién eliminó, cuándo y por qué.

> **Inactivar no genera deudas:** solo impide la entrada y conserva el historial con el motivo; el sistema no calcula saldos pendientes.
>
> **Qué es un pago:** cada registro de la tabla `pago` es dinero ya recibido; el sistema no maneja pagos pendientes. Los pagos de `datos_prueba.sql` simulan mensualidades cobradas en caja, por eso esos usuarios solo se pueden inactivar.

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
| RNF-03 Autenticación y roles | JWT; solo el administrador anula, administra celdas (inicializar, crear, cambiar, eliminar), cambia el estado de usuarios y vehículos y los elimina. El selector de vista del dock solo lo ve el administrador | `test_rnf03_requiere_autenticacion`, `test_rnf03_operario_no_administra_…` (6 rutas), `test_rnf03_administrador_inicializa_…`, `test_rnf05_solo_el_administrador_…` |
| HU-U07 / HU-U09 Inactivo no entra | La entrada se rechaza (`409`) si el usuario o el vehículo están inactivos, con el motivo; la pantalla de registro lo bloquea al consultar la placa. Al reactivar, puede entrar | `test_hu_u07_…` (2 pruebas), `test_hu_u09_al_reactivar_…` |
| HU-C01 Celdas convertidas en su espacio | `GET /api/celdas` devuelve `espacio_original` y `tipo_original`; cada celda aparece en la sección de su tipo actual; las resultantes van en un recuadro que indica su espacio original ("Antes C-20" con M-11 y M-12 entre las motos; "Antes M-09/M-10" con C-72 entre los carros) | `test_hu_c05_convierte_…`, `test_hu_c06_convierte_…` |
| HU-C05 Carro a 2 motos | `POST /api/celdas/{codigo}/convertir`: celda libre, cupo garantizado, siguientes códigos de moto, historial "M-11 y M-12, antes C-20" | `test_hu_c05_…` (5 pruebas) |
| HU-C06 Pareja de motos a carro | Mismo endpoint sobre una moto original: solo parejas fijas (M-01/M-02 … M-09/M-10), ambas libres, cupo; historial "C-71, antes M-05 y M-06" | `test_hu_c06_…` (3 pruebas) |
| HU-C07 Restablecer | `POST /api/celdas/{codigo}/restablecer` desde cualquier celda resultante: todas libres, cupo; el espacio original vuelve y las resultantes quedan `Retirada`, por lo que sus códigos no se reutilizan. Una celda resultante no se vuelve a convertir. El tipo ya no se cambia con `PATCH` | `test_hu_c07_…` (3 pruebas), `test_el_tipo_no_se_cambia_directamente` |
| HU-U08 Eliminar registros hechos por error | Solo administrador y con motivo; se rechaza si hay entradas, salidas (aun anuladas) o pagos de caja, sugiriendo inactivar. El pago automático del registro (`pago.origen = 'Registro'`) no cuenta. La constancia queda en `registro_eliminacion`, que sobrevive al borrado | `tests/test_eliminacion.py` (7 pruebas) |
| RNF-04 Concurrencia | `FOR UPDATE SKIP LOCKED` e índices únicos parciales | Índices verificados por `test_cu4_…` |
| RNF-05 Trazabilidad sin borrados | Operario y hora en cada registro; anulación con motivo; sin DELETE | `test_rnf05_…` (2 pruebas) |
| RNF-07 Respaldo diario | `respaldo.sh` programado con `instalar_respaldo.sh` | Prueba manual (respaldo y restauración) |
| RNF-08 Configurable | Tablas `espacio` y `tarifa`; `DIAS_VIGENCIA` y `DIAS_ALERTA` | Prueba manual |
| RNF-10 Habeas Data | Columnas `autoriza_datos` y `fecha_autorizacion` | `test_rnf10_sin_autorizacion_no_registra_nada` |
| Precondición de cupo | `verificar_cupo` en `registrar_vehiculo.py` | `test_cupo_garantizado_de_motos` |

RNF-01, RNF-06 y RNF-09 quedan pendientes de verificar; ver [estado-actual.md](./estado-actual.md#limitaciones-conocidas).
