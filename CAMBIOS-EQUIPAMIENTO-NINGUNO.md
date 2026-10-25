# Cambio: "Equipamiento disponible: Ninguno" se pierde al volver a `/configuracion`

> **Estado:** IMPLEMENTADO — pendiente de commit
> **Fecha:** 21-10-2026
> **Archivos afectados:** 3 (2 modificados, 1 nuevo) + `ERRORES-PENDIENTES.md`
> **Base de datos:** sin cambios de esquema (los datos guardados no cambian de formato)
> **Riesgo:** bajo — el cambio es solo de lectura/presentación; el guardado sigue usando el mismo `POST /profile` de siempre

---

## 1. Problema reportado

Al entrar a `/configuracion`, todo se mantenía como se había ingresado **excepto la opción de equipamiento "Ninguno"**, que aparecía sin seleccionar. Peor: si el usuario tocaba "Guardar cambios" sin volver a marcar el chip, el formulario **se bloqueaba** con el error *"Selecciona el equipamiento."*, sin dejar guardar nada.

## 2. Causa raíz

El problema no estaba en la vista EJS sino en el **ida y vuelta** de la selección exclusiva.

**Al guardar** (`middlewares/validators.js` → `models/profileModel.js`):

```js
// validators.js — el chip exclusivo se filtra antes de guardar
equipment: [...new Set(b.equipment.filter((e) => e !== 'Ninguno'))],   // → []

// profileModel.js — cero elementos = cero filas
await conn.query('DELETE FROM cliente_equipamiento WHERE id_cliente = ?', [idCliente]);
for (const item of data.equipment) { /* no se inserta nada */ }
```

**Al leer** (`models/profileModel.js` → `getProfileByUser`):

```js
equipment: equips.map((r) => r.nombre),   // → []  (no hay filas)
```

**Al pintar** (`public/js/configuracion.js`):

```js
equipment: Array.isArray(inicial.equipment) ? inicial.equipment.slice() : [],   // → []
marcarMulti("equipment", state.equipment);                                     // → ningún chip marcado
```

Es decir: **"cero filas" no se distinguía de "nada seleccionado"**. Como "Ninguno" significa justamente "cero elementos", el modelo de datos perdía la información de que el usuario *sí* había hecho una elección explícita. El chip "Ninguno" volvía desmarcado y, si no lo volver a marcar, la validación del cliente (línea 332: `if (state.equipment.length === 0)`) rechazaba el guardado.

**El mismo defecto exacto existía en "Ninguna" de lesiones** (`injuries: antecedentes` → `[]` → ningún chip marcado). Ahí no había validación que lo delatara, pero la selección igualmente se perdía visualmente.

## 3. Solución implementada

Se conservó la representación actual en la BD (**cero filas = sin equipamiento/lesiones**, que es la que usa el generador de rutinas) y se arregló la **capa de lectura y de presentación**, que es donde se perdía el dato.

### 3.1 `models/profileModel.js` — `getProfileByUser()`

```js
// "Ninguna"/"Ninguno" no se guardan: equivalen a cero filas en la BD.
// Si no hay elementos, la única selección posible que el usuario hizo
// fue esa, y hay que devolverla explícita para que el formulario la
// muestre marcada (si no, el chip aparece sin seleccionar y el
// guardado se bloquea con "Selecciona el equipamiento").
injuries: antecedentes.length ? antecedentes : ['Ninguna'],
...
equipment: equips.length ? equips.map((r) => r.nombre) : ['Ninguno'],
```

El modelo ahora devuelve **la selección que el usuario hizo**, no solo las filas que quedaron. Cuando hay datos reales, se devuelven tal cual (sin defaults).

### 3.2 `public/js/configuracion.js` — estado inicial (fallback defensivo)

```js
injuries: Array.isArray(inicial.injuries) && inicial.injuries.length
  ? inicial.injuries.slice()
  : ["Ninguna"],
...
equipment: Array.isArray(inicial.equipment) && inicial.equipment.length
  ? inicial.equipment.slice()
  : ["Ninguno"],
```

El mismo default en la capa de UI: la vista no depende de que el modelo esté siempre actualizado. Con esto, el bloque que ya existía (líneas 168-176) que **deshabilita el resto de los chips** cuando "Ninguno"/"Ninguna" está activo, hace su trabajo automáticamente.

### 3.3 El ciclo queda estable

```
BD (cero filas)
   └─ getProfileByUser  →  ['Ninguno']
        └─ el formulario lo muestra marcado
             └─ POST /profile  →  validateProfile acepta 'Ninguno'
                  └─ saveProfile lo filtra a []  →  BD (cero filas)   ⟳
```

Guardar **no** degrada la información: se reenvía `['Ninguno']`, el validador lo acepta (ya estaba contemplado: `b.equipment.every((e) => e === 'Ninguno' || ...)`), y `saveProfile` lo vuelve a convertir en cero filas. El siguiente guardado funciona igual.

## 4. Archivos tocados

