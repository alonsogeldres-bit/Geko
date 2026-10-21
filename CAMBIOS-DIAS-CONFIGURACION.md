# Cambio: `/configuracion` — días de entrenamiento concretos (Lunes…Domingo)

> **Estado:** IMPLEMENTADO — **pendiente de commit** (a pedido del usuario: sin commit)
> **Fecha:** 21-10-2026
> **Rama:** `feature/dias-configuracion` (creada desde `main` @ `403a563`; `main` intacta)
> **Archivos afectados:** 4 modificados + 1 nuevo (este documento)
> **Base de datos:** **sin cambios de esquema** (nada de `ALTER TABLE`). 1 `UPDATE` de datos para una fila con formato antiguo
> **Riesgo:** bajo — no toca login, registro, recuperación ni el wizard de primer uso; reutiliza el `POST /profile` que ya existía

---

## 1. Problema reportado

En `/configuracion` (sección final, "Tiempo") el usuario elegía **cuántos días entrenaba por semana** (1d…7d), no **qué días**. Además:

- El botón **"Guardar cambios" de `/configuracion` estaba roto**: devolvía `400 "Selecciona al menos un día de entrenamiento válido."`
- El usuario pidió que, al cambiar los días de entrenamiento, **se viera reflejado en la base de datos**.

## 2. Causa raíz

El commit `6b4f692 "Commit arreglo dias"` migró el **wizard `/profile`** a días concretos por nombre (`Lunes`, `Jueves`), y en cascada actualizó:

| Capa | Estado antes de este cambio |
|---|---|
| `middlewares/validators.js` | ✅ ya exigía `body.days` (array de nombres) |
| `models/profileModel.js` | ✅ ya guardaba `'Lunes,Jueves'` en `dias_semana` |
| `models/dashboardModel.js` | ✅ ya leía `'Lunes,Jueves'` → array |
| `views/post/profile.ejs` + `public/js/profile.js` | ✅ ya tenía el selector de días |
| **`views/post/configuracion.ejs`** | ❌ **seguía con el selector numérico 1d…7d** |
| **`public/js/configuracion.js`** | ❌ **enviaba `daysPerWeek: 3` (número) y nunca `days`** |

Como `/configuracion` guarda por el **mismo endpoint** (`POST /profile` → `validateProfile` → `saveProfile`), el validador recibía un payload sin `days` y lo rechazaba con 400. El guardado de `/configuracion` **nunca funcionó** desde que se migró el wizard.

## 3. Solución implementada

Se reemplaza el selector numérico por el **mismo selector de días del wizard**, reutilizando el flujo de guardado que ya existía. **No se duplica nada**: `/configuracion` sigue guardando por `POST /profile`.

```
GET /configuracion → getProfileByUser → { perfil.days: ['Lunes','Jueves'] }
                                            │
                          configuracion.ejs  │  (embebe perfil.days)
                                            ▼
                                   configuracion.js  (state.days)
                                            │
                         POST /profile  ◀────┘
                                │
                   validateProfile →  profileData.days = ['Lunes','Jueves']
                                │
                   profileModel.saveProfile
                                │
              INSERT ... ON DUPLICATE KEY UPDATE
              preferencia_entrenamiento.dias_semana = 'Lunes,Jueves'
                                │
              dashboardModel.getPerfil  →  dias: ['Lunes','Jueves']  →  /dashboard
```

### El comando de guardado (sin cambios, verificado)

`models/profileModel.js:143-151` — sigue siendo el mismo y **funciona**:

```sql
INSERT INTO preferencia_entrenamiento (id_cliente, entorno, dias_semana, minutos_sesion)
VALUES (?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  entorno = VALUES(entorno),
  dias_semana = VALUES(dias_semana),
  minutos_sesion = VALUES(minutos_sesion)
```

Como `id_cliente` es `UNIQUE`, **cada guardado sobrescribe la fila** (no duplica) → el cambio se refleja en la BD de inmediato.

## 4. Detalle de cambios por archivo

### 4.1 `views/post/configuracion.ejs` (líneas 188-196)

Se cambió el bloque:

```ejs
<label class="field-label">Días por semana que puedes entrenar</label>
<div class="segmented" data-group="daysPerWeek"> … 1d … 7d … </div>
```

por:

```ejs
<label class="field-label">Días de la semana que entrenas</label>
<span class="field-hint">Selecciona uno o más días</span>
<div class="segmented" data-group="days">
  <button type="button" class="segmented-opt" data-value="Lunes">Lunes</button>
  … Martes, Miercoles, Jueves, Viernes, Sabado, Domingo …
</div>
<span class="field-error" id="err-days"></span>
```

Idéntico al wizard (`views/post/profile.ejs:180-194`). **Sin CSS nuevo**: `.segmented`, `.segmented-opt`, `.field-hint` y `.field-error` ya existen en `public/css/profile.css`.

### 4.2 `public/js/configuracion.js` (6 puntos)

