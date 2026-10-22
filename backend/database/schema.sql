-- Modelo fisico (seccion 5.3) de la base parqueadero_autos_colombia.
-- Uso: createdb parqueadero_autos_colombia && psql -d parqueadero_autos_colombia -f database/schema.sql

-- Tabla Propietario
CREATE TABLE propietario (
    id_propietario SERIAL PRIMARY KEY,
    documento VARCHAR(20) UNIQUE NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    telefono VARCHAR(20),
    correo VARCHAR(100)
);

-- Tabla Vehiculo
CREATE TABLE vehiculo (
    placa VARCHAR(10) PRIMARY KEY,
    tipo_vehiculo VARCHAR(20) NOT NULL CHECK (tipo_vehiculo IN ('Carro', 'Moto', 'Camioneta')),
    marca VARCHAR(50),
    modelo VARCHAR(50),
    color VARCHAR(30),
    id_propietario INT REFERENCES propietario(id_propietario) ON DELETE SET NULL
);

-- Tabla Espacio de Parqueadero
CREATE TABLE espacio (
    id_espacio SERIAL PRIMARY KEY,
    numero_espacio VARCHAR(10) UNIQUE NOT NULL,
    piso_zona VARCHAR(20) NOT NULL,
    tipo_permitido VARCHAR(20) NOT NULL CHECK (tipo_permitido IN ('Carro', 'Moto', 'Camioneta', 'Todos')),
    estado VARCHAR(20) DEFAULT 'Disponible' CHECK (estado IN ('Disponible', 'Ocupado', 'Mantenimiento'))
);

-- Tabla Tarifa
CREATE TABLE tarifa (
    id_tarifa SERIAL PRIMARY KEY,
    tipo_vehiculo VARCHAR(20) NOT NULL,
    valor_hora NUMERIC(10, 2) NOT NULL,
    valor_dia NUMERIC(10, 2) NOT NULL,
    fecha_inicio_vigencia DATE NOT NULL DEFAULT CURRENT_DATE,
    estado BOOLEAN DEFAULT TRUE
);

-- Tabla Usuario / Operador
CREATE TABLE usuario (
    id_usuario SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    correo VARCHAR(100) UNIQUE NOT NULL,
    contrasena_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('Administrador', 'Operador')),
    estado BOOLEAN DEFAULT TRUE
);

-- Tabla Tiquete
CREATE TABLE tiquete (
    id_tiquete SERIAL PRIMARY KEY,
    placa VARCHAR(10) NOT NULL REFERENCES vehiculo(placa),
    id_espacio INT NOT NULL REFERENCES espacio(id_espacio),
    id_tarifa INT NOT NULL REFERENCES tarifa(id_tarifa),
    id_usuario_entrada INT NOT NULL REFERENCES usuario(id_usuario),
    id_usuario_salida INT REFERENCES usuario(id_usuario),
    fecha_hora_entrada TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_hora_salida TIMESTAMP,
    valor_total NUMERIC(10, 2),
    estado_pago VARCHAR(20) DEFAULT 'Pendiente' CHECK (estado_pago IN ('Pendiente', 'Pagado'))
);

-- Tabla Pago
CREATE TABLE pago (
    id_pago SERIAL PRIMARY KEY,
    id_tiquete INT UNIQUE NOT NULL REFERENCES tiquete(id_tiquete),
    fecha_hora_pago TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    monto NUMERIC(10, 2) NOT NULL,
    metodo_pago VARCHAR(30) NOT NULL CHECK (metodo_pago IN ('Efectivo', 'Tarjeta', 'Transferencia'))
);

-- Restricciones adicionales al modelo fisico.

-- RN-03: un vehiculo no puede tener dos tiquetes abiertos (sin salida).
CREATE UNIQUE INDEX ux_tiquete_placa_abierto ON tiquete (placa) WHERE fecha_hora_salida IS NULL;

-- Un espacio no puede estar asignado a dos tiquetes abiertos.
CREATE UNIQUE INDEX ux_tiquete_espacio_abierto ON tiquete (id_espacio) WHERE fecha_hora_salida IS NULL;

-- Consultas frecuentes: vehiculos por propietario e historial por fecha.
CREATE INDEX ix_vehiculo_propietario ON vehiculo (id_propietario);
CREATE INDEX ix_tiquete_entrada ON tiquete (fecha_hora_entrada);
