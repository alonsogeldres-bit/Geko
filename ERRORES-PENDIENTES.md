# Estado de errores del proyecto GEKO

> **Fecha de corte:** 19-10-2026
> **Propósito:** inventario único de errores conocidos, con su severidad, ubicación y arreglo sugerido. Sirve como backlog de deuda técnica: se puede ir tachando de a uno.
> **Regla:** al arreglar un error, moverlo a la sección "Resueltos" con fecha y hash del commit.

---

## Resueltos (no volver a tocar)

| # | Error | Resuelto en |
|---|-------|-------------|
| R1 | Login repetía el wizard de perfil aunque estuviera completado | commit `f1af5ef` — doc `CAMBIOS-PERFIL-COMPLETADO.md` |
| R2 | Enlaces de recuperación no morían al usarse | commit `879b6f1` — doc `CAMBIOS-ENLACE-UN-SOLO-USO.md` |

---

## Errores presentes (pendientes)

Ordenados por severidad: **ALTA** = rompe algo o es explotable; **MEDIA** = ruido, trampas o fallos en escenarios específicos; **BAJA** = código muerto y limpieza.

### 🔴 Severidad ALTA

#### E1 — `sql/schema.sql` no define la columna `usuario_proveedor`
- **Ubicación:** `sql/schema.sql` (tabla `usuarios`) vs. `models/userModels.js`, `controllers/authRecoverySocialController.js`
- **Qué pasa:** el código usa `usuario_proveedor` en el INSERT de usuarios, en el login con Google y en `updatePassword` (`WHERE usuario_proveedor = 'local'`), pero el esquema del repo nunca la crea. Si alguien arma la BD desde cero con `schema.sql`, **registro, login y reset fallan con "Unknown column"**. Solo funciona porque la BD real fue alterada a mano.
- **Arreglo sugerido:** agregar al `CREATE TABLE usuarios`:
  `usuario_proveedor ENUM('local','google') NOT NULL DEFAULT 'local'`
  y aprovechar de revisar si la BD real tiene más columnas fuera del esfuerzo del repo.
- **Esfuerzo:** 5 minutos.

#### E2 — `public/js/splash.js` lanza `ReferenceError`
- **Ubicación:** `public/js/splash.js`, líneas 18-21 (fuera del IIFE) vs. línea 3 (dentro del IIFE)
- **Qué pasa:** `SPLASH_DURATION` está declarada dentro del bloque pero se usa afuera → error en consola en cada carga del splash. Además hay **doble lógica de redirección** (un `setTimeout` dentro del IIFE con `DOMContentLoaded`, y otro afuera) y `sessionStorage.lastPage` se lee sin definirse nunca. Funciona "por suerte": el segundo timeout muere por la excepción y el redirect lo termina haciendo el primero.
- **Arreglo sugerido:** dejar un solo `setTimeout` al inicio del archivo, con la constante en el mismo ámbito.
- **Esfuerzo:** 5 minutos.

#### E3 — Recuperar contraseña revela si el correo existe
- **Ubicación:** `controllers/authRecoverySocialController.js` → `forgotPassword` (responde 404 "El correo es inexistente")
- **Qué pasa:** un atacante prueba correos uno a uno y arma una lista de cuentas reales del sitio. El comentario de `public/js/forgot-password.js` ("el mensaje es el mismo exista o no, por seguridad") asume algo que el servidor **no cumple**.
- **Arreglo sugerido:** responder siempre `{ success: true, message: MSG_ENVIADO }` cuando el correo tiene formato válido, exista o no, y solo loguear internamente. Mantener 400/503 solo para correo inválido o servicio de correo caído.
- **Esfuerzo:** 15 minutos.

#### E4 — Sin límite de intentos (rate limiting)
- **Ubicación:** `app.js` (no hay middleware de rate limit)
- **Qué pasa:** `/login` acepta fuerza bruta sin tope; `/forgot-password` acepta spam ilimitado de correos desde el servidor (con las consecuencias de reputación de dominio que eso trae).
- **Arreglo sugerido:** `express-rate-limit` con ventana corta (ej. 10 intentos/min por IP en `/login`, 3/min en `/forgot-password`). Instalar dependencia nueva.
- **Esfuerzo:** media hora.

