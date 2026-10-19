# Cambio propuesto: no repetir el wizard de perfil al iniciar sesión

> **Estado:** PENDIENTE DE APROBACIÓN
> **Fecha:** 19-10-2026
> **Archivos afectados:** 5 (2 controladores, 1 modelo, 1 script de cliente, 1 vista)
> **Base de datos:** sin cambios de esquema
> **Riesgo:** bajo — si se aprueba y algo falla, la reversión es total y automática (ver sección final)

---

## 1. Problema reportado

Al iniciar sesión con una cuenta que **ya completó** el wizard de perfil de
entrenamiento (5 pasos: datos básicos → nivel/objetivos → limitaciones →
entorno/equipamiento → tiempo), la aplicación **vuelve a pedir todos los datos**
como si nunca los hubiera ingresado.

## 2. Causa raíz (verificada en el código)

En toda la aplicación **no existía ninguna verificación de "¿el perfil ya fue
completado?"**. La cadena era:

| # | Archivo | Comportamiento anterior |
|---|---------|-------------------------|
| 1 | `controllers/authControllers.js` → `login` | Valida credenciales, regenera la sesión y responde `{ success: true }` sin consultar si el usuario ya tiene perfil. |
| 2 | `public/js/login.js` | Ante `success`, redirige **siempre** a `window.location.href = "/profile"`. |
| 3 | `routes/authRoutes.js` → `showProfile` | `GET /profile` renderiza el wizard **incondicionalmente**. |
| 4 | `middlewares/authMiddlewares.js` → `redirectIfAuth` | Cualquier usuario logueado que visite `/login` o `/register` también termina en `/profile` (wizard). |

La tabla `clientes` de la BD ya contiene la señal necesaria: **`id_usuario` es
UNIQUE**, por lo que *existe fila en `clientes` ⇒ el usuario ya completó el
wizard*. No hacía falta agregar columnas, tablas ni flags de sesión.

## 3. Solución implementada

Se agregó una única fuente de verdad (`hasProfile()` contra la tabla `clientes`)
y se usó en los tres puntos donde el usuario es dirigido tras autenticarse:

1. **Modelo** — nueva consulta `hasProfile(idUsuario)`.
2. **Login (correo/contraseña)** — el servidor calcula el destino y lo devuelve
   en la respuesta JSON (`redirect: '/dashboard' | '/profile'`); el JS del
   cliente lo usa en vez del hardcode.
3. **Login con Google** — el callback calcula el mismo destino antes de crear la
   sesión.
4. **`GET /profile`** — redirige a `/dashboard` si el perfil ya existe, salvo que
   se pida edición explícita con `?edit=1` (necesario para no romper el menú
   "Mi perfil" del dashboard).

## 4. Detalle de cambios por archivo

### 4.1 `models/profileModel.js` — nueva función + export

**Por qué:** el modelo es el único lugar con acceso a MySQL (regla MVC del
proyecto). La consulta es sobre una columna UNIQUE, indexada por definición.

```js
// NUEVO (antes del module.exports)
/**
 * Devuelve el id_cliente del usuario, o null si aún no completó su perfil.
 * Una fila en `clientes` equivale a "wizard completado" (id_usuario es UNIQUE).
 */
const hasProfile = async (idUsuario) => {
  const [rows] = await pool.query('SELECT id_cliente FROM clientes WHERE id_usuario = ?', [idUsuario]);
  return rows.length ? rows[0].id_cliente : null;
};
```

Se agregó `hasProfile` al objeto exportado. Consulta con marcador `?` (sin
posible inyección SQL), coste: una lectura por índice único.

### 4.2 `controllers/authControllers.js` — `showProfile` ahora decide

**Antes (línea 13):**
```js
const showProfile = (req, res) => res.render('post/profile', { usuario: req.session.usuario });
```

**Después:**
```js
const showProfile = async (req, res) => {
  try {
    // ?edit=1 fuerza el wizard aunque el perfil ya exista (menú "Mi perfil").
    if (req.query.edit === undefined) {
      const idCliente = await ProfileModel.hasProfile(req.session.usuario.id_usuario);
      if (idCliente) return res.redirect('/dashboard');
    }
    res.render('post/profile', { usuario: req.session.usuario });
  } catch (err) {
    // Si falla la consulta no bloqueamos al usuario: mostramos el wizard.
    console.error('[profile] error al verificar el perfil:', err.message);
    res.render('post/profile', { usuario: req.session.usuario });
  }
};
```

- `async/await` + `try/catch` (reglas del proyecto).
- **Fail-open deliberado:** si la BD falla, se muestra el wizard en vez de un
  error, porque el guardado del wizard es un *upsert* y reenviarlo no rompe nada.

### 4.3 `controllers/authControllers.js` — `login` calcula el destino

**Antes:** solo respondía `{ success, message }`.

**Después:**
```js
// Si ya completó el wizard (existe fila en clientes), el destino es el dashboard.
const idCliente = await ProfileModel.hasProfile(usuario.id_usuario);
const destino = idCliente ? '/dashboard' : '/profile';
// ...dentro del callback de regenerate:
res.json({ success: true, message: 'Inicio de sesión exitoso.', redirect: destino });
```

Se consulta **antes** de regenerar la sesión (solo lectura, sin efecto sobre la
cookie). El campo `redirect` es **aditivo**: cualquier cliente que lo ignore
recibe exactamente la misma respuesta de antes.

