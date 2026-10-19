# Cambio propuesto: dashboard conectado a los datos reales del perfil

> **Estado:** IMPLEMENTADO
> **Fecha:** 19-10-2026
> **Archivos afectados:** 12 (5 nuevos, 7 modificados) + 1 eliminado
> **Base de datos:** sin cambios de esquema (solo consultas de lectura)
> **Riesgo:** bajo - no toca login, registro, recuperación, el wizard ni la página `/configuracion`; solo agrega una capa de lectura y reescribe la vista del dashboard

---

## 1. Problema reportado

El wizard de `/profile` (5 pasos) **guardaba** el perfil del usuario en la base
de datos, pero el dashboard **no lo leía**: mostraba siempre los mismos datos
de ejemplo.

Consecuencia visible: el usuario completaba "Ganar músculo, 3 días por semana,
45 minutos",IBA al dashboard y veía
*"Torso: pecho y espalda · 45 min · 5 ejercicios"* para todos, y
*"0 de 3 sesiones por semana"* aunque en su perfil tuviera 5 días.

Además, dos enlaces del menú apuntaban a rutas inexistentes
(`/entrenamiento` y `/configuracion` devolvían 404).

## 2. Causa raíz

`views/post/dashboard.ejs` no recibía datos: el controlador le pasaba **solo**
`{ usuario }` y la vista traía los valores de ejemplo incrustados en el propio
archivo.

```ejs
// antes: la vista se inventaba los datos
const s = locals.sugerencia || { nombre: 'Torso: pecho y espalda', minutos: 45, ... };
const r = locals.resumen    || { racha: 0, meta: 3, dias: [] };
```

Y el modelo de datos tenía el hueco catálogo:

| Faltaba | Para qué |
|---|---|
| Ninguna consulta de perfil para el dashboard | Mostrar objetivo, nivel, entorno, días, minutos, equipamiento y lesiones |
| Ningún registro de sesiones | Racha, "hecho" en la tira de la semana y actividad reciente |
| Catálogo `ejercicios` vacío (0 filas) | Listar los ejercicios concretos de la rutina |

## 3. Solución implementada

Se agregó una **capa de lectura** entre la base de datos y la vista, respetando
el MVC del proyecto (routes → middlewares → controllers → models):

```
GET /dashboard
  │
  ├─ routes/DashboardRoutes.js      requireAuth → dashboardController.index
  │
  └─ controllers/dashboardController.js
       ├─ DashboardModel.getPerfil(id_usuario)      ← lee el perfil real
       ├─ DashboardModel.getSesiones(id_cliente)     ← historial (si existe la tabla)
       ├─ RoutineModel.construirSugerencia(perfil, alt)
       ├─ RoutineModel.calcularResumen(sesiones, diasSemana)
       └─ res.render('post/dashboard', { usuario, perfil, sugerencia, resumen, actividad })
```

La **sugerencia del día** se construye a partir del perfil, sin tocar la base:

| Campo de la vista | Origen |
|---|---|
| Objetivo | `clientes.id_objetivo` → `objetivo.nombre_objetivo` |
| Nivel | `mediciones.nivel_fisico` (la medición **más reciente**) |
| Dónde entrenas | `preferencia_entrenamiento.entorno` |
| Frecuencia | `preferencia_entrenamiento.dias_semana` |
| Duración | `preferencia_entrenamiento.minutos_sesion` |
| Equipamiento | `cliente_equipamiento` → `equipamiento` |
| Limitaciones | `ficha_antecedente` → `antecedente` |
| Tipo / grupo / intensidad / nº ejercicios | derivados del objetivo y el nivel |

**Días planificados:** `dias_semana` es solo un número (1-7), no dice qué días.
Se usa una distribución estándar con lunes primero, para que coincida con la
tira L-D de la vista: `1 → L`, `2 → L J`, `3 → L X V`, `4 → L M J V`,
`5 → L M X J V`, `6 → + S`, `7 → todos`.

