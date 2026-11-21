-- Modelo fisico de la base parqueadero_autos_colombia para el modulo
-- "Gestion de Entrada y Salida de Vehiculos" y "Gestion de Usuarios y Celdas".
-- Propietarios, vehiculos, pagos, celdas y tarifas son compatibles con el Modulo 1 y Modulo 2.
-- Uso: createdb parqueadero_autos_colombia && psql -d parqueadero_autos_colombia -f database/schema.sql

-- Tabla Propietario (usuario del parqueadero con mensualidad).
-- RNF-10: se guarda la autorizacion de tratamiento de datos personales (Ley 1581 de 2012).
CREATE TABLE propietario (
    id_propietario SERIAL PRIMARY KEY,
    tipo_documento VARCHAR(10) NOT NULL DEFAULT 'CC',
    documento VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    nombres VARCHAR(100),
    apellidos VARCHAR(100),
    telefono VARCHAR(20),
    correo VARCHAR(100),
    estado VARCHAR(20) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
    motivo_inactivacion VARCHAR(255),
    autoriza_datos BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_autorizacion TIMESTAMP,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_registro VARCHAR(100) DEFAULT 'Administrador',
    CONSTRAINT propietario_autorizacion_check CHECK (NOT autoriza_datos OR fecha_autorizacion IS NOT NULL)
);

