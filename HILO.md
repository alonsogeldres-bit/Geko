# HILO — Bitácora del proyecto GEKO

> Documento de continuidad. Sirve para retomar el trabajo en otra sesión sin
> releer toda la conversación.
> Última actualización: 2026-10-05 · Commit base: `c106323`

---

## 1. Qué es este proyecto

GEKO, aplicación web de gestión de entrenamiento para un gimnasio.
Node.js + Express 5, EJS, MySQL, CommonJS. Patrón MVC sencillo
(routes → middlewares → controllers → models).

- **Repositorio:** https://github.com/alonsogeldres-bit/Geko
- **Puerto de desarrollo:** `6767` (definido en `.env`)
- **Base de datos:** `geko`
- **Estado del repo al momento de esta nota:** limpio, todo pusheado a `origin/main`

---

## 2. Reglas que no se deben romper

Estas restricciones vienen del cliente. Son **absolutas** salvo que él las levante.

| # | Regla | Motivo |
|---|---|---|
| 1 | **No tocar `/profile`** | Fuera del alcance del encargo. Archivos vetados: la línea `/profile` de `routes/authRoutes.js`, `authController.showProfile`, `views/post/profile.ejs`, `public/css/profile.css`, `public/js/profile.js` |
| 2 | **No modificar la base de datos sin consultar antes** | El cliente trabaja sobre el esquema existente. Cualquier `ALTER`, tabla o columna se le pregunta primero |
| 3 | `/login` y `/register` son rutas separadas y excluyentes | No unificar |
| 4 | Nombres de columna en español se conservan | Ver sección 5 |
| 5 | No commitear credenciales | `.env` está en `.gitignore` |
| 6 | Apple fuera de alcance por presupuesto | Ver sección 7 |

---

## 3. Historial de commits

```
c106323  Add password recovery via Gmail SMTP              ← estado actual
6f020a3  Add /forgot-password route and screen (step 1)
57997f0  Rename routes, files and identifiers to English
dcc6dee  Corregir error del servidor al registrarse con Google
ca05da7  Ocultar boton Apple y agregar script de diagnostico
aa96a55  Login social con Google (OAuth 2.0 manual) y alta en dos pasos
4c96fec  Interfaz de login con SSO Google/Apple y manejo de errores
```

---

## 4. Funcionalidad terminada

### 4.1 Login y registro local
- `/login`, `/register`, `/profile` con redirección y validación.
- Contraseñas con **bcrypt**.
- Errores de validación devueltos en JSON y pintados en la tarjeta de alerta.

### 4.2 Login social con Google (OAuth 2.0 manual, sin librerías)
Implementado a mano en `config/sso.js`:
- `state` anti-CSRF en sesión.
- Canje de código por token contra `oauth2.googleapis.com/token`.
- Perfil contra `www.googleapis.com/oauth2/v3/userinfo`.
- Correo normalizado a minúsculas y sin espacios.

Rutas:
| Ruta | Qué hace |
|---|---|
| `GET /auth/google` | Genera el `state` y redirige a Google |
| `GET /auth/google/callback` | Valida el `state`, obtiene el perfil |
| `GET /complete-registration` | Formulario para completar la cuenta |
| `POST /complete-registration` | Crea la cuenta e inicia sesión |

### 4.3 Registro social en dos pasos (decisión del cliente, "opción B")
Google entrega correo + nombre. Faltan `apellido`, `numero` y `nombre_usuario`,
que en `usuarios` son `NOT NULL UNIQUE`. Por eso hay una pantalla intermedia:
el usuario completa esos 3 campos y se crea la cuenta con el modelo actual.

**Consecuencia conocida:** la cuenta social nace con
`contrasena_hash = bcrypt(randomBytes(32))`. Es una contraseña aleatoria que
nadie conoce, así que la cuenta no se puede entrar con contraseña.

### 4.4 Manejo de errores de SSO
Códigos en inglés, que llegan por query string y los traduce `public/js/login.js`:

| Código | Significado |
|---|---|
| `sso_not_configured` | Faltan credenciales de Google en `.env` |
| `sso_denied` | El usuario denegó el acceso |
| `sso_cancelled` | El usuario canceló |
| `sso_error` | Error genérico |
| `sso_state` | `state` inválido o expirado |
| `sso_email` | Google no devolvió correo verificado |
| `sso_registration` | La sesión de registro expiró |

### 4.5 Refactor a inglés
Rutas, archivos, funciones, claves de sesión y variables propias están en inglés.
Se renombró (commit `57997f0`):

