-- Datos de prueba ficticios: propietarios, vehiculos y pagos de mensualidad.
-- Las fechas de pago son relativas a hoy para que siempre haya casos vigentes, por vencer y vencidos.
-- Uso: psql -d parqueadero_autos_colombia -f database/datos_prueba.sql

INSERT INTO propietario (documento, nombre, telefono) VALUES
    ('1036000001', 'Carlos Restrepo', '3000000001'),
    ('1036000002', 'Laura Gómez', '3000000002'),
    ('1036000003', 'Andrés Pérez', '3000000003'),
    ('1036000004', 'María Ospina', '3000000004')
ON CONFLICT (documento) DO NOTHING;

INSERT INTO vehiculo (placa, tipo_vehiculo, id_propietario)
SELECT v.placa, v.tipo, p.id_propietario
FROM (VALUES
    ('ABC123', 'Carro', '1036000001'),  -- vigente
    ('DEF456', 'Carro', '1036000002'),  -- vence en 3 dias (alerta)
    ('GHI789', 'Carro', '1036000003'),  -- vence hoy (alerta)
    ('JKL012', 'Carro', '1036000004'),  -- vencida desde ayer
    ('MNO34A', 'Moto', '1036000001'),   -- vigente
    ('PQR56B', 'Moto', '1036000002')    -- sin pagos registrados
) AS v (placa, tipo, documento)
JOIN propietario p ON p.documento = v.documento
ON CONFLICT (placa) DO NOTHING;

INSERT INTO pago (placa, fecha_pago, monto) VALUES
    ('ABC123', CURRENT_DATE - 5, 250000),
    ('DEF456', CURRENT_DATE - 26, 250000),
    ('GHI789', CURRENT_DATE - 29, 250000),
    ('JKL012', CURRENT_DATE - 30, 250000),
    ('MNO34A', CURRENT_DATE, 100000);
