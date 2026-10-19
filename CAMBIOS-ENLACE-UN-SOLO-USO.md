# Cambio propuesto: enlaces de recuperación de contraseña de un solo uso

> **Estado:** PENDIENTE DE APROBACIÓN
> **Fecha:** 19-10-2026
> **Archivos afectados:** 3 (1 configuración, 1 modelo, 1 controlador)
> **Base de datos:** sin cambios de esquema
> **Riesgo:** bajo — no afecta registro, login, perfil ni dashboard; solo el flujo de recuperación de contraseña

---

## 1. Problema reportado

Al usar un enlace de recuperación de contraseña y crear la contraseña nueva, **el enlace seguía funcionando** hasta que expiraba por tiempo (15 minutos). Cualquier persona con acceso al mismo enlace (por ejemplo, si el correo fue reenviado o el dispositivo quedó desbloqueado) podía volver a usarlo para cambiar la contraseña otra vez.

## 2. Causa raíz (verificada en el código)

En `config/recovery.js`, el token ya generaba un campo `jti` (identificador único del token), pero **nunca se guardaba ni se verificaba en ningún lado**. El flujo era:

| # | Paso | Comportamiento anterior |
|---|------|-------------------------|
| 1 | `forgotPassword` | Genera token con `{ uid, exp, jti }` firmado con HMAC-SHA256. |
| 2 | `verifyToken` | Solo verifica firma, expiración y `uid`. El `jti` se ignora. |
| 3 | `resetPassword` | Cambia la contraseña... pero no invalida el token usado. |

Un token era válido hasta que `exp` (expiración por tiempo) lo matara. No había ninguna condición que lo invalidara al usarlo.

## 3. Solución implementada

Se agregó una **huella de la contraseña vigente** (`pv`, de *password version*) dentro del token. Esa huella se calcula con HMAC-SHA256 usando `SESSION_SECRET`, sobre el hash bcrypt actual del usuario.

- La huella **no revela** la contraseña ni el hash (es un HMAC corto, firmado con un secreto que solo tiene el servidor).
- Al verificar el enlace, se compara la huella del token contra la huella de la contraseña actual, con `crypto.timingSafeEqual` (tiempo constante, sin fuga por timing).
- Como usar el enlace **cambia la contraseña** (`contrasena_hash`), la huella deja de coincidir y **todos los enlaces emitidos quedan muertos** al usarse el primero.

Sin tablas nuevas, sin `jti` almacenado, sin estado en el servidor. La "memoria" del token ya estaba en la contraseña misma.

### Bonus incluido

- Si en el futuro la contraseña se cambia por **otro medio** (ej. un futuro "editar contraseña" en el perfil), los enlaces de recuperación viejos también mueren automáticamente, por la misma razón.
- El correo de recuperación ahora avisa textualmente: "El enlace vence en X minutos **y solo puede usarse una vez**".

## 4. Detalle de cambios por archivo

### 4.1 `config/recovery.js` — huella de contraseña en el token

**Función nueva:**
```js
/** Huella corta de la contraseña actual: cambia cuando cambia la contraseña. */
const passwordVersion = (contrasenaHash) =>
  crypto.createHmac('sha256', secret()).update(String(contrasenaHash)).digest('hex').slice(0, 16);
```

**`createToken` — antes:**
```js
const createToken = (idUsuario) => {
  const payload = base64url(JSON.stringify({
    uid: Number(idUsuario),
    exp: Date.now() + TTL_MINUTES * 60 * 1000,
    jti: crypto.randomBytes(12).toString('hex'),
  }));
  return `${payload}.${sign(payload)}`;
};
```

**`createToken` — después:**
```js
const createToken = (idUsuario, contrasenaHash) => {
  const payload = base64url(JSON.stringify({
    uid: Number(idUsuario),
    exp: Date.now() + TTL_MINUTES * 60 * 1000,
    jti: crypto.randomBytes(12).toString('hex'),
    pv: passwordVersion(contrasenaHash),   // ← NUEVO
  }));
  return `${payload}.${sign(payload)}`;
};
```

**`verifyToken` — último retorno, antes:** `{ valid: true, idUsuario: data.uid }`
**Después:** `{ valid: true, idUsuario: data.uid, pv: typeof data.pv === 'string' ? data.pv : null }`

`pv` se extrae y se devuelve al controlador, que es quien decide si coincide o no (el módulo de recovery no debe hacer consultas SQL, mantiene su rol de "config pura").

Se exporta `passwordVersion` para que el controlador pueda recalcular la huella esperada.

### 4.2 `models/userModels.js` — nueva función `findById`

```js
const findById = async (id_usuario) => {
  const [rows] = await pool.query('SELECT * FROM usuarios WHERE id_usuario = ?', [id_usuario]);
  return rows[0] || null;
};
```

Se necesita para traer el `contrasena_hash` **vigente** del usuario y compararlo con la huella del token. Consulta con marcador `?` (sin inyección SQL), sobre la PRIMARY KEY `id_usuario`. Agregada a los exports.

### 4.3 `controllers/authRecoverySocialController.js` — verificación en ambos puntos

