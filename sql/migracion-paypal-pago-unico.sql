-- ===========================================================
-- MIGRACIÓN PAYPAL — PAGO ÚNICO (Checkout Orders API v2)
--
-- Ejecutar sobre la base de datos de GEKO:
--   mysql -u USUARIO -p NOMBRE_BD < sql/migracion-paypal-pago-unico.sql
--
-- Qué hace:
--   1. Agrega tipo_plan.precio_usd (precio real que se cobra en PayPal).
--   2. Agrega pago.paypal_order_id (id de la orden de PayPal) + índice único.
--   3. Agrega pago.moneda (los pagos históricos quedan marcados como CLP).
--   4. Crea webhook_evento para deduplicar notificaciones de PayPal.
--
-- Es idempotente: se puede volver a ejecutar sin romper nada.
-- NO agrega campos de captura: el flujo es de pago único.
-- ===========================================================

-- -----------------------------------------------------------
-- tipo_plan.precio_usd
-- -----------------------------------------------------------
SET @existe = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tipo_plan'
     AND COLUMN_NAME = 'precio_usd'
);

SET @ddl = IF(
  @existe = 0,
  'ALTER TABLE tipo_plan ADD COLUMN precio_usd DECIMAL(10,2) NULL AFTER valor',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------
-- pago.paypal_order_id
-- -----------------------------------------------------------
SET @existe = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'pago'
     AND COLUMN_NAME = 'paypal_order_id'
);

SET @ddl = IF(
  @existe = 0,
  'ALTER TABLE pago ADD COLUMN paypal_order_id VARCHAR(64) NULL AFTER id_suscripcion',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------
-- pago.moneda (nullable primero para poder backfillear)
-- -----------------------------------------------------------
SET @existe = (
  SELECT COUNT(*)
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'pago'
     AND COLUMN_NAME = 'moneda'
);

SET @ddl = IF(
  @existe = 0,
  'ALTER TABLE pago ADD COLUMN moneda VARCHAR(3) NULL AFTER monto',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Los pagos históricos eran montos en CLP.
UPDATE pago SET moneda = 'CLP' WHERE moneda IS NULL;

ALTER TABLE pago
  MODIFY COLUMN moneda VARCHAR(3) NOT NULL DEFAULT 'USD';

-- -----------------------------------------------------------
-- Índice único de la orden de PayPal (MySQL permite varios NULL).
-- -----------------------------------------------------------
SET @existe_indice = (
  SELECT COUNT(*)
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'pago'
     AND INDEX_NAME = 'uq_pago_paypal_order'
);

SET @ddl = IF(
  @existe_indice = 0,
  'ALTER TABLE pago ADD UNIQUE KEY uq_pago_paypal_order (paypal_order_id)',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- -----------------------------------------------------------
-- Idempotencia de webhooks (evita reprocesar el mismo evento).
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_evento (
  id_evento VARCHAR(64) PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------
-- Backfill de precio_usd.
-- Ajusta los valores según tu catálogo real de planes.
-- -----------------------------------------------------------
UPDATE tipo_plan
   SET precio_usd = 0
 WHERE nombre_plan = 'Gratis'
   AND precio_usd IS NULL;

UPDATE tipo_plan
   SET precio_usd = 9.99
 WHERE valor > 0
   AND precio_usd IS NULL;

-- -----------------------------------------------------------
-- Comprobación posterior (opcional):
-- -----------------------------------------------------------
-- SHOW COLUMNS FROM tipo_plan;
-- SHOW COLUMNS FROM pago;
-- SELECT id_tipo_plan, nombre_plan, valor, precio_usd FROM tipo_plan;
