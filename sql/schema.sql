	CREATE DATABASE geko;
	USE geko;
 

	CREATE TABLE rol (
		id_rol INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
		estado BOOL DEFAULT 1,
		nombre_rol VARCHAR(50) NOT NULL UNIQUE
	);

INSERT INTO rol (nombre_rol) VALUES
  ('admin'),
  ('cliente');
SELECT * FROM rol;

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
		nombre_usuario VARCHAR(50) not null UNIQUE,
		usuario_proveedor VARCHAR(20) NOT NULL DEFAULT 'local',
		FOREIGN KEY (id_rol) REFERENCES rol(id_rol) ON DELETE RESTRICT
	);

select * from usuarios;

/* Cuenta de admin*/
INSERT INTO usuarios (id_rol, nombre, apellido, correo, contrasena_hash, numero, nombre_usuario)
VALUES (1, 'Geko', 'Fitness', 'geko.training@gmail.com', '$2b$10$LxeXMWSGrXPu6zFfvIf2qeNSgpfag72R8fym6mcNQhui93Rpu26Ca', '+56932927405', 'GEKO_admin');

/*DELETE FROM clientes WHERE id_usuario > 0;
DELETE FROM usuarios WHERE id_usuario > 0;
ALTER TABLE clientes AUTO_INCREMENT = 1;
ALTER TABLE usuarios AUTO_INCREMENT = 1;*/

	CREATE TABLE antecedente (
		id_antecedente INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
		nombre VARCHAR(50) NOT NULL UNIQUE,
		categoria VARCHAR(50),
		descripcion VARCHAR(255)
	);



	CREATE TABLE objetivo (
		id_objetivo INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
		nombre_objetivo VARCHAR(50) NOT NULL UNIQUE
	);



	CREATE TABLE clientes (
		id_cliente INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
		id_usuario INT NOT NULL unique,
		id_objetivo INT,
		observacion_objetivo VARCHAR(250),
		creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
		actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE RESTRICT,
		FOREIGN KEY (id_objetivo) REFERENCES objetivo(id_objetivo) ON DELETE SET NULL
	);



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
		descripcion text,
		fecha_cirugia DATE,
		observaciones text,
		creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (id_ficha) REFERENCES ficha_medica(id_ficha) ON DELETE CASCADE
	);


	CREATE TABLE tipo_plan (
		id_tipo_plan INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
		nombre_plan VARCHAR(50) NOT NULL UNIQUE,
		valor DECIMAL(10,2) NOT NULL,
		CHECK (valor >= 0)
	);


	CREATE TABLE suscripcion (
		id_suscripcion INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
		id_cliente INT NOT NULL,
		id_tipo_plan INT NOT NULL,
		fecha_inicio DATE,
		fecha_termino DATE,
		estado ENUM('Activa', 'Vencida', 'Cancelada') NOT NULL DEFAULT 'Activa',
		creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
		actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente) ON DELETE RESTRICT,
		FOREIGN KEY (id_tipo_plan) REFERENCES tipo_plan(id_tipo_plan) ON DELETE RESTRICT,
		CHECK (fecha_termino IS NULL OR fecha_inicio IS NULL OR fecha_termino >= fecha_inicio)
	);


	CREATE TABLE pago (
		id_pago INT PRIMARY KEY AUTO_INCREMENT NOT NULL,
		id_suscripcion INT NOT NULL,
		monto DECIMAL(10,2) NOT NULL,
		fecha_pago DATE NOT NULL,
		estado ENUM('Pendiente', 'Pagado', 'Rechazado') NOT NULL DEFAULT 'Pendiente',
		creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
		actualizado_en DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (id_suscripcion) REFERENCES suscripcion(id_suscripcion) ON DELETE RESTRICT,
		CHECK (monto > 0)
	);


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


	CREATE INDEX idx_medicion_ficha_fecha ON mediciones (id_ficha, fecha_medicion);
	CREATE INDEX idx_suscripcion_cliente_fechas ON suscripcion (id_cliente, fecha_inicio, fecha_termino, estado);
	CREATE INDEX idx_pago_suscripcion_fecha ON pago (id_suscripcion, fecha_pago);


	SELECT
		u.nombre, u.apellido, u.correo, tp.nombre_plan, tp.valor, s.fecha_inicio, s.fecha_termino
	FROM clientes c
	INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
	INNER JOIN suscripcion s ON s.id_cliente = c.id_cliente
	INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan;

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

	SELECT
		u.nombre, u.apellido,
		c2.descripcion, c2.fecha_cirugia, c2.observaciones
	FROM ficha_medica f
	INNER JOIN clientes c ON f.id_cliente = c.id_cliente
	INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
	INNER JOIN cirugia c2 ON c2.id_ficha = f.id_ficha;

	SELECT DISTINCT e.nombre, er.nivel_restriccion, er.explicacion
	FROM ficha_antecedente fa
	INNER JOIN ejercicio_restriccion er ON er.id_antecedente = fa.id_antecedente
	INNER JOIN ejercicios e ON e.id_ejercicio = er.id_ejercicio
	WHERE fa.id_ficha = 1
	  AND er.nivel_restriccion = 'NO_RECOMENDADO';

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

	SELECT c.id_cliente, u.nombre, u.apellido, p.monto, p.fecha_pago, p.estado
	FROM pago p
	INNER JOIN suscripcion s ON p.id_suscripcion = s.id_suscripcion
	INNER JOIN clientes c ON s.id_cliente = c.id_cliente
	INNER JOIN usuarios u ON c.id_usuario = u.id_usuario
	ORDER BY p.fecha_pago DESC;

	SELECT
		e.id_ejercicio,
		e.nombre AS ejercicio,
		eo.afinidad,
		CASE
			WHEN er.nivel_restriccion = 'NO_RECOMENDADO' THEN 'Descartado'
			WHEN er.nivel_restriccion = 'PRECAUCION' THEN 'Con precaucion'
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