**Función nueva (helper):**
```js
/** Devuelve el motivo por el que el token no sirve, o null si es válido. */
const motivoTokenInvalido = (verificacion, usuario) => {
  if (!usuario) return 'El enlace no es válido. Solicita uno nuevo.';

  const esperada = Buffer.from(recovery.passwordVersion(usuario.contrasena_hash));
  const recibida = verificacion.pv ? Buffer.from(verificacion.pv) : null;

  const coincide =
    recibida &&
    recibida.length === esperada.length &&
    crypto.timingSafeEqual(esperada, recibida);

  // Si la contraseña ya cambió (por este enlace u otro medio), la huella no coincide.
  return coincide ? null : 'Este enlace ya fue utilizado. Solicita uno nuevo.';
};
```

**Punto 1 — `showResetPassword` (GET):** ahora es `async`, verifica el token **y** la huella contra la BD antes de mostrar el formulario. Si no coincide, renderiza la misma vista "Enlace no válido" que ya existía (con el `reason` adecuado). Si la consulta a la BD falla, muestra un mensaje de "No pudimos verificar el enlace" sin dejar al usuario en una pantalla rota (dentro de `try/catch`).

**Punto 2 — `resetPassword` (POST):** hace la misma verificación **antes** de encriptar y guardar la contraseña nueva. Si la huella no coincide, responde `400` con el mensaje y **no cambia la contraseña**.

**Llamada de emisión:** `forgotPassword` ahora pasa el hash vigente: `recovery.createToken(user.id_usuario, user.contrasena_hash)`.

**Correo:** texto y HTML actualizados con "...y solo puede usarse una vez".

## 5. Flujo antes vs. después

| Escenario | Antes | Después |
|---|---|---|
| Pedir enlace, usarlo, crear contraseña nueva | Contraseña cambiada; **enlace sigue vivo 15 min** ❌ | Contraseña cambiada; enlace y todos los anteriores **mueren** ✔ |
| Reusar el mismo enlace tras cambiar la contraseña | Permitía cambiar la contraseña otra vez ❌ | "Este enlace ya fue utilizado. Solicita uno nuevo." ✔ |
| Pedir 2 enlaces y usar el segundo | Ambos válidos hasta expirar | El usado muere; el otro sigue vivo hasta expirar o usarse |
| Token con firma inválida o expirado | Rechazado (igual que antes) | Rechazado (sin cambio) |
| Cambiar la contraseña por otro medio futuro | Los enlaces viejos seguían vivos | Todos los enlaces viejos mueren automáticamente ✔ |

## 6. Decisiones de diseño (y alternativas descartadas)

- **Tabla `token_recuperacion` con `usado_en`** — descartada por ahora: exige cambio de esquema (migración + actualizar `sql/schema.sql`), limpieza de filas vencidas, y el repo ya arrastra deuda de esquema (falta `usuario_proveedor`). La huella en el token logra lo mismo sin estado.
- **Borrar el `jti` del token** — se dejó: no estorba, mantiene el token no repetible entre emisiones y sirve para logs si algún día se quiere trazar.
- **Verificar la huella dentro de `config/recovery.js`** — descartado: `recovery.js` es configuración pura sin SQL. La comparación vive en el controlador, que ya es quien toca el modelo (regla MVC del proyecto).
- **Mismo mensaje para todo** — se decidió distinguir "ya fue utilizado" de "no es válido": ayuda al usuario a entender que debe pedir un enlace nuevo, y no filtra información sensible.

## 7. Compatibilidad con enlaces ya emitidos

Los enlaces enviados **antes de este deploy** no tienen el campo `pv`, así que serán rechazados con "El enlace no es válido. Solicita uno nuevo." Afecta máximo a correos enviados en los últimos 15 minutos (la TTL del token). Es un efecto aceptado y hasta deseable: fuerza a pedir un enlace fresco tras el despliegue.

## 8. Pruebas realizadas

Se ejecutó prueba funcional real (sin BD) contra `config/recovery.js` con `SESSION_SECRET` del `.env`:

```
token valido: true | uid: 5 | pv presente: true
misma password -> coincide: true      ← el enlace funciona
password cambiada -> coincide: false  ← el enlace muere
token corrupto: false -> "El enlace no es válido."
```

Sintaxis verificada con `node --check` en los 3 archivos.

### Checklist manual (requiere BD y correo, o `MAIL_ENABLED=false` para ver el enlace en consola)

1. `npm run dev`, pedir enlace en `/forgot-password` con una cuenta `local`.
2. Abrir el enlace → el formulario "Crear nueva contraseña" debe cargar normal.
3. Crear la contraseña nueva → éxito.
4. **Volver a abrir el mismo enlace** → debe decir "Este enlace ya fue utilizado" (antes decía "Crear nueva contraseña").
5. Pedir un enlace nuevo → debe funcionar de nuevo (la contraseña nueva ya es la vigente).
6. Login con la contraseña nueva → OK.

## 9. Cómo REVERTIR este cambio (si no se aprueba)

**Opción A — total (recomendada):** si aún no se commitea:

```bash
git status    # verificar modificados: config/recovery.js, models/userModels.js,
              # controllers/authRecoverySocialController.js
git restore config/recovery.js models/userModels.js controllers/authRecoverySocialController.js
rm CAMBIOS-ENLACE-UN-SOLO-USO.md
```

Si ya se commiteó: `git revert <hash-del-commit>`.

**Opción B — parcial:** si se quiere conservar `findById` (es inocuo y puede servir a futuro), basta con quitar la comparación de `pv` en `motivoTokenInvalido` (hacerla retornar siempre `null`) y la llamada en `showResetPassword`; el token volvería a valer hasta expirar.

Ningún cambio toca la base de datos, `app.js`, las rutas, la sesión, login ni el perfil: la reversión no deja efectos residuales.
