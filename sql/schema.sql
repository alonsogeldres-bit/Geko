-- ===========================================================
-- GEKO — Esquema completo de la base de datos
--
-- Crear la base desde cero:
--   mysql -u USUARIO -p < sql/schema.sql
--
-- Este archivo es la ÚNICA fuente de verdad del esquema.
-- No hay migraciones separadas: todo cambio de estructura se
-- agrega directamente aquí.
--
-- Notas sobre la BD local (drift conocido, no se replicó):
--   - preferencia_entrenamiento.dias_entreno: columna legacy que
--     el código ya no lee ni escribe.
--   - limite_rutina: tabla sin referencias en el código.
--   - tipo_plan: la BD local no tiene el CHECK de `precio_usd`.
--   - Los índices compuestos del final existen en este esquema,
--     pero todavía no fueron creados en la BD local.
-- ===========================================================

CREATE DATABASE IF NOT EXISTS geko
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE geko;

SET NAMES utf8mb4;


-- ===========================================================
-- 1. CATÁLOGOS
-- ===========================================================

CREATE TABLE rol (
  id_rol INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  estado BOOL DEFAULT 1,
  nombre_rol VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO rol (nombre_rol) VALUES
  ('admin'),
  ('cliente');


CREATE TABLE antecedente (
  id_antecedente INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  nombre VARCHAR(50) NOT NULL UNIQUE,
  categoria VARCHAR(50),
  descripcion VARCHAR(255)
);

INSERT INTO antecedente (nombre) VALUES
  ('Espalda'),
  ('Codo'),
  ('Rodilla'),
  ('Muñeca'),
  ('Hombro');


CREATE TABLE objetivo (
  id_objetivo INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  nombre_objetivo VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO objetivo (nombre_objetivo) VALUES
  ('Perder grasa'),
  ('Mejorar condición'),
  ('Ganar músculo');


CREATE TABLE equipamiento (
  id_equipamiento INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO equipamiento (nombre) VALUES
  ('Mancuernas'),
  ('Barra'),
  ('Máquinas'),
  ('Peso corporal'),
  ('Bandas elásticas'),
  ('Cuerda'),
  ('Banco');


CREATE TABLE tipo_plan (
  id_tipo_plan INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  nombre_plan VARCHAR(50) NOT NULL UNIQUE,
  valor DECIMAL(10,2) NOT NULL,
  precio_usd DECIMAL(10,2) NULL,
  CHECK (valor >= 0),
  CHECK (precio_usd IS NULL OR precio_usd >= 0)
);

-- `valor` es el precio en CLP; `precio_usd` es lo que se cobra en PayPal.
INSERT INTO tipo_plan (nombre_plan, valor, precio_usd) VALUES
  ('Gratis', 0.00, 0.00),
  ('Premium', 9990.00, 9.99);


-- ===========================================================
-- 2. USUARIOS Y CLIENTES
-- ===========================================================

CREATE TABLE usuarios (
  id_usuario INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_rol INT NOT NULL,
  nombre VARCHAR(50) NOT NULL,
  apellido VARCHAR(50) NOT NULL,
  correo VARCHAR(100) NOT NULL UNIQUE,
  contrasena_hash VARCHAR(255) NOT NULL,
  numero VARCHAR(20) NOT NULL UNIQUE,
  sexo ENUM('F','M'),
  fecha_nacimiento DATE,
  nombre_usuario VARCHAR(50) NOT NULL UNIQUE,
  usuario_proveedor VARCHAR(20) NOT NULL DEFAULT 'local',
  FOREIGN KEY (id_rol) REFERENCES rol(id_rol) ON DELETE RESTRICT
);


CREATE TABLE clientes (
  id_cliente INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_usuario INT NOT NULL UNIQUE,
  id_objetivo INT,
  observacion_objetivo VARCHAR(250),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
  FOREIGN KEY (id_objetivo) REFERENCES objetivo(id_objetivo) ON DELETE SET NULL
);


CREATE TABLE preferencia_entrenamiento (
  id_preferencia INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_cliente INT NOT NULL UNIQUE,
  entorno ENUM('Gimnasio','Casa','Aire libre','Mixto') NOT NULL,
  dias_semana VARCHAR(70) NOT NULL,  -- 'Lunes,Jueves'
  minutos_sesion SMALLINT NOT NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  CHECK (CHAR_LENGTH(dias_semana) > 0),
  CHECK (minutos_sesion > 0)
);


CREATE TABLE cliente_equipamiento (
  id_cliente_equipamiento INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_cliente INT NOT NULL,
  id_equipamiento INT NOT NULL,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  FOREIGN KEY (id_equipamiento) REFERENCES equipamiento(id_equipamiento) ON DELETE RESTRICT,
  UNIQUE (id_cliente, id_equipamiento)
);


-- ===========================================================
-- 3. FICHA MÉDICA
-- ===========================================================

CREATE TABLE ficha_medica (
  id_ficha INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_cliente INT NOT NULL UNIQUE,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE RESTRICT
);


CREATE TABLE mediciones (
  id_medicion INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_ficha INT NOT NULL,
  nivel_fisico ENUM('Alto', 'Medio', 'Bajo') NOT NULL,
  altura_cm DECIMAL(5,2) NOT NULL,
  peso_kg DECIMAL(5,1) NOT NULL,
  fecha_medicion DATETIME NOT NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_ficha) REFERENCES ficha_medica(id_ficha) ON DELETE CASCADE,
  CHECK (altura_cm > 0),
  CHECK (peso_kg > 0)
);


CREATE TABLE ficha_antecedente (
  id_ficha_antecedente INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_ficha INT NOT NULL,
  id_antecedente INT NOT NULL,
  FOREIGN KEY (id_ficha) REFERENCES ficha_medica(id_ficha) ON DELETE CASCADE,
  FOREIGN KEY (id_antecedente) REFERENCES antecedente(id_antecedente) ON DELETE RESTRICT,
  UNIQUE (id_ficha, id_antecedente)
);


CREATE TABLE cirugia (
  id_cirugia INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_ficha INT NOT NULL,
  descripcion TEXT,
  fecha_cirugia DATE,
  observaciones TEXT,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_ficha) REFERENCES ficha_medica(id_ficha) ON DELETE CASCADE
);


-- ===========================================================
-- 4. SUSCRIPCIONES Y PAGOS
-- ===========================================================

CREATE TABLE suscripcion (
  id_suscripcion INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_cliente INT NOT NULL,
  id_tipo_plan INT NOT NULL,
  fecha_inicio DATE,
  fecha_termino DATE,
  estado ENUM('Activa', 'Vencida', 'Cancelada', 'Pendiente') NOT NULL DEFAULT 'Activa',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE RESTRICT,
  FOREIGN KEY (id_tipo_plan) REFERENCES tipo_plan(id_tipo_plan) ON DELETE RESTRICT,
  CHECK (fecha_termino IS NULL OR fecha_inicio IS NULL OR fecha_termino >= fecha_inicio)
);


CREATE TABLE pago (
  id_pago INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_suscripcion INT NOT NULL,
  paypal_order_id VARCHAR(64) NULL,
  monto DECIMAL(10,2) NOT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'USD',
  fecha_pago DATE NOT NULL,
  estado ENUM('Pendiente', 'Pagado', 'Rechazado') NOT NULL DEFAULT 'Pendiente',
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_suscripcion) REFERENCES suscripcion(id_suscripcion) ON DELETE RESTRICT,
  UNIQUE KEY uq_pago_paypal_order (paypal_order_id),
  CHECK (monto > 0)
);


