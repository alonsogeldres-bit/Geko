# Cambio propuesto: página `/configuracion` para editar el perfil

> **Estado:** IMPLEMENTADO — pendiente de commit
> **Fecha:** 19-10-2026
> **Archivos afectados:** 8 (4 modificados, 4 nuevos)
> **Base de datos:** sin cambios de esquema (solo consultas de lectura nuevas)
> **Riesgo:** bajo — no toca login, registro, recuperación de contraseña ni el wizard de primer uso; solo agrega una ruta de lectura y una vista que reutiliza el endpoint de guardado existente

---

## 1. Problema reportado

El usuario quería **ver y editar sus datos de perfil** desde una página propia (`/configuracion`), porque hasta ahora no había forma de hacerlo:

- El wizard de `/profile` **solo se mostraba una vez** (al completar el perfil). Volver a entrar redirigía al dashboard.
- El ítem "Mi perfil" del menú del avatar apuntaba a `/profile?edit=1`, que **abría el wizard vacío** aunque ya hubiera datos guardados (esto era el error **E20** del inventario).

## 2. Causa raíz

El wizard era *solo de escritura*: `profile.js` arrancaba siempre con un `state` vacío y `showProfile` nunca consultaba la BD para precargar nada. No existía ninguna consulta de lectura de perfil completo (solo `hasProfile`, que devuelve un booleano).

## 3. Solución implementada

Se agregó **solo el camino de lectura**, respetando el MVC del proyecto:

```
GET  /configuracion   →  requireAuth  →  showConfig  →  profileModel.getProfileByUser  →  configuracion.ejs
                                                                                              │
                                                                                    (embebe el perfil)
                                                                                              ▼
                                                                                configuracion.js
                                                                                              │
                                                          POST /profile  ◀────────────────────┘
                                                              │
                                                    validateProfile  →  saveProfile  (el MISMO del wizard)
```

**La clave del diseño:** el guardado **no se duplica**. `/configuracion` envía los datos al `POST /profile` que ya existía (mismo `validateProfile`, misma transacción, mismas tablas). Lo nuevo es únicamente leer el perfil y pintarlo.

## 4. Detalle de cambios por archivo

### 4.1 `models/profileModel.js` — nueva función `getProfileByUser` (NUEVO código)

Lee el perfil completo en **una sola conexión** (consistencia entre tablas) y lo devuelve con la **misma forma que espera el wizard**, con las claves ya invertidas.

```js
const getProfileByUser = async (idUsuario) => {
  const conn = await pool.getConnection();
  try {
    // 1) datos base: sexo + objetivo (LEFT JOIN: el cliente puede no tener objetivo/activo)
    const [filas] = await conn.query(
      `SELECT u.sexo, c.id_cliente, o.nombre_objetivo, c.observacion_objetivo
         FROM usuarios u
         LEFT JOIN clientes c ON c.id_usuario = u.id_usuario
         LEFT JOIN objetivo o ON o.id_objetivo = c.id_objetivo
        WHERE u.id_usuario = ?`, [idUsuario]);

    if (!filas.length || !filas[0].id_cliente) return null;   // sin perfil

    const fila = filas[0];
    const idCliente = fila.id_cliente;

    // 2) ficha médica → última medición, antecedentes y cirugías
    const [fichas] = await conn.query('SELECT id_ficha FROM ficha_medica WHERE id_cliente = ?', [idCliente]);
    const idFicha = fichas.length ? fichas[0].id_ficha : null;

    let medicion = null, antecedentes = [], cirugias = [];
    if (idFicha) {
      const [meds] = await conn.query(
        `SELECT nivel_fisico, altura_cm, peso_kg FROM mediciones
          WHERE id_ficha = ? ORDER BY fecha_medicion DESC, id_medicion DESC LIMIT 1`, [idFicha]);
      medicion = meds[0] || null;

      const [ants] = await conn.query(
        `SELECT a.nombre FROM ficha_antecedente fa
           INNER JOIN antecedente a ON a.id_antecedente = fa.id_antecedente
          WHERE fa.id_ficha = ?`, [idFicha]);
      antecedentes = ants.map((r) => r.nombre);

      const [cirs] = await conn.query(
        { sql: 'SELECT descripcion, fecha_cirugia, observaciones FROM cirugia WHERE id_ficha = ? ORDER BY fecha_cirugia',
          dateStrings: true }, [idFicha]);
      cirugias = cirs.map((c) => ({ descripcion: c.descripcion || '', fecha: c.fecha_cirugia || '', observaciones: c.observaciones || '' }));
    }

    // 3) preferencias y equipamiento
    const [prefs]   = await conn.query('SELECT entorno, dias_semana, minutos_sesion FROM preferencia_entrenamiento WHERE id_cliente = ?', [idCliente]);
    const [equips]  = await conn.query(
      `SELECT e.nombre FROM cliente_equipamiento ce
         INNER JOIN equipamiento e ON e.id_equipamiento = ce.id_equipamiento
        WHERE ce.id_cliente = ?`, [idCliente]);

    return { /* ...formato del wizard... */ };
  } finally {
    conn.release();          // errores se propagan; el controlador los captura
  }
};
```

