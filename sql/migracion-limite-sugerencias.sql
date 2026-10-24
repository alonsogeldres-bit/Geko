-- ===========================================================
-- MIGRACIÓN: LÍMITE SEMANAL DE SUGERENCIAS (PLAN GRATIS)
--
-- Ejecutar sobre la base de datos de GEKO:
--   mysql -u USUARIO -p NOMBRE_BD < sql/migracion-limite-sugerencias.sql
--
-- Qué hace:
--   Crea `uso_sugerencia`, que guarda hasta qué variante de la
--   sugerencia del día llegó cada cliente en la semana actual.
--
-- Reglas:
--   - El plan Gratis ve 3 variantes por semana (1/3, 2/3, 3/3).
--   - El plan de pago (Premium) es ilimitado y no usa esta tabla.
--   - La semana empieza el lunes: el reinicio a 1/3 es automático,
--     porque las filas de semanas anteriores dejan de consultarse.
--
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- ===========================================================

CREATE TABLE IF NOT EXISTS uso_sugerencia (
  id_uso INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_cliente INT NOT NULL,
  -- Lunes de la semana a la que pertenece el consumo.
  semana_inicio DATE NOT NULL,
  -- Última variante vista (1..3).
  ultimo_indice TINYINT UNSIGNED NOT NULL DEFAULT 1,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_uso_sugerencia_cliente
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  UNIQUE KEY uq_uso_sugerencia_semana (id_cliente, semana_inicio),
  KEY idx_uso_sugerencia_semana (semana_inicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
