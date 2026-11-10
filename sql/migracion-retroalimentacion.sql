-- ===========================================================
-- GEKO — Migración: retroalimentación de sesiones
--
-- Crea la tabla del cuestionario post-entrenamiento. Se puede
-- aplicar sobre una base ya creada sin tocar nada más:
--
--   mysql -u USUARIO -p NOMBRE_BD < sql/migracion-retroalimentacion.sql
--
-- (El mismo CREATE TABLE también quedó en schema.sql, sección 9,
-- para las instalaciones nuevas.)
-- ===========================================================

CREATE TABLE IF NOT EXISTS retroalimentacion_sesion (
  id_retroalimentacion INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_cliente INT NOT NULL,
  fecha DATE NOT NULL,                          -- día de la sesión evaluada
  estado ENUM('Respondida', 'Omitida') NOT NULL DEFAULT 'Respondida',
  esfuerzo TINYINT UNSIGNED NULL,               -- 1..4 (mismo RPE del reproductor)
  satisfaccion TINYINT UNSIGNED NULL,          -- 1..5
  molestias_json JSON NULL,                     -- ["rodilla", "espalda", ...]
  comentario VARCHAR(280) NULL,
  recomendacion VARCHAR(400) NULL,             -- consejo generado para el usuario
  origen VARCHAR(20) NULL,                     -- 'ia' | 'respaldo'
  aplicada TINYINT(1) NOT NULL DEFAULT 0,       -- ¿ya ajustó una rutina?
  ajustes_json JSON NULL,                       -- qué se ajustó exactamente
  respondida_en DATETIME NULL,
  creada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_retro_cliente_fecha (id_cliente, fecha),
  KEY idx_retro_cliente_fecha (id_cliente, fecha),
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  CHECK (esfuerzo IS NULL OR esfuerzo BETWEEN 1 AND 4),
  CHECK (satisfaccion IS NULL OR satisfaccion BETWEEN 1 AND 5)
);