**Puntos técnicos destacados:**

- `dateStrings: true` en la consulta de cirugías: los `DATE` llegan como `'YYYY-MM-DD'` y **no se corren un día** por zona horaria (un `Date` de JS los interpreta como UTC y en Argentina/España podía restar un día).
- El último valor de altura/peso/nivel se toma del **registro más reciente** de `mediciones` (`ORDER BY fecha_medicion DESC, id_medicion DESC LIMIT 1`), que es lo que el usuario ve como "su perfil actual".
- `Number(...)` sobre los `DECIMAL` (mysql2 los devuelve como string, ej. `"175.00"`).

### 4.2 Conversión BD → formulario (mapas inversos)

El wizard guarda claves en español; la BD usa códigos/etiquetas. Se invierten:

| Dato | En la BD | En el formulario |
|---|---|---|
| Sexo | `'M'` / `'F'` / `NULL` | `masculino` / `femenino` / `otro` |
| Nivel | `'Bajo'` / `'Medio'` / `'Alto'` | `principiante` / `intermedio` / `avanzado` |
| Objetivo | `'Perder grasa'`, … | `perder_grasa`, … |
| Entorno | `'Gimnasio'`, … | `gimnasio`, … |

```js
const SEX_INV = { M: 'masculino', F: 'femenino' };
const invertir = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [v, k]));
const LEVELS_INV = invertir(LEVELS);
const GOALS_INV  = invertir(GOALS);
const ENVIRONMENTS_INV = invertir(ENVIRONMENTS);
```

Nota: `SEX` no se invierte con `invertir()` porque su valor `otro` es `null` (clave inválida); se mapea a mano y `NULL` cae en `'otro'`.

### 4.3 `controllers/profileController.js` — nuevo `showConfig`

```js
const showConfig = async (req, res) => {
  try {
    const perfil = await ProfileModel.getProfileByUser(req.session.usuario.id_usuario);
    if (!perfil) return res.redirect('/profile');     // sin perfil → al wizard
    res.render('post/configuracion', { perfil });
  } catch (err) {
    console.error('[configuración] error al cargar el perfil:', err.message);
    res.status(500).send('No pudimos cargar tu configuración. Inténtalo de nuevo.');
  }
};
module.exports = { showConfig, saveProfile };
```

`saveProfile` quedó **intacto**.

### 4.4 `routes/profileRoutes.js` — nueva ruta GET

```js
const { requireAuth, requireAuthApi } = require('../middlewares/authMiddlewares');

router.get('/configuracion', requireAuth, profileController.showConfig);   // ← NUEVO
router.post('/profile', requireAuthApi, validateProfile, profileController.saveProfile);
```

`requireAuth` (no `requireAuthApi`): la ruta es una **página**, así que sin sesión redirige a `/login` en vez de devolver 401.

### 4.5 `views/post/configuracion.ejs` (NUEVO)

Página única con secciones (Datos básicos · Nivel y objetivos · Limitaciones médicas · Entreno · Tiempo), reutilizando las **mismas clases** del wizard (`segmented`, `chip`, `level-option`, `input`, `field-error`, `surgery-card`…), por lo que el aspecto es idéntico. Carga `profile.css` + `configuracion.css`.

