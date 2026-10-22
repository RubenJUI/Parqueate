-- Plantilla para registrar a mano (por ejemplo, desde DBeaver) las precondiciones del modulo:
-- el usuario del parqueadero, su vehiculo y el pago de la mensualidad.
-- Reemplaza los valores de ejemplo y ejecuta cada bloque. La alternativa sin SQL es:
--   python registrar_vehiculo.py <placa> <Carro|Moto> <documento> <nombre> <telefono> [fecha_pago]

-- 1. Usuario del parqueadero (si el documento ya existe, no hace nada).
--    RNF-10: registra solo a quien autorizo el tratamiento de sus datos (Ley 1581 de 2012).
INSERT INTO propietario (documento, nombre, telefono, autoriza_datos, fecha_autorizacion)
VALUES ('1036999999', 'Nombre Apellido', '3001234567', TRUE, CURRENT_TIMESTAMP)
ON CONFLICT (documento) DO NOTHING;

-- 2. Vehiculo: placa sin espacios ni guiones, en mayuscula; tipo 'Carro' o 'Moto'.
INSERT INTO vehiculo (placa, tipo_vehiculo, id_propietario)
SELECT 'XYZ987', 'Carro', id_propietario FROM propietario WHERE documento = '1036999999'
ON CONFLICT (placa) DO NOTHING;

-- 3. Pago de la mensualidad con el valor de la tarifa del tipo de vehiculo.
--    La vigencia va de fecha_pago a fecha_pago + 29 dias (RN-04).
INSERT INTO pago (placa, fecha_pago, monto)
SELECT v.placa, CURRENT_DATE, t.valor_mensual
FROM vehiculo v JOIN tarifa t ON t.tipo_vehiculo = v.tipo_vehiculo
WHERE v.placa = 'XYZ987'
  AND NOT EXISTS (SELECT 1 FROM pago WHERE placa = 'XYZ987' AND fecha_pago = CURRENT_DATE);

-- Renovacion: repite solo el paso 3 el dia del nuevo pago (la fecha no puede ser futura).
-- Este SQL no valida el cupo garantizado; registrar_vehiculo.py si lo hace.

-- Consulta de vigencia de todos los vehiculos segun su pago mas reciente.
SELECT v.placa, v.tipo_vehiculo, p.nombre AS propietario,
       MAX(pg.fecha_pago) AS ultimo_pago,
       MAX(pg.fecha_pago) + 29 AS vence,
       CASE WHEN MAX(pg.fecha_pago) IS NULL THEN 'Sin pago'
            WHEN MAX(pg.fecha_pago) + 29 < CURRENT_DATE THEN 'Vencida'
            WHEN MAX(pg.fecha_pago) + 29 - CURRENT_DATE <= 3 THEN 'Por vencer'
            ELSE 'Vigente' END AS estado
FROM vehiculo v
JOIN propietario p ON p.id_propietario = v.id_propietario
LEFT JOIN pago pg ON pg.placa = v.placa AND pg.fecha_pago <= CURRENT_DATE
GROUP BY v.placa, v.tipo_vehiculo, p.nombre
ORDER BY v.placa;
