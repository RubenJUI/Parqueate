-- Celdas del parqueadero (80 en total, 70 para carros y 10 para motos) y tarifas mensuales.
-- Uso: psql -d parqueadero_autos_colombia -f database/seed.sql

INSERT INTO espacio (numero_espacio, tipo_permitido)
SELECT 'C-' || LPAD(n::text, 2, '0'), 'Carro' FROM generate_series(1, 70) AS n
ON CONFLICT (numero_espacio) DO NOTHING;

INSERT INTO espacio (numero_espacio, tipo_permitido)
SELECT 'M-' || LPAD(n::text, 2, '0'), 'Moto' FROM generate_series(1, 10) AS n
ON CONFLICT (numero_espacio) DO NOTHING;

INSERT INTO tarifa (tipo_vehiculo, valor_mensual) VALUES
    ('Carro', 250000),
    ('Moto', 100000)
ON CONFLICT (tipo_vehiculo) DO NOTHING;