-- Tabla Vehiculo. RF-02: toda placa esta asociada a un propietario registrado.
CREATE TABLE vehiculo (
    placa VARCHAR(10) PRIMARY KEY,
    id_vehiculo SERIAL,
    tipo_vehiculo VARCHAR(20) NOT NULL CHECK (tipo_vehiculo IN ('Carro', 'Moto')),
    id_propietario INT NOT NULL REFERENCES propietario(id_propietario),
    marca VARCHAR(60) NOT NULL DEFAULT '',
    color VARCHAR(40) NOT NULL DEFAULT '',
    estado VARCHAR(20) NOT NULL DEFAULT 'Activo' CHECK (estado IN ('Activo', 'Inactivo')),
    motivo_inactivacion VARCHAR(255),
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tabla Tarifa: valor de la mensualidad por tipo de vehiculo (RNF-08: configurable sin cambiar codigo).
CREATE TABLE tarifa (
    tipo_vehiculo VARCHAR(20) PRIMARY KEY CHECK (tipo_vehiculo IN ('Carro', 'Moto')),
    valor_mensual NUMERIC(10, 2) NOT NULL CHECK (valor_mensual >= 0)
);

-- Tabla Pago de la mensualidad. La vigencia va de fecha_pago a fecha_pago + 29 dias (RN-04).
CREATE TABLE pago (
    id_pago SERIAL PRIMARY KEY,
    placa VARCHAR(10) NOT NULL REFERENCES vehiculo(placa),
    fecha_pago DATE NOT NULL,
    monto NUMERIC(10, 2) NOT NULL CHECK (monto >= 0),
    -- 'Registro': pago inicial automatico al registrar el vehiculo en Gestion de Usuarios.
    -- No cuenta como movimiento para HU-U08 (eliminar registros hechos por error).
    origen VARCHAR(20) NOT NULL DEFAULT 'Caja' CHECK (origen IN ('Caja', 'Registro'))
);

-- Tabla Espacio (celda). RN-01: cada celda es solo para carro o solo para moto.
CREATE TABLE espacio (
    id_espacio SERIAL PRIMARY KEY,
    numero_espacio VARCHAR(10) UNIQUE NOT NULL,
    tipo_permitido VARCHAR(20) NOT NULL CHECK (tipo_permitido IN ('Carro', 'Moto')),
    -- HU-C05/HU-C06: 'Convertida' = espacio original cedido a una conversión;
    -- 'Retirada' = celda resultante de una conversión ya restablecida (su código no se reutiliza).
    estado VARCHAR(20) NOT NULL DEFAULT 'Disponible' CHECK (estado IN ('Disponible', 'Ocupado', 'Mantenimiento', 'Convertida', 'Retirada')),
    motivo_mantenimiento VARCHAR(255),
    -- Celdas resultantes de una conversión: a qué conversión pertenecen.
    id_conversion INT
);

-- HU-C05/HU-C06/HU-C07: conversiones de celdas (carro -> 2 motos, pareja de motos -> carro) y su restablecimiento.
CREATE TABLE IF NOT EXISTS conversion_celda (
    id SERIAL PRIMARY KEY,
    tipo_origen VARCHAR(20) NOT NULL CHECK (tipo_origen IN ('Carro', 'Moto')),
    codigos_origen TEXT[] NOT NULL,
    codigos_resultado TEXT[] NOT NULL,
    motivo VARCHAR(255) NOT NULL,
    usuario_responsable VARCHAR(100) NOT NULL,
    fecha_conversion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    motivo_restablecimiento VARCHAR(255),
    usuario_restablecimiento VARCHAR(100),
    fecha_restablecimiento TIMESTAMP
);

-- Tabla Usuario / Operador del sistema (RNF-03)
CREATE TABLE usuario (
    id_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Operador')),
    estado BOOLEAN DEFAULT TRUE
);

-- Tabla Tiquete: registro de entrada y salida. RNF-05: no se elimina, se anula con justificacion.
CREATE TABLE tiquete (
    id_tiquete SERIAL PRIMARY KEY,
    placa VARCHAR(10) NOT NULL REFERENCES vehiculo(placa),
    id_espacio INT NOT NULL REFERENCES espacio(id_espacio),
    id_usuario_entrada INT NOT NULL REFERENCES usuario(id_usuario),
    id_usuario_salida INT REFERENCES usuario(id_usuario),
    fecha_hora_entrada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_hora_salida TIMESTAMP,
    novedad_entrada VARCHAR(255),
    novedad_salida VARCHAR(255),
    anulado BOOLEAN NOT NULL DEFAULT FALSE,
    motivo_anulacion VARCHAR(255),
    id_usuario_anulacion INT REFERENCES usuario(id_usuario),
    fecha_hora_anulacion TIMESTAMP,
    CHECK (NOT anulado OR (motivo_anulacion IS NOT NULL AND id_usuario_anulacion IS NOT NULL))
);

-- Tablas de trazabilidad del Modulo 2 (Usuarios y Celdas)
CREATE TABLE IF NOT EXISTS auditoria_usuario (
    id SERIAL PRIMARY KEY,
    id_propietario INT NOT NULL REFERENCES propietario(id_propietario) ON DELETE CASCADE,
    placa_vehiculo VARCHAR(10),
    campo_modificado VARCHAR(120) NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    motivo VARCHAR(255),
    usuario_responsable VARCHAR(100) NOT NULL,
    fecha_cambio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- HU-U08: constancia de cada eliminacion. No depende de propietario ni de vehiculo
-- para que sobreviva al borrado y conserve quien elimino, cuando, por que y que se elimino.
CREATE TABLE IF NOT EXISTS registro_eliminacion (
    id SERIAL PRIMARY KEY,
    tipo_registro VARCHAR(20) NOT NULL CHECK (tipo_registro IN ('Usuario', 'Vehiculo')),
    id_propietario INT,
    documento VARCHAR(20),
    nombre VARCHAR(200),
    placas VARCHAR(255),
    detalle TEXT,
    motivo VARCHAR(255) NOT NULL,
    usuario_responsable VARCHAR(100) NOT NULL,
    fecha_eliminacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS historial_celda (
    id SERIAL PRIMARY KEY,
    codigo_celda VARCHAR(10) NOT NULL,
    accion VARCHAR(120) NOT NULL,
    estado_anterior VARCHAR(30),
    estado_nuevo VARCHAR(30),
    motivo VARCHAR(255) NOT NULL,
    usuario_responsable VARCHAR(100) NOT NULL,
    fecha_cambio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RN-03: un vehiculo no puede tener dos entradas abiertas.
CREATE UNIQUE INDEX ux_tiquete_placa_abierto ON tiquete (placa) WHERE fecha_hora_salida IS NULL AND NOT anulado;

-- RN-02 / RNF-04: una celda no puede tener dos vehiculos a la vez.
CREATE UNIQUE INDEX ux_tiquete_espacio_abierto ON tiquete (id_espacio) WHERE fecha_hora_salida IS NULL AND NOT anulado;

-- Consultas frecuentes: ultima mensualidad de una placa, historial por fecha y trazabilidad.
CREATE INDEX ix_pago_placa_fecha ON pago (placa, fecha_pago DESC);
CREATE INDEX ix_tiquete_entrada ON tiquete (fecha_hora_entrada);
CREATE INDEX IF NOT EXISTS ix_auditoria_usuario_propietario ON auditoria_usuario (id_propietario, fecha_cambio DESC);
CREATE INDEX IF NOT EXISTS ix_historial_celda_codigo ON historial_celda (codigo_celda, fecha_cambio DESC);

-- Tablas del Modulo 3: Gestion de Pagos de Mensualidades, Tarifas y Reportes
CREATE TABLE IF NOT EXISTS tarifa_mensualidad (
    id SERIAL PRIMARY KEY,
    tipo_vehiculo VARCHAR(20) NOT NULL CHECK (tipo_vehiculo IN ('Carro', 'Moto')),
    valor_cop INTEGER NOT NULL CHECK (valor_cop > 0),
    valor_anterior_cop INTEGER,
    fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    motivo TEXT NOT NULL,
    usuario_responsable VARCHAR(100) NOT NULL,
    fecha_cambio TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pago_mensualidad (
    id SERIAL PRIMARY KEY,
    numero_comprobante VARCHAR(20) UNIQUE NOT NULL,
    id_propietario INTEGER NOT NULL REFERENCES propietario(id_propietario),
    placa_vehiculo VARCHAR(10) NOT NULL REFERENCES vehiculo(placa),
    tipo_vehiculo VARCHAR(20) NOT NULL CHECK (tipo_vehiculo IN ('Carro', 'Moto')),
    meses_pagados INTEGER NOT NULL CHECK (meses_pagados BETWEEN 1 AND 3),
    valor_unitario_cop INTEGER NOT NULL CHECK (valor_unitario_cop > 0),
    valor_total_cop INTEGER NOT NULL CHECK (valor_total_cop > 0),
    fecha_inicio_vigencia DATE NOT NULL,
    fecha_fin_vigencia DATE NOT NULL,
    metodo_pago VARCHAR(20) NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Transferencia', 'Tarjeta')),
    referencia_pago VARCHAR(100),
    valor_recibido_cop INTEGER,
    cambio_cop INTEGER,
    estado VARCHAR(20) NOT NULL DEFAULT 'Registrado' CHECK (estado IN ('Registrado', 'Anulado')),
    operario_registro VARCHAR(100) NOT NULL,
    fecha_registro TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usuario_anulacion VARCHAR(100),
    fecha_anulacion TIMESTAMP,
    motivo_anulacion TEXT
);

CREATE TABLE IF NOT EXISTS auditoria_reporte (
    id SERIAL PRIMARY KEY,
    usuario_responsable VARCHAR(100) NOT NULL,
    fecha_generacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rango_fechas VARCHAR(60) NOT NULL,
    filtros TEXT
);

CREATE INDEX IF NOT EXISTS ix_pago_mensualidad_placa ON pago_mensualidad (placa_vehiculo, id DESC);
CREATE INDEX IF NOT EXISTS ix_pago_mensualidad_fecha ON pago_mensualidad (fecha_registro DESC, id DESC);
CREATE INDEX IF NOT EXISTS ix_tarifa_mensualidad_tipo ON tarifa_mensualidad (tipo_vehiculo, fecha_inicio DESC, id DESC);