-- Deduplicación de notificaciones de PayPal.
CREATE TABLE webhook_evento (
  id_evento VARCHAR(64) PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- ===========================================================
-- 5. EJERCICIOS Y RUTINAS
-- ===========================================================

CREATE TABLE ejercicios (
  id_ejercicio INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  nombre VARCHAR(50) NOT NULL,
  descripcion TEXT,
  categoria VARCHAR(50),
  complejidad ENUM('Facil', 'Medio', 'Dificil') NOT NULL
);


CREATE TABLE ejercicio_restriccion (
  id_ejercicio_restriccion INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_ejercicio INT NOT NULL,
  id_antecedente INT NOT NULL,
  nivel_restriccion ENUM('PRECAUCION', 'NO_RECOMENDADO') NOT NULL,
  explicacion VARCHAR(255),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_ejercicio) REFERENCES ejercicios(id_ejercicio) ON DELETE RESTRICT,
  FOREIGN KEY (id_antecedente) REFERENCES antecedente(id_antecedente) ON DELETE RESTRICT,
  UNIQUE (id_ejercicio, id_antecedente)
);


CREATE TABLE ejercicio_objetivo (
  id_ejercicio_objetivo INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_ejercicio INT NOT NULL,
  id_objetivo INT NOT NULL,
  afinidad TINYINT NOT NULL,
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_ejercicio) REFERENCES ejercicios(id_ejercicio) ON DELETE RESTRICT,
  FOREIGN KEY (id_objetivo) REFERENCES objetivo(id_objetivo) ON DELETE RESTRICT,
  UNIQUE (id_ejercicio, id_objetivo),
  CHECK (afinidad BETWEEN 1 AND 5)
);