```
completar-registro.ejs / .js  →  complete-registration.ejs / .js
/completar-registro           →  /complete-registration
completeRegister              →  completeRegistration
showCompleteRegister          →  showCompleteRegistration
validateCompleteRegister      →  validateCompleteRegistration
iniciarSesion                 →  startSession
session.oauth_registro        →  session.oauthRegistration
session.oauth_state           →  session.oauthState
proveedores / datos           →  providers / data
DOM ids perfil-*              →  profile-*
appleAviso / proveedoresHabilitados → appleNotice / enabledProviders
```

### 4.6 Recuperación de contraseña con Gmail SMTP
Rutas:
| Ruta | Qué hace |
|---|---|
| `GET /forgot-password` | Pantalla para escribir el correo |
| `POST /forgot-password` | Genera el token y envía el correo |
| `GET /reset-password?token=` | Pantalla de nueva contraseña |
| `POST /reset-password` | Guarda el nuevo hash |

Detalles de diseño relevantes:
- **Tokens firmados, sin tabla en la BD.** HMAC-SHA256 con `SESSION_SECRET`,
  vigencia 15 minutos (`config/recovery.js`). Sin cambios de esquema.
- La firma se compara con `timingSafeEqual`.
- **Respuesta neutra:** exista o no la cuenta, el mensaje es idéntico
  (`"Si ese correo está registrado en GEKO, te enviamos un enlace..."`).
  Así el formulario no sirve para averiguar qué correos están dados de alta.
- Con `MAIL_ENABLED=false` el enlace se imprime en la consola del servidor,
  para poder probar el flujo sin buzón.
- Al guardar la contraseña nueva se destruye la sesión.

---

## 5. Por qué algunos identificadores siguen en español

`nombre`, `apellido`, `numero`, `nombre_usuario`, `correo`, `contrasena_hash`,
`id_usuario`, `id_rol` **son nombres de columna** de la tabla `usuarios`, que
está en español en el esquema. Renombrarlos en el código dejaría el SQL sin
coincidencia con la tabla y la app se caería.

Están documentados en `models/userModels.js` (líneas 1-11) para que un revisor
entienda que es decisión, no descuido. **Todo lo demás del proyecto está en inglés.**

Excepción que **sí** hay que respetar: `req.session.usuario` sigue en español
porque es preexistente y lo consume `/profile`, que está vetado.

---

## 6. Variables de entorno

Todas en `.env`, que está en `.gitignore`.

### Ya configuradas
```
PORT=6767
SESSION_SECRET=<64 chars>          ⚠ ver security
MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_NAME
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:6767/auth/google/callback
BASE_URL=http://localhost:6767
MAIL_FROM_NAME=GEKO
RECOVERY_TOKEN_TTL_MINUTES=15
```

### Pendientes de configurar por el cliente (correo)
```
MAIL_USER=            → vacía
MAIL_APP_PASSWORD=    → vacía
MAIL_ENABLED=false    → apagado
```

---

## 7. Lo que falta y por qué

### 7.1 Correo: falta la contraseña de aplicación de Google
Gmail **no** acepta la contraseña normal de la cuenta. El cliente debe:

1. Activar verificación en 2 pasos en su cuenta de Google
2. Crear una contraseña de aplicación en `myaccount.google.com/apppasswords`
   (16 caracteres)
3. Llenar en `.env`:
   ```
   MAIL_USER=su.cuenta@gmail.com
   MAIL_APP_PASSWORD=la-clave-de-16-caracteres
   MAIL_ENABLED=true
   ```
4. `npm run doctor` debe mostrar `[OK] Gmail SMTP responde con su.cuenta@gmail.com`

Límite de Gmail: ~500 correos/día. Alcanza de sobra para esta etapa.

### 7.2 Apple Sign In: bloqueado
- Requiere Apple Developer Program: **USD 99 al año**. El presupuesto aprobado es **0**.
- El botón ya se oculta solo si `APPLE_ENABLED=false` o faltan credenciales.
- Para Apple haría falta además una columna de proveedor en la BD, porque Apple
  **no devuelve el correo** salvo que se pida explícitamente en el segundo paso.
- **Decisión del cliente:** ¿seguimos sin Apple?

### 7.3 Decisión pendiente: contraseña en cuentas sociales
Hoy una cuenta creada con Google **puede** usar recuperación de contraseña y
obtener una contraseña, con lo que quedaría con dos formas de entrar.