```html
<script>window.__PERFIL__ = <%- JSON.stringify(perfil).replace(/</g, '\\u003c') %>;</script>
<script src="/js/configuracion.js" defer></script>
```

El `.replace(/</g, '\u003c')` evita que un `<` en un texto del usuario (ej. una observación) rompa el `<script>` (defensa ante XSS/HTML injection).

### 4.6 `public/js/configuracion.js` (NUEVO)

- Lee `window.__PERFIL__` y arma el `state` inicial (mismos nombres del wizard).
- **Pinta la selección guardada**: `marcarSeleccionado()` y `marcarMulti()` aplican `.active` / `.level-option-active` / `.chip-active` a los botones que correspondan.
- Conserva el comportamiento de los chips exclusivos: **"Ninguna" / "Ninguno"** deshabilita el resto y, si venía guardado, arranca deshabilitado desde el inicio.
- **Cirugías**: reproduce la precarga (no solo el alta) y el límite de 10.
- **Validación antes de guardar** (mismas reglas del wizard): altura 100–250, peso 30–300, ≥1 objetivo, ≥1 equipamiento, descripción de cirugía obligatoria y fecha no futura.
- **Guardado**: `fetch('/profile', { method:'POST', ... })` con JSON. Maneja 401 (→ `/login`), error de negocio y caída de red. Al ir bien muestra alerta verde "Cambios guardados" y actualiza `window.__PERFIL__`.

### 4.7 `public/css/configuracion.css` (NUEVO)

Layout de tarjetas de sección (`.config-section`, `.config-section-title`), acciones (`.config-actions`) y la caja de alerta (`.config-alert` con variantes `error` / `success`).

Incluye una regla necesaria:

```css
/* display:flex anula el atributo hidden; hay que forzarlo (igual que login.css). */
.config-alert[hidden] { display: none; }
```

Sin ella, el `display: flex` del alert le gana al `display:none` que el navegador aplica a `[hidden]` y la alerta aparecería visible al cargar. `login.css` ya resolvía el mismo problema con `.auth-alert[hidden]`.

### 4.8 `views/post/dashboard.ejs` — se quitó "Mi perfil"

Por decisión del usuario, el menú del avatar queda **solo con "Configuración"** (que ahora sí funciona); se eliminó el ítem "Mi perfil" → `/profile?edit=1`.

```js
const menu = [
  { href: '/configuracion', icono: '', texto: 'Configuración' },
  { href: '#',              icono: '', texto: 'Mi progreso',  pronto: true },
  { href: '#',              icono: '', texto: 'Ayuda',        pronto: true }
];
```

### 4.9 `ERRORES-PENDIENTES.md` — E20 → Resueltos

Se quitó **E20** de la lista de pendientes y se agregó como **R3** en la tabla de resueltos. También se quitó E20 del "Orden sugerido de ataque".

## 5. Flujo antes vs. después

| Escenario | Antes | Después |
|---|---|---|
| Editar mis datos | "Mi perfil" abría el wizard **vacío** ❌ | `/configuracion` carga **tus datos actuales** ✔ |
| ¿Dónde? | Escondido en el menú, sin link real | Ítem claro "Configuración" en el menú del avatar ✔ |
| Guardar | El wizard creaba un perfil/medición nueva | El mismo `POST /profile`, con validación y confirmación en pantalla ✔ |
| Validación | Solo en el wizard de alta | Mismas reglas, revalidadas **antes** de guardar ✔ |
| Usuario sin perfil | — | `/configuracion` redirige a `/profile` (no hay nada que editar) ✔ |
| Seguridad | — | Ruta protegida con `requireAuth`; guardado con `validateProfile`; SQL parametrizado ✔ |

## 6. Decisiones de diseño (y alternativas descartadas)