| Archivo | Cambio |
|---|---|
| `models/profileModel.js` | `getProfileByUser()`: devuelve `['Ninguno']` / `['Ninguna']` cuando no hay elementos |
| `public/js/configuracion.js` | Estado inicial: fallback a `["Ninguno"]` / `["Ninguna"]` |
| `CAMBIOS-EQUIPAMIENTO-NINGUNO.md` | Este documento (nuevo) |
| `ERRORES-PENDIENTES.md` | Nueva entrada **E25** en "Resueltos" |

**No se tocó**: `sql/schema.sql`, `dashboardModel.getPerfil`, `public/js/profile.js` (wizard), `middlewares/validators.js` ni `saveProfile()`.

## 5. Por qué NO se guardó 'Ninguno' como fila en la BD

La alternativa era persistir la elección explícita (fila sentinel en el catálogo `equipamiento` o columna nueva). Se descartó porque:

- El catálogo `equipamiento` se consume en el **generador de rutinas**: una fila 'Ninguno' se filtraría por todos lados.
- `clientes`/`cliente_equipamiento` **no tienen** columna para marcar "sin equipamiento": habría que hacer `ALTER TABLE` sobre la BD real (que ya está desalineada con `schema.sql` — ver **R10** de `ERRORES-PENDIENTES.md`).
- "Cero filas" **ya significa** "sin equipamiento" en todo el sistema; el problema era solo de ida y vuelta en el formulario, no de almacenamiento.

## 6. Seguridad

Sin cambios: la ruta sigue con `requireAuth`, el guardado con `validateProfile` + SQL parametrizado, y el `id_usuario` se sigue tomando de la sesión. El fix no introduce ninguna entrada de datos nueva ni ninguna consulta nueva.

## 7. Pruebas realizadas

### 7.1 Verificación estática

```
node --check models/profileModel.js     → OK
node --check public/js/configuracion.js → OK
```

### 7.2 Verificación funcional sin BD (16/16 OK)

Simulación del round-trip completo con el `validateProfile` real:

```
=== 1) Cliente: sin equipamiento guardado ===
  OK   | equipment [] -> ["Ninguno"] (chip se muestra marcado)
  OK   | injuries  [] -> ["Ninguna"] (chip se muestra marcado)
  OK   | equipment con datos NO se pisa
  OK   | injuries con datos NO se pisa

=== 2) Modelo: cero filas -> selección explícita ===
  OK   | equips [] -> ["Ninguno"]
  OK   | antecedentes [] -> ["Ninguna"]
  OK   | equips con filas -> nombres reales
  OK   | antecedentes con filas -> nombres reales

=== 3) Round-trip completo: guardar -> leer -> guardar ===
  OK   | POST /profile con ["Ninguno"] -> ACCEPTADO (no bloquea)
  OK   | lo que se guarda en BD -> [] (cero filas)
  OK   | re-lectura -> ["Ninguno"] (se mantiene)
  OK   | segundo guardado -> ACCEPTADO (ciclo estable, no se degrada)

=== 4) El formulario ya no queda trabado ===
  OK   | estado inicial tiene el chip exclusivo -> validate() del cliente pasa
  OK   | sin doble seleccion de "Ninguno"

=== 5) Usuario con equipamiento real (no se rompe nada) ===
  OK   | POST con ["Mancuernas","Banco"] -> ACCEPTADO
  OK   | se guardan los dos, sin defaults
  OK   | lesiones reales se guardan

=== 6) Selector sin equipamiento sigue dando error (correcto) ===
  OK   | POST con [] -> RECHAZADO con "Selecciona el equipamiento"
```

### 7.3 Checklist manual (requiere BD)

1. `npm run dev`, iniciar sesión con una cuenta **con** perfil guardado.
2. Menú del avatar → **Configuración** → el equipamiento y las lesiones deben salir **marcados** como estaban.
3. Guardar con "Ninguno" en equipamiento → recargar → el chip **"Ninguno" aparece marcado** y los demás deshabilitados.
4. "Guardar cambios" sin tocar nada → **alerta verde** (ya no se bloquea).
5. Cambiar a "Mancuernas" + "Banco" → guardar → recargar → ambos marcados.
6. Repetir con "Ninguna" en lesiones → el chip queda marcado.
7. Dashboard → los chips de equipamiento se ven igual que antes.
8. Desmarcar "Ninguno" a propósito y guardar → debe aparecer el error *"Selecciona el equipamiento."* (comportamiento correcto).

## 8. Cómo REVERTIR este cambio (si no se aprueba)

Como **no se hizo commit**, el revert es immediate:

```bash
git restore models/profileModel.js public/js/configuracion.js ERRORES-PENDIENTES.md
rm CAMBIOS-EQUIPAMIENTO-NINGUNO.md
```

No hay migraciones ni cambios en la base de datos: **no queda ningún efecto residual**. Los datos guardados siguen siendo los mismos ("Ninguno" = cero filas, exactamente igual que antes del fix).

Si ya se commiteó: `git revert <hash>` (deja el historial intacto) o `git reset --hard 4d25ff0` (lo saca del historial local).