**Sin cambiar la base:** la tabla que guardaría las sesiones
(`sesion_entrenamiento`) **todavía no existe**. El modelo la detecta y devuelve
el estado vacío en vez de romperse, así que el dashboard funciona hoy y se
enciende solo cuando esa tabla aparezca (cache de 60 s, sin reiniciar).

## 4. Detalle de cambios por archivo

### 4.1 `models/dashboardModel.js` (NUEVO)

Solo **lectura**. Dos funciones:

- `getPerfil(idUsuario)` → objeto con el perfil, o `null` si el usuario aún no
  completó el wizard. Devuelve `null` cuando no hay fila en `clientes`.
- `getSesiones(idCliente)` → historial; si la tabla `sesion_entrenamiento` no
  existe devuelve `[]`.

Usa `LEFT JOIN` con `objetivo` a propósito: si un cliente no tuviera objetivo,
un `INNER JOIN` lo haría desaparecer del dashboard.

### 4.2 `models/routineModel.js` (NUEVO)

Funciones **puras** (no tocan la base), lo que las hace verificables sin
servidor ni datos:

- `construirSugerencia(perfil, alt)` → la rutina del día. `?alt=N` rota entre
  las 3 variantes del objetivo (fuerza / cardio / movilidad según el caso).
- `calcularResumen(sesiones, diasSemana)` → racha actual, mejor racha, sesiones
  de la semana y el estado de cada día (`hecho` / `plan` / vacío).
- `construirActividad(sesiones)` → las últimas 5 sesiones para el listado.

La racha cuenta días consecutivos hasta hoy; si el usuario no entrenó hoy pero
sí ayer, la racha sigue viva (no se pierde por no entrenar el mismo día).

### 4.3 `controllers/dashboardController.js` (REESCRITO)

Antes renderizaba `dashboard/index`, una vista **inexistente** (el error **E12**
del inventario), y ninguna ruta lo usaba. Ahora arma el contexto y renderiza
`post/dashboard`.

Si el usuario no tiene perfil, lo manda a `/profile` en vez de mostrarle datos
de ejemplo.

### 4.4 `views/post/dashboard.ejs` (REESCRITO)

- Se eliminaron los dos bloques de datos de ejemplo.
- Nuevo bloque **"Tu plan"** con los datos reales del perfil: objetivo, nivel,
  dónde entrenas, frecuencia, duración, medición actual, equipamiento y
  limitaciones (estas últimas en ámbar, porque son las que más van a importar
  cuando las rutinas las arme la IA).
- El botón "Editar perfil" y el item "Configuración" del menú apuntan a
  `/configuracion` (ver sección 6).
- El script inline se movió a `public/js/dashboard.js` (error **E13**).

### 4.5 `views/post/entrenamiento.ejs` + `controllers/trainingController.js` + `routes/trainingRoutes.js` (NUEVOS)

Placeholder de la pantalla de entrenamiento: muestra la rutina del día y
explica qué va a llegar. **`/entrenamiento` ya no devuelve 404.**

### 4.6 `public/js/dashboard.js` (REESCRITO)

Tenía el mismo bloque copiado dos veces y buscaba IDs (`avatar-btn`,
`user-dropdown`) que no existen en la vista (error **E13**). Ahora es un solo
bloque, con los IDs reales (`<details id="user-menu">`), y la vista lo carga
con `<script src>` en vez de un script inline.

### 4.7 `public/css/dashboard.css`

Estilos de los bloques nuevos: resumen del perfil, chips de equipamiento y
limitaciones, estado vacío de la pantalla de entrenamiento.

### 4.8 Limpieza

| Archivo | Cambio | Error del inventario |
|---|---|---|
| `controllers/postControllers.js` | Fuera el `require` sin usar y las funciones `login`/`profile` sin ruta | **E14** |
| `views/post/index.ejs` | Eliminado (HTML vacío, ninguna ruta lo renderizaba) | **E15** (parcial) |
| `routes/DashboardRoutes.js` | Delega en el controller en vez de renderizar inline | — |