- **Reutilizar `POST /profile`** en vez de crear un `PUT /profile` nuevo: evita duplicar la transacción y la validación. Un endpoint extra sería código espejo que puede desincronizarse.
- **Ruta nueva `/configuracion`** en vez de arreglar `/profile?edit=1` in-place: el wizard tiene navegación por pasos y estado por pasos; una página de edición "todo de una vez" es más simple, no rompe el alta de primer uso y separa responsabilidades. Se dejó el soporte de `?edit=1` en el código (inocuo) por si se reutiliza.
- **Una sola página con secciones** en vez de repetir el wizard por pasos: editar es revisar, no recorrer.
- **Embeber el JSON en la vista** (`window.__PERFIL__`): el wizard ya funciona 100% en cliente; precargar desde el HTML evita un endpoint extra y un segundo round-trip.
- **`getConnection()` en la lectura**: aunque es solo lectura, reutiliza una conexión para que las consultas vean un estado consistente y libera siempre en `finally`.
- **Sin cambios de esquema**: toda la lectura usa tablas existentes.

## 7. Seguridad

| Punto | Cómo se cubre |
|---|---|
| Acceso | `requireAuth` en la ruta GET; `requireAuthApi` en el POST |
| SQL | Todas las consultas usan marcadores `?` (parametrizadas) |
| Autorización | El `id_usuario` sale de la **sesión**, nunca del cliente; un usuario no puede leer ni escribir el perfil de otro |
| XSS / inyección HTML | `JSON.stringify(...).replace(/</g, '\u003c')` al embeber datos |
| Validación | El servidor revalida con `validateProfile` (el cliente es solo ayuda de UX) |

## 8. Pruebas realizadas

Verificación sin BD (la app necesita MySQL para el flujo completo):

```
node --check models/profileModel.js          → OK
node --check controllers/profileController.js → OK
node --check routes/profileRoutes.js          → OK
node --check public/js/configuracion.js       → OK

render EJS de configuracion.ejs con datos de ejemplo:
  EJS render OK, largo: 12586
  embed de datos OK
  datos visibles OK
render EJS de dashboard.ejs:
  menu Configuracion OK
  Mi perfil eliminado OK
```

También se comprobó que **todas** las clases CSS usadas en la vista existen en `profile.css` (`.segmented`, `.chip`, `.level-option`, `.surgery-card`, `.btn-ghost`, `.hidden`, etc.).

### Checklist manual (requiere BD)

1. `npm run dev`, iniciar sesión con una cuenta **con** perfil guardado.
2. Menú del avatar → **Configuración** → debe abrir `/configuracion` con **tus datos** (sexo, altura, peso, nivel, objetivo, lesiones, cirugías, entorno, equipamiento, días y minutos).
3. Cambiar, por ejemplo, peso y días/semana → **Guardar cambios** → alerta verde.
4. Recargar la página → los cambios deben persistir.
5. Verificar en la BD: nueva fila en `mediciones` y `clientes.id_objetivo` actualizado.
6. Provocar errores: dejar la altura vacía o un objetivo sin marcar → la alerta roja aparece y **no** guarda.
7. Probar "Ninguna"/"Ninguno" en lesiones/equipamiento → deshabilita el resto.
8. Cuenta **sin** perfil → entrar a `/configuracion` → redirige a `/profile`.
9. Sin sesión → `/configuracion` → redirige a `/login`.

> Nota de comportamiento esperado: cada guardado **agrega una medición** al historial (por diseño de `saveProfile`). Es intencional: `mediciones` es el historial de progreso.

## 9. Cómo REVERTIR este cambio (si no se aprueba)

**Opción A — total (mientras no se commitee):**

```bash
git restore models/profileModel.js controllers/profileController.js routes/profileRoutes.js views/post/dashboard.ejs ERRORES-PENDIENTES.md
rm views/post/configuracion.ejs public/js/configuracion.js public/css/configuracion.css
rm CAMBIOS-CONFIGURACION-PERFIL.md
```

Si ya se commiteó: `git revert <hash-del-commit>`.

**Opción B — parcial:** quitando la ruta `GET /configuracion` y la vista, el resto del sistema queda igual que antes. `getProfileByUser` es aditivo e inocuo (no lo usa nadie más), así que puede quedarse sin efecto alguno.

No hay cambios de esquema ni de `app.js`, sesión, login, registro ni recuperación de contraseña: la reversión no deja efectos residuales.