CREATE TABLE plan_entrenamiento (
  id_plan_entrenamiento INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_cliente INT NOT NULL,
  id_objetivo INT,
  fecha_inicio DATE,
  fecha_termino DATE,
  estado ENUM('Activo', 'Finalizado', 'Suspendido') NOT NULL DEFAULT 'Activo',
  observaciones VARCHAR(255),
  creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE RESTRICT,
  FOREIGN KEY (id_objetivo) REFERENCES objetivo(id_objetivo) ON DELETE SET NULL,
  CHECK (fecha_termino IS NULL OR fecha_inicio IS NULL OR fecha_termino >= fecha_inicio)
);


CREATE TABLE detalle_plan_entrenamiento (
  id_detalle_plan_entrenamiento INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_plan_entrenamiento INT NOT NULL,
  id_ejercicio INT NOT NULL,
  dia_semana ENUM('Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'),
  orden INT,
  series INT,
  repeticiones INT,
  duracion_segundos INT,
  descanso_segundos INT,
  intensidad ENUM('Baja', 'Media', 'Alta'),
  observacion TEXT,
  FOREIGN KEY (id_plan_entrenamiento) REFERENCES plan_entrenamiento(id_plan_entrenamiento) ON DELETE CASCADE,
  FOREIGN KEY (id_ejercicio) REFERENCES ejercicios(id_ejercicio) ON DELETE RESTRICT,
  CHECK (duracion_segundos IS NULL OR duracion_segundos > 0),
  CHECK (descanso_segundos IS NULL OR descanso_segundos >= 0),
  CHECK (series IS NULL OR series > 0),
  CHECK (repeticiones IS NULL OR repeticiones > 0),
  CHECK (orden IS NULL OR orden > 0)
);


CREATE TABLE recomendacion (
  id_recomendacion INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_ficha INT NOT NULL,
  id_ejercicio INT NOT NULL,
  estado_recomendacion ENUM('Disponible', 'Precaucion', 'Descartado') NOT NULL,
  motivo VARCHAR(255),
  fecha_recomendacion DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_ficha) REFERENCES ficha_medica(id_ficha) ON DELETE CASCADE,
  FOREIGN KEY (id_ejercicio) REFERENCES ejercicios(id_ejercicio) ON DELETE RESTRICT,
  UNIQUE (id_ficha, id_ejercicio)
);


-- ===========================================================
-- 6. LÍMITE SEMANAL DE SUGERENCIAS (PLAN GRATIS)
-- ===========================================================

-- Guarda hasta qué variante de la sugerencia del día llegó cada
-- cliente en la semana actual. El plan Premium no usa esta tabla.
CREATE TABLE uso_sugerencia (
  id_uso INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
  id_cliente INT NOT NULL,
  semana_inicio DATE NOT NULL,               -- lunes de la semana
  ultimo_indice TINYINT UNSIGNED NOT NULL DEFAULT 1,  -- 1..3
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE CASCADE,
  UNIQUE KEY uq_uso_sugerencia_semana (id_cliente, semana_inicio),
  KEY idx_uso_sugerencia_semana (semana_inicio)
);


-- ===========================================================
-- 7. ÍNDICES ADICIONALES
-- ===========================================================

CREATE INDEX idx_medicion_ficha_fecha ON mediciones (id_ficha, fecha_medicion);
CREATE INDEX idx_suscripcion_cliente_fechas ON suscripcion (id_cliente, fecha_inicio, fecha_termino, estado);
CREATE INDEX idx_pago_suscripcion_fecha ON pago (id_suscripcion, fecha_pago);