| Línea | Antes | Después |
|---|---|---|
| 32 | `daysPerWeek: String(inicial.daysPerWeek \|\| 3)` | `days: Array.isArray(inicial.days) ? inicial.days.slice() : []` |
| ~95 (nuevo) | — | función `setupDays()` (copia de la del wizard): pinta el estado inicial y alterna cada día |
| 98 | `setupSingleSelect("daysPerWeek", …)` | `setupDays()` |
| 127 | `marcarSeleccionado("daysPerWeek", …)` | **eliminada** (apagaría los días ya pintados) |
| ~312 (nuevo) | — | validación: `state.days.length === 0` → *"Selecciona al menos un día."* |
| 378 | `daysPerWeek: Number(state.daysPerWeek)` | `days: state.days.slice()` |

### 4.3 `models/routineModel.js` (cambio de coherencia, opcional)

`calcularResumen` recibía **solo el número** de días y armaba el plan con el preset `DIAS_PLAN` (3 días ⇒ L/X/V), o sea **ignoraba qué días eligió el usuario**. Ahora:

```js
const indicesDeDias = (dias) => { … }   // 'Jueves','Sabado' → [3,5]
const calcularResumen = (sesiones, diasElegidos, diasSemana) => {
  const total = Array.isArray(diasElegidos) && diasElegidos.length ? diasElegidos.length : diasSemana;
  const meta  = limitar(Number(total) || 3, 1, 7);
  const plan  = indicesDeDias(diasElegidos);
```

### 4.4 `controllers/dashboardController.js` (línea 23)

```js
const resumen = RoutineModel.calcularResumen(sesiones, perfil.dias, perfil.diasSemana);
```

## 5. Base de datos

**Ningún `ALTER TABLE`.** El esquema ya soportaba días por nombre:

- `preferencia_entrenamiento.dias_semana` es `VARCHAR(70)` (el cambio desde `TINYINT` ya se había aplicado en la base).
- El caso máximo son 7 días = **52 caracteres** < 70. ✔
- El `CHECK (char_length(dias_semana) > 0)` se cumple siempre.

**1 `UPDATE` de datos** (fila con formato numérico antiguo, `id_cliente = 2`, `dias_semana = '3'` + `dias_entreno = '0,2,4'`):

```sql
UPDATE preferencia_entrenamiento SET dias_semana = 'Lunes,Miercoles,Viernes' WHERE id_cliente = 2;
```

Sin este `UPDATE` esa fila devolvía `days: []` y el dashboard decía *"Aún no elegiste tus días de entrenamiento"*. La columna `dias_entreno` (legacy, `NULL` en las filas nuevas) se dejó intacta: nadie la lee.

## 6. Pruebas realizadas

| # | Prueba | Resultado |
|---|---|---|
| 1 | `node --check` en los 4 archivos JS | ✔ sin errores |
| 2 | Render EJS de `configuracion.ejs` | ✔ 7/7 botones de día, `data-group="days"`, `err-days`, `__PERFIL__.days` |
| 3 | `validateProfile` con el payload nuevo | ✔ `days = ["Martes","Jueves","Sabado"]` |
| 4 | `validateProfile` con el payload **anterior** | ✔ **400** con el mensaje esperado (confirma el bug) |
| 5 | SQL real del modelo en transacción + `ROLLBACK` | ✔ escribe `"Martes,Jueves,Sabado"`, sobrescribe sin duplicar filas, `ROLLBACK` deja 0 filas |
| 6 | `getProfileByUser` / `dashboardModel.getPerfil` | ✔ leen `["Lunes","Miercoles","Viernes"]` |
| 7 | `POST /login` + `POST /profile` + `GET /configuracion` + `GET /dashboard` (HTTP real, usuario temporal) | ✔ 201 · BD `"Martes,Jueves,Sabado"` → `"Jueves,Domingo"` · dashboard *"Entrenas los J, D"* |
| 8 | `POST /profile` sin `days` | ✔ 400 *"Selecciona al menos un día de entrenamiento válido."* |
| 9 | Lógica del cliente (DOM simulado con el JS real) | ✔ pintado inicial de los días guardados, clic alterna, payload con `days` y **sin** `daysPerWeek`, sin días ⇒ no envía y muestra el error |

El usuario y los datos usados en las pruebas 7 y 9 se **eliminaron al final** (verificado: 0 usuarios de prueba restantes).

## 7. Deuda técnica

- `preferencia_entrenamiento.dias_entreno` es una columna **legacy** sin uso (el código no la lee ni la escribe). Se puede eliminar con `ALTER TABLE ... DROP COLUMN dias_entreno` cuando nadie la use.
- `daysPerWeek` sigue existiendo en `profileData` como campo de **compatibilidad** (`validators.js:240`, `profileModel.js:290`) y alimenta `diasSemana` del dashboard ("3 días por semana"). Es correcto, pero ahora es **derivado** de `days`: nunca se envía desde el formulario.
- `models/dashboardModel.js` y `models/profileModel.js` devuelven el mismo dato en dos formatos distintos (ya estaba anotado como **E?** en `ERRORES-PENDIENTES.md`).

## 8. Reversión

**El código** (todo está en la rama `feature/dias-configuracion`, `main` está intacta):

```bash
git checkout main                      # vuelve al estado anterior
git branch -D feature/dias-configuracion
```

Si ya estuviera commiteado y pusheado:

```bash
git revert <hash>                      # commit inverso, no reescribe historia
```

**La base de datos**: no hay esquema que revertir. Solo el `UPDATE` del punto 5, que se deshace con:

```sql
UPDATE preferencia_entrenamiento SET dias_semana = '3' WHERE id_cliente = 2;
```
