# HILO — Estado del proyecto GEKO

> **Fecha de corte:** 21-10-2026
> **Rama:** `main` · **Último commit:** `c82f9f2` · **Estado:** limpio y sincronizado con `origin/main`
>
> Complementa a `TUTO.md` (cómo instalar y configurar) y a `GIT-WORKFLOW.md` (cómo trabajar con Git).
> Este documento explica **dónde estamos, qué falta y qué mirar primero al retomar**.

---

## 1. TL;DR — qué hacer al retomar

1. `git pull --rebase` y `npm install`.
2. Copiar `.env` si es una máquina nueva (ver `TUTO.md`); el repo **no** tiene `.env.example`.
3. **Tarea recomendada (la que quedó a medias):** la API de Google estaba saturada hoy, así que
   solo se pudo probar el generador de respaldo. Cuando la API responda, hay que
   **verificar una rutina real generada por Gemini** (sección 6.1).
4. Después, seguir el backlog de la sección 7 (arranca por `E1`, `E2`, `E3`).

---

## 2. En una línea

App web de fitness (Node + Express + EJS + MySQL) con login social, perfil/wizard,
dashboard con datos reales, planes de PayPal y **rutinas de entrenamiento generadas con IA
dentro de la pantalla `/entrenamiento`**.

---

## 3. Mapa de la app (estado actual)

| Ruta | Vista / Controller | Estado |
|------|--------------------|--------|
| `/splash` | `views/splash.ejs` | Funciona (login/registro con Google) |
| `/login`, `/registro` | `controllers/authController.js` | Funciona. Recuperación de contraseña con enlace de un solo uso |
| `/profile` | `controllers/profileController.js` | Wizard del perfil (ficha) |
| `/configuracion` | `views/post/configuracion.ejs` | Ver/editar perfil. **Pieza indivisible**: vista + `public/js/configuracion.js` + CSS |
| `/dashboard` | `views/post/dashboard.ejs` | Muestra datos reales del perfil (minutos, días, nivel, equipamiento) |
| `/entrenamiento` | `views/post/entrenamiento.ejs` | **Rutina del día generada con IA** (ver sección 4) |
| `/planes` | `views/post/planes.ejs` | Suscripción PayPal (pago único) |
| `/pago/exito`, `/pago/cancelado` | `views/post/pago*.ejs` | PayPal: una sola transacción, sin suscripción |

Modelos de lectura por vista (regla del repo): `models/dashboardModel.js` y `models/routineModel.js`
son **archivos nuevos sin solape** con `models/profileModel.js`.

---

## 4. Lo último que se hizo: rutina con IA en `/entrenamiento`

**Commit:** `c82f9f2` — doc: `CAMBIOS-RUTINA-IA.md`

Decisiones que **no hay que volver a discutir**:

- La IA vive **dentro de la ruta que ya existía** (`GET /entrenamiento`). No hay `/entrenamiento/ia`.
- La rutina se genera **sola** al entrar a la pantalla (servidor), no con un botón ni con un fetch.
- El prompt usa **solo** dos datos: `tiempoDisponible` y `lugarEntrenamiento`.
- La rutina es **gratis para todos** por ahora. El gating Premium se aplica después (ver `E24`).
- Si la IA falla, la pantalla **no se rompe**: cae a un generador local y lo dice con un chip.

### Ficheros

| Fichero | Rol |
|---------|-----|
| `services/geminiService.js` | Cliente de Gemini: prompt, reintentos, timeout, normalización y fallback |
| `services/localRoutineService.js` | Generador de respaldo (offline), misma estructura de salida |
| `controllers/trainingController.js` | Cachea la rutina del día en la sesión, `?nueva=1`, render |
| `views/post/entrenamiento.ejs` | Render de la rutina (calentamiento / principal / estiramiento) |
| `public/css/dashboard.css` | Estilos de la rutina (`.rutina-bloque`, `.ejercicio-card`, `.rutina-error`…) |

### Contrato de la rutina

```js
{
  fuente: 'gemini' | 'local',      // 'local' = se generó sin API
  lugarEntrenamiento: 'Casa',
  tiempoTotalMin: 45,
  calentamiento: [{ nombre, descripcion, duracionMin }],
  rutinaPrincipal: [{ nombre, descripcion, series, repeticiones, descansoSeg }],
  estiramiento: [{ nombre, descripcion, duracionMin }]
}
```

### Variables de entorno (ya están en `.env`)

| Var | Default | Para qué |
|-----|---------|----------|
| `GEMINI_API_KEY` | — | Obligatoria para usar Gemini. Sin ella → rutina local (no rompe) |
| `GEMINI_MODEL` | `gemini-3.8-flash` | Modelo. **No cambiar a la ligera**: `gemini-2.5-flash` da `404` en cuentas nuevas |
| `GEMINI_TIMEOUT_MS` | `10000` | Timeout por llamada |

