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
    monto NUMERIC(10, 2) NOT NULL CHECK (monto >= 0)
);

-- Tabla Espacio (celda). RN-01: cada celda es solo para carro o solo para moto.
CREATE TABLE espacio (
    id_espacio SERIAL PRIMARY KEY,
    numero_espacio VARCHAR(10) UNIQUE NOT NULL,
    tipo_permitido VARCHAR(20) NOT NULL CHECK (tipo_permitido IN ('Carro', 'Moto')),
    estado VARCHAR(20) NOT NULL DEFAULT 'Disponible' CHECK (estado IN ('Disponible', 'Ocupado', 'Mantenimiento')),
    motivo_mantenimiento VARCHAR(255)
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