## 5. Lo que sigue pendiente (a futuro, con IA)

| # | Qué falta | Por qué |
|---|---|---|
| 1 | Tabla `sesion_entrenamiento` | Sin ella no hay racha, ni "hecho" en la semana, ni actividad reciente. El modelo ya la usa en cuanto exista. |
| 2 | Catálogo de ejercicios | `ejercicios` tiene 0 filas. Las rutinas las generará la IA, no se cargan a mano. |
| 3 | `/entrenamiento` completo | Ejercicio a ejercicio, series, repeticiones, descanso y registro de la sesión. |
| 4 | Unificar la lectura del perfil | Ver sección 7. |

## 6. Resolución de conflicto con `origin/main`

Al integrar los 5 commits de `origin/main` hubo **un conflicto de texto** en
`views/post/dashboard.ejs`: el menú del avatar.

- **Este cambio** (hecho antes del pull) dejó "Configuración" como *Pronto*,
  porque `/configuracion` todavía **no existía**.
- **`origin/main`** (commit `88b8768`) agregó esa página y quitó "Mi perfil"
  del menú.

Se resolvió a favor del remoto, que es lo correcto: la ruta ya existe.

Además hubo **4 enlaces querebotaban** sin dar error de merge (el commit
`f1af5ef` ahora manda `/profile` a `/dashboard` si el perfil ya existe):

| Archivo | Enlace | Corrección |
|---|---|---|
| `views/post/dashboard.ejs` | "Mi perfil" | eliminado (lo reemplaza "Configuración") |
| `views/post/dashboard.ejs` | "Editar perfil" | `/profile` → `/configuracion` |
| `views/post/entrenamiento.ejs` | "Mi perfil" | → "Configuración" → `/configuracion` |
| `views/post/entrenamiento.ejs` | "tu perfil" | `/profile` → `/configuracion` |

## 7. Deuda técnica que este cambio deja

**Lectura del perfil duplicada en dos modelos:**

| Dónde | Formato que devuelve |
|---|---|
| `profileModel.getProfileByUser` (`88b8768`) | Formato del **wizard**: `level:'intermedio'`, `environment:'gimnasio'`, `goals:['ganar_musculo']` |
| `dashboardModel.getPerfil` (este cambio) | Formato de **pantalla**: `nivelFisico:'Medio'`, `entorno:'Gimnasio'`, `objetivo:'Ganar músculo'` |

Ambos leen las mismas 6 tablas. **No se unificó a propósito**: tocar
`models/profileModel.js` justo después de mergearlo aumentaría el riesgo de
conflicto en el próximo `pull`. Queda anotado como **E22** en
`ERRORES-PENDIENTES.md`.

Lo mismo con `profileModel.hasProfile()` y el chequeo `if (!perfil)` del
dashboard: responden lo mismo ("¿ya completó el perfil?") pero con propósitos
distintos y en archivos separados, sin conflicto.

## 8. Pruebas realizadas

| Prueba | Resultado |
|---|---|
| `GET /dashboard` sin sesión | 302 a `/login` |
| `GET /dashboard` sin perfil completado | 302 a `/profile` |
| `GET /dashboard` con perfil | 200, con los datos reales de la base |
| `GET /configuracion` | 200, muestra los mismos datos que el dashboard |
| `GET /entrenamiento` | 200 (antes 404) |
| `?alt=1`, `?alt=4`, `?alt=-7`, `?alt=abc` | rotan la variante correctamente, sin romperse |
| Racha con 4 sesiones ficticias | 3 días de racha, 3 de mejor racha, 1 sesión en la semana |
| Consistencia dashboard vs `/configuracion` | mismos objetivo, nivel, días, minutos, lesiones y equipamiento |
| Base de datos antes/después | 18 tablas con conteos idénticos. Sin cambios de esquema ni de datos |

## 9. Reversión

```bash
git revert <hash-del-merge>
```

El cambio es de solo lectura y no toca el esquema, así que la reversión es
total y no deja datos huérfanos.