Si `GEMINI_API_KEY` falta o la API falla, `geminiService` **no lanza**: devuelve la rutina local.

### Trampas de la API de Google (leídas a fuego hoy)

- `503` + *"This model is currently experiencing high demand"* → **no es un bug del código**.
  Es saturación de Google. El servicio reintenta 1 vez y cae al respaldo local.
- `gemini-2.5-flash` → `404` (modelo no disponible para cuentas nuevas).
- `gemini-3.7-flash` → se queda colgado (sin respuesta).
- Por eso el modelo por defecto es `gemini-3.8-flash` y hay timeout de 10 s por intento.

### Cache en sesión

- `req.session.rutinaIA = { fecha, rutina }` → **una rutina por día y por sesión**.
- `GET /entrenamiento?nueva=1` fuerza una rutina nueva.
- La sesión expira a las 2 h (sigue siendo `MemoryStore`, ver `E6`).

---

## 5. Entorno (sin secretos)

| Dato | Valor |
|------|-------|
| Node | v26.3.0 · npm 11.16.0 |
| Puerto | `6767` (sale de `PORT` en `.env`; default del código: 3000) |
| Base de datos | MySQL **remoto** (Aiven) — es la base compartida del equipo, no una local |
| Arranque | `npm start` (o `npm run dev` con nodemon) |
| Scripts disponibles | `start`, `dev`, `doctor`, `test` → `test` **falla** (placeholder), `doctor` **no hace nada** (no existe `scripts/`, ver `E9`) |

Claves de `.env` (los valores no se documentan): `PORT`, `MYSQL_*`, `DATABASE_URL`, `SESSION_SECRET`,
`GOOGLE_CLIENT_ID/SECRET`, `MAIL_*`, `PAYPAL_*`, `PLAN_PREMIUM_USD`, `RECOVERY_TOKEN_TTL_MINUTES`,
`GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_TIMEOUT_MS`.

> La BD es remota y compartida: **no dropear tablas ni borrar datos** durante las pruebas.

---

## 6. Cómo verificar (reproducible sin los scripts del día)

### 6.0 Chequeo rápido (30 s)

```powershell
node --check services/geminiService.js
node --check services/localRoutineService.js
node --check controllers/trainingController.js
git grep -n "^\(<<<<<<<\|=======\|>>>>>>>\)" -- '*.ejs' '*.js' '*.md'   # debe salir vacío
```

### 6.1 La prueba que falta: rutina real de Gemini

```powershell
# 1. Con la API key en .env, forzar una llamada y ver qué devuelve
node -e "const {generarRutinaPersonalizada}=require('./services/geminiService'); generarRutinaPersonalizada({tiempoDisponible:45,lugarEntrenamiento:'Casa'}).then(r=>console.log(r.fuente, r.tiempoTotalMin, r.rutinaPrincipal.length, JSON.stringify(r.rutinaPrincipal[0])))"
```

- Si `fuente` sale `local` → la API de Google sigue saturada o falta la key. **No es un fallo del código.**
- Si sale `gemini` → la integración funciona de punta a punta. Revisar que el JSON venga completo:
  3 bloques, `series × repeticiones`, `descansoSeg`, `descripcion`, y que `tiempoTotalMin` sea razonable.
- Con la key ausente debe devolver `local` en ~1 ms sin excepción.

### 6.2 Prueba end-to-end de la pantalla

```powershell
npm start
# en otra terminal: login con un usuario de prueba y luego
Invoke-WebRequest -Uri "http://localhost:6767/entrenamiento" -WebSession $s -UseBasicParsing
```

Esperado: `200`, 8 ejercicios, 3 bloques; la **segunda** visita baja a ~1 s (cache) y
`/entrenamiento?nueva=1` regenera. Con perfil sin `minutos_sesion`/`entorno` → `302` a `/configuracion`.

> Importante: en las pruebas con base real, **borrar el usuario y el cliente temporales** al terminar.

---

## 7. Backlog priorizado

Fuente completa con detalle, ubicación y arreglo: **`ERRORES-PENDIENTES.md`**.