#### E5 — Sin protección CSRF
- **Ubicación:** todos los `POST` (`/register`, `/login`, `/logout`, `/profile`, `/forgot-password`, `/reset-password`, `/complete-registration`)
- **Qué pasa:** los envíos por `fetch` mandan `Content-Type: application/json`, lo que da resistencia parcial (un formulario clásico de otro sitio no puede mandar JSON sin CORS), pero los formularios HTML reales del proyecto (`action="/auth/logout" method="POST"`) no llevan token, y el middleware de sesión no valida origen.
- **Arreglo sugerido:** token CSRF en sesión + middleware que valide `Origin`/`Referer` contra `BASE_URL` como mínimo; ideal, librería (`csurf` está deprecada → usar `csrf-csrf` o doble submit cookie a mano).
- **Esfuerzo:** 1-2 horas.

### 🟠 Severidad MEDIA

#### E6 — Sesiones en memoria (`MemoryStore`)
- **Ubicación:** `app.js` → configuración de `express-session`
- **Qué pasa:** al reiniciar el servidor **todos los usuarios se desloguean**; con más de un proceso/servidor, cada uno tiene sesiones aisladas. Aviso en consola desde Express. Aceptable en dev, no en producción.
- **Arreglo sugerido:** store en MySQL (ya hay `mysql2` y la BD; librería `express-mysql-session`) o Redis si se escala.
- **Esfuerzo:** 1 hora.

#### E7 — Sin headers de seguridad
- **Ubicación:** `app.js`
- **Qué pasa:** no hay `helmet` (CSP, HSTS, X-Frame-Options...), no hay `trust proxy` (detrás de Render/nginx la IP real y HTTPS no se ven bien), ni redirect a HTTPS en producción.
- **Arreglo sugerido:** `app.set('trust proxy', 1)` + `app.use(helmet())` con CSP que permita los assets propios; forzar HTTPS solo en `NODE_ENV=production`.
- **Esfuerzo:** 30 minutos (con la dependencia `helmet`).

#### E8 — Reglas de contraseña inconsistentes
- **Ubicación:** `middlewares/validators.js` → `validateResetPassword` (máx. 10) vs. `validateRegister` (sin máximo)
- **Qué pasa:** al registrarse se permite cualquier largo; al recuperar, máximo 10 caracteres. Un usuario podría tener una contraseña de 20 caracteres y no poder "resetearla" a la misma. El límite de 10 además es corto para estándares actuales.
- **Arreglo sugerido:** unificar: mínimo 8, sin máximo razonable (o máximo 72 por bcrypt), misma regla en registro y reset.
- **Esfuerzo:** 15 minutos (y actualizar los textos de las vistas).

#### E9 — `npm run doctor` no ejecuta nada
- **Ubicación:** `package.json` (`"doctor": "node scripts/doctor.js"`) y `scripts/` **vacío**; `TUTO.md` lo describe como paso de verificación.
- **Qué pasa:** el comando falla; la guía de setup miente.
- **Arreglo sugerido:** crear `scripts/doctor.js` (que TUTO.md ya describe: chequea `.env`, MySQL, Google, Gmail) o sacar el script de `package.json` y la referencia de TUTO.md.
- **Esfuerzo:** 1-2 horas si se crea; 5 minutos si se elimina la referencia.

#### E10 — Formulario trampa en `login.ejs`
- **Ubicación:** `views/post/login.ejs` (`#form-register` oculto) + `public/js/login.js` (su handler)
- **Qué pasa:** ese formulario oculto no envía `fecha_nacimiento`, que el servidor exige → si alguna vez se muestra, el registro falla siempre con 400. El registro real vive en `/register` con su propio JS (`register.js`); el de login.js quedó de una versión con pestañas cuyos elementos (`#tab-login`, `#tab-register`) ya no existen.
- **Arreglo sugerido:** borrar el `#form-register` del `login.ejs` y el bloque `formRegister` de `login.js`.
- **Esfuerzo:** 10 minutos.

#### E11 — Registro con condición de carrera (TOCTOU)
- **Ubicación:** `controllers/authControllers.js` → `register` (chequea `existsByEmail/Username/Phone` y luego hace `create`)
- **Qué pasa:** dos registros simultáneos con el mismo correo pasan los chequeos y el segundo revienta con la UNIQUE de la BD → el usuario ve "Error del servidor" en vez de "Ese correo ya está registrado". Es raro pero posible.
- **Arreglo sugerido:** capturar el `ER_DUP_ENTRY` (código `err.code === 'ER_DUP_ENTRY'` de mysql2) en el `catch` y responder 409 con mensaje claro.
- **Esfuerzo:** 15 minutos.

### 🟢 Severidad BAJA (código muerto y limpieza)

