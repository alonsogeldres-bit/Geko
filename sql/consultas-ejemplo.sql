-- ===========================================================
-- GEKO — Consultas de ejemplo
--
-- No forman parte del esquema. Se guardan aquí solo como
-- referencia para probar la base de datos.
--
-- Uso:
--   mysql -u USUARIO -p < sql/consultas-ejemplo.sql
-- ===========================================================

USE geko;


-- Clientes con su plan y fechas de suscripción.
SELECT
  u.nombre, u.apellido, u.correo, tp.nombre_plan, tp.valor, s.fecha_inicio, s.fecha_termino
FROM clientes c
INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
INNER JOIN suscripcion s ON s.id_cliente = c.id_cliente
INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan;


-- Detalle de las rutinas por cliente.
SELECT
  u.nombre, u.apellido,
  e.nombre AS ejercicio, e.complejidad,
  dpe.dia_semana, dpe.orden, dpe.series, dpe.repeticiones,
  dpe.duracion_segundos, dpe.descanso_segundos, dpe.intensidad
FROM detalle_plan_entrenamiento dpe
INNER JOIN plan_entrenamiento pe ON dpe.id_plan_entrenamiento = pe.id_plan_entrenamiento
INNER JOIN clientes c ON pe.id_cliente = c.id_cliente
INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
INNER JOIN ejercicios e ON dpe.id_ejercicio = e.id_ejercicio;


-- Cirugías registradas en las fichas médicas.
SELECT
  u.nombre, u.apellido,
  c2.descripcion, c2.fecha_cirugia, c2.observaciones
FROM ficha_medica f
INNER JOIN clientes c ON f.id_cliente = c.id_cliente
INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
INNER JOIN cirugia c2 ON c2.id_ficha = f.id_ficha;


-- Ejercicios no recomendados para una ficha concreta.
SELECT DISTINCT e.nombre, er.nivel_restriccion, er.explicacion
FROM ficha_antecedente fa
INNER JOIN ejercicio_restriccion er ON er.id_antecedente = fa.id_antecedente
INNER JOIN ejercicios e ON e.id_ejercicio = er.id_ejercicio
WHERE fa.id_ficha = 1
  AND er.nivel_restriccion = 'NO_RECOMENDADO';


-- Ejercicios recomendados por objetivo, excluyendo restricciones.
SELECT e.id_ejercicio, e.nombre, eo.afinidad
FROM ejercicio_objetivo eo
INNER JOIN ejercicios e ON e.id_ejercicio = eo.id_ejercicio
WHERE eo.id_objetivo = 1
  AND e.id_ejercicio NOT IN (
    SELECT er.id_ejercicio
    FROM ficha_antecedente fa
    INNER JOIN ejercicio_restriccion er ON er.id_antecedente = fa.id_antecedente
    WHERE fa.id_ficha = 5
      AND er.nivel_restriccion = 'NO_RECOMENDADO'
  )
ORDER BY eo.afinidad DESC;


-- Historial de pagos.
SELECT c.id_cliente, u.nombre, u.apellido, p.monto, p.fecha_pago, p.estado
FROM pago p
INNER JOIN suscripcion s ON p.id_suscripcion = s.id_suscripcion
INNER JOIN clientes c ON s.id_cliente = c.id_cliente
INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
ORDER BY p.fecha_pago DESC;


-- Recomendaciones de ejercicios para un cliente concreto.
SELECT
  e.id_ejercicio,
  e.nombre AS ejercicio,
  eo.afinidad,
  CASE
    WHEN er.nivel_restriccion = 'NO_RECOMENDADO' THEN 'Descartado'
    WHEN er.nivel_restriccion = 'PRECAUCION' THEN 'Con precaución'
    ELSE 'Disponible'
  END AS estado_recomendacion,
  er.explicacion
FROM clientes c
INNER JOIN ficha_medica f ON f.id_cliente = c.id_cliente
INNER JOIN ejercicio_objetivo eo ON eo.id_objetivo = c.id_objetivo
INNER JOIN ejercicios e ON e.id_ejercicio = eo.id_ejercicio
LEFT JOIN ficha_antecedente fa ON fa.id_ficha = f.id_ficha
LEFT JOIN ejercicio_restriccion er
  ON er.id_ejercicio = e.id_ejercicio
  AND er.id_antecedente = fa.id_antecedente
WHERE c.id_cliente = 4
ORDER BY
  CASE WHEN er.nivel_restriccion = 'NO_RECOMENDADO' THEN 2
       WHEN er.nivel_restriccion = 'PRECAUCION' THEN 1
       ELSE 0 END,
  eo.afinidad DESC;


-- Usuarios con suscripción activa hoy.
SELECT nombre, apellido
FROM usuarios
WHERE id_usuario IN (
  SELECT c.id_usuario
  FROM clientes c
  INNER JOIN suscripcion s ON c.id_cliente = s.id_cliente
  WHERE s.fecha_inicio <= CURDATE()
    AND (s.fecha_termino IS NULL OR s.fecha_termino >= CURDATE())
    AND s.estado = 'Activa'
);


-- Usuarios sin suscripción activa hoy.
SELECT u.nombre, u.apellido
FROM usuarios u
INNER JOIN clientes c ON c.id_usuario = u.id_usuario
WHERE NOT EXISTS (
  SELECT 1
  FROM suscripcion s
  WHERE s.id_cliente = c.id_cliente
    AND s.fecha_inicio <= CURDATE()
    AND (s.fecha_termino IS NULL OR s.fecha_termino >= CURDATE())
    AND s.estado = 'Activa'
);