### 4.4 `controllers/authRecoverySocialController.js` — coherencia con Google

**Antes (googleCallback):**
```js
if (user) {
  return startSession(req, res, user, '/profile');
}
```

**Después:**
```js
if (user) {
  const idCliente = await ProfileModel.hasProfile(user.id_usuario);
  return startSession(req, res, user, idCliente ? '/dashboard' : '/profile');
}
```

`startSession` no se tocó (ya recibía `destination` como parámetro). El caso
`completeRegistration` (usuario **nuevo** de Google) sigue yendo a `/profile`,
que es correcto: no tiene fila en `clientes`.

### 4.5 `public/js/login.js` — usar el destino del servidor

**Antes:**
```js
window.location.href = "/profile";
```

**Después:**
```js
window.location.href = (r.data && r.data.redirect) || "/profile";
```

Si el servidor no envía `redirect` (versión vieja, caché), cae al comportamiento
anterior (`/profile`), que con el punto 4.2 rebota a `/dashboard` igualmente.

### 4.6 `views/post/dashboard.ejs` — menú "Mi perfil" apunta a edición

**Antes:** `{ href: '/profile', texto: 'Mi perfil' }`
**Después:** `{ href: '/profile?edit=1', texto: 'Mi perfil' }`

Sin este cambio, "Mi perfil" quedaría en bucle `/profile → /dashboard`. Con
`?edit=1` el wizard abre igual que siempre para editar los datos. `saveProfile`
ya estaba diseñado como upsert (actualiza `clientes`, agrega una medición al
historial y reemplaza antecedentes/cirugías/equipamiento), así que guardarse de
nuevo es seguro.

## 5. Flujo antes vs. después

| Escenario | Antes | Después |
|---|---|---|
| Usuario nuevo: registro → login | `/profile` (wizard) | `/profile` (wizard) — **igual** |
| Usuario existente con perfil: login | `/profile` (wizard otra vez ❌) | `/dashboard` directo ✔ |
| Usuario logueado visita `/login` o `/register` | wizard otra vez ❌ | rebota a `/dashboard` ✔ |
| Google, cuenta existente con perfil | wizard otra vez ❌ | `/dashboard` directo ✔ |
| Google, cuenta nueva | `/profile` (wizard) | `/profile` (wizard) — **igual** |
| Menú "Mi perfil" del dashboard | wizard (editable) | wizard con `?edit=1` (editable) — **igual** |

## 6. Decisiones de diseño (y alternativas descartadas)

- **Flag en sesión (`perfil_completado`)** — descartado: se desincroniza (BD
  cambia en otra sesión/tabla, o la sesión se pierde y al relogin el flag se
  recrea sin consultar). La consulta a BD es una lectura por índice UNIQUE, costo
  despreciable, y siempre es correcta.
- **Solo el redirect en `GET /profile`, sin tocar el login** — descartado: el
  usuario vería un parpadeo `/login → /profile → /dashboard` (dos saltos).
- **No se tocó `redirectIfAuth`** — apunta a `/profile` y con el punto 4.2 ya
  rebota solo; tocarlo agregaría acoplamiento sin necesidad.

## 7. Cómo probar (checklist manual)

1. `npm run dev`, crear cuenta nueva con `/register`.
2. Login → debe abrirse el **wizard** (paso 1 de 5). Completarlo → `/dashboard`.
3. Cerrar sesión → login de nuevo → debe ir **directo a `/dashboard`** sin wizard.
4. En `/dashboard`, menú avatar → "Mi perfil" → debe abrir el **wizard**.
5. (Si está configurado) Google con cuenta existente con perfil → `/dashboard`.
6. Visitar `http://localhost:6767/login` estando logueado → `/dashboard`.

## 8. Limitación conocida (no incluida en este cambio)

Al entrar vía "Mi perfil" (`?edit=1`), el wizard **arranca vacío** en lugar de
precargar lo guardado. Editar y guardar de nuevo funciona bien (upsert), pero los
campos no muestran los valores previos. Precargarlos requiere pasar los datos del
modelo a la vista y pintar el estado del wizard en `public/js/profile.js`; se
propone como cambio aparte si se aprueba este.

## 9. Cómo REVERTIR este cambio (si no se aprueba)

**Opción A — total (recomendada):** como los archivos aún no se commitearon:

```bash
git status                       # verificar los 5 archivos modificados
git restore models/profileModel.js controllers/authControllers.js ^
             controllers/authRecoverySocialController.js ^
             public/js/login.js views/post/dashboard.ejs
rm CAMBIOS-PERFIL-COMPLETADO.md  # este documento
```

**Opción B — parcial:** si algo específico molesta (por ejemplo, no se quiere el
redirect automático pero sí poder editar):

- Quitar solo el auto-redirect del login: basta con ignorar el campo `redirect`
  en `login.js` (línea `window.location.href = (r.data && ...)`) o responder
  siempre `redirect: '/profile'` en `authControllers.js`.
- Quitar solo el guard de `GET /profile`: eliminar el bloque `if
  (req.query.edit === undefined) {...}` en `showProfile`.

Ningún cambio toca la base de datos, `app.js`, las rutas ni la sesión, por lo
que la reversión no deja efectos residuales.