No se restringió porque la tabla `usuarios` **no tiene forma de saber** si una
cuenta es social o local. Resolverlo requiere cambio de BD → ver
**`sql/PROPUESTA-CAMBIO-BD.md`**, que está listo para revisar con el equipo.

**Pregunta abierta para el cliente:** ¿una cuenta social puede tener contraseña,
o se le debe bloquear?

---

## 8. Cómo levantar y probar

```bash
npm install
npm run doctor     # revisa .env, MySQL, Google y Gmail
npm run dev        # nodemon
```

`npm run doctor` es la primera cosa que hay que ejecutar si algo falla: dice
exactamente qué falta y en qué paso.

### Cómo probar el flujo de recuperación sin buzón
1. Con `MAIL_ENABLED=false`, entra a `/forgot-password`
2. Escribe un correo que exista en `usuarios`
3. El enlace aparece **en la consola del servidor** (`npm run dev`)
4. Ábrelo, escribe una contraseña nueva, y verifica que `/login` funcione con ella

---

## 9. Verificaciones ya hechas

| Alcance | Resultado |
|---|---|
| Sintaxis de los 9 archivos JS tocados | OK |
| Rutas, enlaces y render de `/login`, `/register`, `/forgot-password`, `/reset-password` | 29/29 |
| Flujo completo de recuperación | 27/27 |
| **Contra la BD real:** crear usuario de prueba → reset → login → borrar | 14/14 |

En la prueba contra la BD real se comprobó, y se dejó todo limpio:
- La contraseña nueva verifica con bcrypt y la antigua deja de funcionar
- Los demás campos del usuario no se alteran
- Un token de un usuario **no** sirve para otro
- Firma adulterada, token truncado y token expirado se rechazan
- La BD quedó con los 3 usuarios originales

---

## 10. Avisos de seguridad

1. **`SESSION_SECRET` fue pegado en el chat durante el desarrollo.**
   Conviene rotarlo. Los commits no lo contienen, pero si ese valor llegó a
   un canal compartido, cámbialo.
2. **La contraseña de aplicación de Gmail tampoco debe compartirse por chat.**
   Va solo en `.env`.
3. Cada persona del equipo necesita sus propias credenciales de Google OAuth en
   su `.env` local; no se comparten entre todos.

---

## 11. Mapa de archivos

### Configuración
| Archivo | Contenido |
|---|---|
| `.env` | Variables. Ignorado por Git |
| `config/db.js` | Pool de MySQL |
| `config/sso.js` | OAuth de Google y bandera de Apple |
| `config/mailer.js` | Transporte SMTP de Gmail |
| `config/recovery.js` | Tokens firmados de recuperación |
| `scripts/doctor.js` | Diagnóstico (`npm run doctor`) |

### Aplicación
| Archivo | Contenido |
|---|---|
| `app.js` | Express, sesión, EJS, estáticos |
| `routes/authRoutes.js` | Rutas de auth. **La línea `/profile` no se toca** |
| `routes/postRoutes.js` | Splash |
| `middlewares/authMiddlewares.js` | `requireAuth`, `redirectIfAuth`, `requirePendingRegistration` |
| `middlewares/validators.js` | Validadores de los formularios |
| `controllers/authControllers.js` | Login, registro, SSO, recuperación |
| `models/userModels.js` | Consultas a `usuarios` |
| `sql/schema.sql` | Esquema. **No tocar sin consultar** |

### Vistas y estáticos
```
views/post/login.ejs
views/post/register.ejs
views/post/complete-registration.ejs
views/post/forgot-password.ejs
views/post/reset-password.ejs
views/post/profile.ejs          ← vetado

public/css/login.css             ← compartido por todas las pantallas de auth
public/js/login.js
public/js/complete-registration.js
public/js/forgot-password.js
public/js/reset-password.js
public/js/profile.js             ← vetado
```

Todas las pantallas de auth usan `login.css` y las mismas clases `auth-*`.
Para mantener el diseño, copia la estructura de un `.ejs` existente en vez de
inventar clases nuevas.

---

## 12. Si retomas desde aquí

1. `git pull` y `npm run doctor`. Si el doctor pasa MySQL y Google, el entorno está bien.
2. Lo único que bloquea el cierre de la historia de login es
   **la contraseña de aplicación de Gmail** (sección 7.1). Es una tarea de 5
   minutos del cliente, no de código.
3. Después de eso, lo pendiente es una decisión, no trabajo:
   **¿las cuentas sociales pueden tener contraseña?** (sección 7.3)
   La propuesta de BD está en `sql/PROPUESTA-CAMBIO-BD.md`.