| Orden | Error | Qué falta | Esfuerzo |
|-------|-------|-----------|----------|
| 1 | ~~E1~~ ✅ | Resuelto en `sql/schema.sql`: `usuario_proveedor` + seeds de `tipo_plan` (pendiente de commit) | — |
| 2 | **E2** | `public/js/splash.js` lanza `ReferenceError` en cada carga | 5 min |
| 3 | **E3** | "Recuperar contraseña" revela si el correo existe | 15 min |
| 4 | **E10, E15, E16** | Limpieza: formulario trampa en `login.ejs`, `views/post/index.ejs` vacía, dependencia `sesion@0.0.0` sin usar | 20 min |
| 5 | **E4, E5** | Rate limiting en login y protección CSRF | media tarde |
| 6 | **E6, E7** | Sesiones en memoria (`MemoryStore`) y headers de seguridad → antes de producción | 1.5 h |
| 7 | **E8, E11** | Reglas de contraseña inconsistentes y registro con carrera (TOCTOU) | 30 min |
| 8 | **E9** | `npm run doctor` no hace nada (falta `scripts/doctor.js`) | 1-2 h |
| 9 | **E17, E18, E19** | Documentación: mojibake en docs, `HILO.md` inexistente, `DATABASE_URL` sin usar | 30 min |
| 10 | **E21** | No hay tests automatizados | ongoing |
| 11 | **E22** | El perfil se lee en dos modelos distintos (`dashboardModel` vs `profileModel`) | 30 min |
| 12 | **E23** | Trigger diferido de la pantalla de planes desactivado | corto |
| 13 | **E24** | Gating de funciones de pago: la rutina con IA es gratis para todos por ahora; falta el candado Premium | 1-2 h |

**Sugerido para `E24`** (cuando toque): la función ya existe
(`generarRutinaPersonalizada` en `services/geminiService.js`). El candado debería ser una
función de **middleware** (`require('.../middleware/requirePremium')`) que se aplique **en el
controller**, no dentro de la vista ni del servicio: la vista sigue mostrando la rutina y el
servidor decide. Recordar que hoy la IA es gratis para todos.

---

## 8. Reglas del proyecto (no negociables)

**Código**

- MVC estricto: `models/` (SQL), `controllers/` (lógica), `views/` (EJS sin lógica de negocio),
  `routes/` (URLs), `public/` (assets). `services/` = clientes de APIs externas (no tocan SQL).
- `async/await` siempre; **consultas parametrizadas** (nunca concatenar datos del usuario).
- `try/catch` en los controladores + `console.error` con el detalle técnico.
- PRG en toda escritura: `POST` → redirect. Nunca renderizar tras un `POST`.
- Vistas: solo presentación. La lógica va en el controller o en un model.
- Al agregar una vista: preferir **partials** para lo compartido (el menú del avatar vive duplicado
  en `dashboard.ejs` y `entrenamiento.ejs` — pendiente de extraer a `views/partials/`, ver
  `GIT-WORKFLOW.md` §5).

**Git**

- Un cambio = un commit = un documento `CAMBIOS-*.md` (convención ya instalada en el repo).
- `git pull --rebase` (nunca `pull` con cambios sin commitear).
- Revisar `git status` y `git diff --cached` antes de commitear; nunca commitear `.env`.
- Finales de línea: LF (ya está en `.gitattributes`). Si aparece un "modificado" fantasma:
  `git add --renormalize .`.

**Docs**

- `TUTO.md` = cómo instalar/configurar. `HILO.md` = estado del proyecto (este archivo).
- `GIT-WORKFLOW.md` = cómo trabajar con Git sin pisarse.
- `ERRORES-PENDIENTES.md` = inventario de errores; al arreglar uno, moverlo a "Resueltos" con el hash.

---

## 9. Pendientes sueltos (no están en `ERRORES-PENDIENTES.md`)

- **Verificar una rutina real de Gemini** cuando la API responda (sección 6.1).
- **Extraer el menú del avatar** a `views/partials/avatar-menu.ejs` (queda duplicado en 2 vistas).
- **Dependencias sin usar**: `sesion@0.0.0` y `lint@1.2.2` (`lint` además no es un script).
- **No existe `scripts/doctor.js`**, pero `package.json` declara `npm run doctor`.
- **`.env.example` no está en el repo**: quien clone tiene que armar el `.env` a mano (`TUTO.md` §).
- **Sin tests automatizados** (`E21`): lo único que hay son scripts de prueba sueltos fuera del repo.

---

## 10. Checklist de arranque

```powershell
git pull --rebase
npm install
# revisar que .env exista con GEMINI_API_KEY, GEMINI_MODEL y GEMINI_TIMEOUT_MS
npm start
# http://localhost:6767/splash
```

```powershell
git status                 # árbol limpio
git diff --cached          # el diff es el esperado
git grep -n "^\(<<<<<<<\|=======\|>>>>>>>\)" -- '*.ejs' '*.js' '*.md'
git commit -m "feat(...): ..."   # + crear CAMBIOS-*.md
git push
```