#### E12 — `dashboardController.js` huérfano
- **Ubicación:** `controllers/dashboardController.js` — renderiza `dashboard/index` (**vista inexistente**) y ninguna ruta lo usa (`routes/DashboardRoutes.js` renderiza `post/dashboard` directamente).
- **Arreglo:** borrarlo, o reconectarlo desde la ruta (decidir cuál de las dos formas queda). **Nota:** al conectarlo, `res.render('post/dashboard', { usuario })` necesita recibir `usuario` desde el controlador.

#### E13 — `public/js/dashboard.js` duplicado y muerto
- **Ubicación:** `public/js/dashboard.js` — el mismo IIFE está **copiado dos veces**; busca IDs (`avatar-btn`, `user-dropdown`) que no existen en `dashboard.ejs` (usa `<details>`); la vista ni lo referencia (tiene su propio script inline que sí funciona).
- **Arreglo:** borrar el archivo, o bien unificar: mover el script inline de `dashboard.ejs` a este archivo (referenciándolo con `<script src>`) y dejarlo una sola vez.

#### E14 — `postControllers.js` con código muerto
- **Ubicación:** `controllers/postControllers.js` — hace `require('../config/db')` sin usarlo y define `login`/`profile` que ninguna ruta llama (solo se usa `splash`).
- **Arreglo:** quitar el require y las funciones no usadas.

#### E15 — Vistas huérfanas
- **Ubicación:** `views/post/paywall.ejs` (sin ruta que la renderice, sin `<link>` a su `paywall.css`, links a `/registro` y `/premium` inexistentes) y `views/post/index.ejs` (HTML vacío).
- **Arreglo:** borrar ambas (o guardar el paywall como borrador comentando en este doc que existe).

#### E16 — Dependencia `sesion@0.0.0` sin usar
- **Ubicación:** `package.json` → `"sesion": "^0.0.0"`
- **Qué pasa:** no se require en ningún archivo; nombre parece typo de "session"; versión 0.0.0. Riesgo supply-chain y ruido en `npm audit`.
- **Arreglo:** `npm uninstall sesion`.

#### E17 — Codificaciones rotas en docs
- **Ubicación:** `README.md` (UTF-16, Git lo ve binario) y `TUTO.md` (acentos corruptos: "TUTO ??" Configurar el entorno").
- **Arreglo:** re-guardar ambos en UTF-8. El contenido de TUTO.md está bien (se lee completo con UTF-8), solo hay que normalizar.

#### E18 — TUTO.md menciona `HILO.md` que no existe
- **Ubicación:** `TUTO.md`, párrafo introductorio
- **Arreglo:** crear `HILO.md` (estado del proyecto, como la doc sugiere) o quitar la mención.

#### E19 — `DATABASE_URL` en `.env` no la usa nadie
- **Ubicación:** `.env` vs. `config/db.js` (usa `MYSQL_*`)
- **Qué pasa:** confusión para quien configure el entorno.
- **Arreglo:** borrar la línea del `.env` local (nunca se commitea, así que es solo higiene de cada máquina).

#### E20 — Wizard de edición no precarga datos
- **Ubicación:** `public/js/profile.js` + `views/post/profile.ejs`
- **Qué pasa:** con `/profile?edit=1` el wizard abre **vacío** aunque el usuario ya tenga perfil guardado; si guarda sin tocar nada, se crea una medición duplicada en el historial (por diseño, cada guardado agrega medición). No es un bug de datos, pero confunde al usuario.
- **Arreglo sugerido:** `showProfile` consulta los datos actuales (`profileModel`) y los pasa a la vista; `profile.js` los pinta en el estado inicial. Es el cambio más grande de la lista.

#### E21 — Sin tests automatizados
- **Ubicación:** `package.json` → `"test": "echo \"Error: no test specified\" && exit 1"`
- **Arreglo sugerido:** al menos tests unitarios de `config/recovery.js` (tokens) y de `middlewares/validators.js` (no requieren BD). Vitest o node:test (sin dependencias extra).

---

## Orden sugerido de ataque

1. **E1** (rompe instalaciones nuevas) → 5 min
2. **E2** (error en consola en cada carga) → 5 min
3. **E3** (filtrado de usuarios) → 15 min
4. **E10, E14, E15, E16** (limpieza rápida, todo borrar) → 20 min en total
5. **E4, E5** (seguridad seria) → media tarde
6. **E6, E7** (preparar producción) → 1.5 h
7. **E8, E11** (consistencia) → 30 min
8. **E9, E12, E13** (dashboard/docs) → 1-2 h
9. **E17, E18, E19** (documentación) → 30 min
10. **E21** (tests, para que lo anterior no se rompa de nuevo) → ongoing
11. **E20** (mejora de UX, el más grande) → cuando se decida
