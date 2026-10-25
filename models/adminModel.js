/* ===========================================
   MODELO DEL PANEL DE ADMINISTRACIÓN
   Usuarios, estado de cuenta, roles, Premium manual, métricas y auditoría.
   Requiere sql/migracion-superadmin.sql.
   =========================================== */
const pool = require('../config/db');

const PAGE_SIZE = 20;

/* ---------- Auditoría ---------- */

const registrar = async ({ actor, accion, entidad = null, idEntidad = null, detalle = null, ip = null }) => {
  try {
    await pool.query(
      `INSERT INTO auditoria (id_usuario_actor, rol_actor, accion, entidad, id_entidad, detalle, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actor ? actor.id_usuario : null, actor ? actor.rol : null, accion, entidad, idEntidad,
       detalle ? String(detalle).slice(0, 500) : null, ip]
    );
  } catch (err) {
    console.error('[auditoría] no se pudo registrar la acción:', err.message);
  }
};

const listAuditoria = async (page = 1, limit = PAGE_SIZE) => {
  const offset = (Math.max(1, page) - 1) * limit;
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM auditoria');
  const [rows] = await pool.query(
    `SELECT a.*, u.nombre, u.apellido, u.correo
       FROM auditoria a
       LEFT JOIN usuarios u ON u.id_usuario = a.id_usuario_actor
      ORDER BY a.id_auditoria DESC
      LIMIT ? OFFSET ?`,
    [limit, offset]
  );
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / limit)) };
};

/* ---------- Métricas ---------- */

const getStats = async () => {
  const [[u]] = await pool.query(
    `SELECT
       SUM(id_rol = 2 AND estado = 'Activo')     AS clientes,
       SUM(id_rol IN (1,3) AND estado = 'Activo') AS staff,
       SUM(estado = 'Bloqueado')                  AS bloqueados
     FROM usuarios`
  );
  const [[p]] = await pool.query(
    `SELECT COUNT(DISTINCT s.id_cliente) AS premium
       FROM suscripcion s
       INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan
      WHERE s.estado = 'Activa' AND tp.valor > 0
        AND (s.fecha_termino IS NULL OR s.fecha_termino >= CURDATE())`
  );
  const [[i]] = await pool.query(
    `SELECT COALESCE(SUM(monto), 0) AS ingresos
       FROM pago WHERE estado = 'Pagado' AND moneda = 'USD'`
  );
  const clientes = Number(u.clientes || 0);
  const premium = Number(p.premium || 0);
  return {
    clientes,
    staff: Number(u.staff || 0),
    bloqueados: Number(u.bloqueados || 0),
    premium,
    gratis: Math.max(0, clientes - premium),
    ingresosUsd: Number(i.ingresos),
  };
};

/* ---------- Usuarios ---------- */

const PLAN_SQL = `(SELECT MAX(tp.valor) FROM suscripcion s
                    INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan
                   WHERE s.id_cliente = c.id_cliente AND s.estado = 'Activa'
                     AND (s.fecha_termino IS NULL OR s.fecha_termino >= CURDATE()))`;

const listUsers = async ({ q = '', rol = '', estado = '', page = 1 }) => {
  const where = [];
  const args = [];
  if (q) {
    where.push('(u.nombre LIKE ? OR u.apellido LIKE ? OR u.correo LIKE ? OR u.nombre_usuario LIKE ?)');
    const like = `%${q}%`;
    args.push(like, like, like, like);
  }
  if ([1, 2, 3].includes(Number(rol))) { where.push('u.id_rol = ?'); args.push(Number(rol)); }
  if (['Activo', 'Bloqueado', 'Eliminado'].includes(estado)) { where.push('u.estado = ?'); args.push(estado); }
  else where.push("u.estado <> 'Eliminado'");

  const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (Math.max(1, page) - 1) * PAGE_SIZE;

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM usuarios u ${sqlWhere}`, args);
  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.nombre_usuario, u.id_rol, r.nombre_rol,
            u.estado, c.id_cliente, c.creado_en AS perfil_creado, ${PLAN_SQL} AS valor_plan
       FROM usuarios u
       INNER JOIN rol r ON r.id_rol = u.id_rol
       LEFT JOIN clientes c ON c.id_usuario = u.id_usuario
       ${sqlWhere}
      ORDER BY u.id_usuario DESC
      LIMIT ? OFFSET ?`,
    [...args, PAGE_SIZE, offset]
  );
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
};

const getUser = async (idUsuario) => {
  const [rows] = await pool.query(
    `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.numero, u.nombre_usuario, u.id_rol,
            r.nombre_rol, u.estado, u.eliminado_en, u.usuario_proveedor,
            c.id_cliente, c.creado_en AS perfil_creado, ${PLAN_SQL} AS valor_plan
       FROM usuarios u
       INNER JOIN rol r ON r.id_rol = u.id_rol
       LEFT JOIN clientes c ON c.id_usuario = u.id_usuario
      WHERE u.id_usuario = ?`,
    [idUsuario]
  );
  if (!rows.length) return null;
  const user = rows[0];
  user.suscripciones = [];
  user.pagos = [];
  if (user.id_cliente) {
    [user.suscripciones] = await pool.query(
      `SELECT s.id_suscripcion, tp.nombre_plan, s.estado, s.fecha_inicio, s.fecha_termino
         FROM suscripcion s INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan
        WHERE s.id_cliente = ? ORDER BY s.id_suscripcion DESC LIMIT 10`,
      [user.id_cliente]
    );
    [user.pagos] = await pool.query(
      `SELECT p.id_pago, p.monto, p.moneda, p.estado, p.fecha_pago
         FROM pago p INNER JOIN suscripcion s ON s.id_suscripcion = p.id_suscripcion
        WHERE s.id_cliente = ? ORDER BY p.id_pago DESC LIMIT 10`,
      [user.id_cliente]
    );
  }
  return user;
};

const setEstado = async (idUsuario, estado) => {
  const [r] = await pool.query(
    `UPDATE usuarios SET estado = ?, eliminado_en = ${estado === 'Eliminado' ? 'NOW()' : 'NULL'}
      WHERE id_usuario = ?`,
    [estado, idUsuario]
  );
  return r.affectedRows;
};

const setRol = async (idUsuario, idRol) => {
  const [r] = await pool.query('UPDATE usuarios SET id_rol = ? WHERE id_usuario = ?', [idRol, idUsuario]);
  return r.affectedRows;
};

const existeDuplicado = async ({ correo, nombre_usuario, numero }) => {
  const [rows] = await pool.query(
    'SELECT correo, nombre_usuario, numero FROM usuarios WHERE correo = ? OR nombre_usuario = ? OR numero = ? LIMIT 1',
    [correo, nombre_usuario, numero]
  );
  if (!rows.length) return null;
  if (rows[0].correo === correo) return 'Ese correo ya está registrado.';
  if (rows[0].nombre_usuario === nombre_usuario) return 'Ese nombre de usuario ya está en uso.';
  return 'Ese número ya está registrado.';
};

const createAdmin = async ({ nombre, apellido, correo, numero, nombre_usuario, contrasena_hash, idRol }) => {
  const [r] = await pool.query(
    `INSERT INTO usuarios (id_rol, nombre, apellido, correo, contrasena_hash, numero, nombre_usuario, usuario_proveedor)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'local')`,
    [idRol, nombre, apellido, correo, contrasena_hash, numero, nombre_usuario]
  );
  return r.insertId;
};

/* ---------- Premium manual ---------- */

/** Da Premium sin pago por `dias` días. Cancela otras suscripciones vigentes. */
const grantPremium = async (idCliente, dias) => {
  const [planes] = await pool.query(
    `SELECT id_tipo_plan FROM tipo_plan WHERE valor > 0
      ORDER BY (nombre_plan = 'Premium') DESC, valor ASC LIMIT 1`
  );
  if (!planes.length) throw new Error('No hay un plan de pago configurado en tipo_plan.');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE suscripcion SET estado = 'Cancelada'
        WHERE id_cliente = ? AND estado IN ('Activa', 'Pendiente')`,
      [idCliente]
    );
    await conn.query(
      `INSERT INTO suscripcion (id_cliente, id_tipo_plan, fecha_inicio, fecha_termino, estado)
       VALUES (?, ?, CURDATE(), DATE_ADD(CURDATE(), INTERVAL ? DAY), 'Activa')`,
      [idCliente, planes[0].id_tipo_plan, dias]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

/** Cancela el Premium vigente; el cliente vuelve al plan Gratis efectivo. */
const cancelPremium = async (idCliente) => {
  const [r] = await pool.query(
    `UPDATE suscripcion s INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan
        SET s.estado = 'Cancelada'
      WHERE s.id_cliente = ? AND s.estado IN ('Activa', 'Pendiente') AND tp.valor > 0`,
    [idCliente]
  );
  return r.affectedRows;
};

module.exports = {
  PAGE_SIZE, registrar, listAuditoria, getStats, listUsers, getUser,
  setEstado, setRol, existeDuplicado, createAdmin, grantPremium, cancelPremium,
};