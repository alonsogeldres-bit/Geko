# Cambio: rutinas con IA (Gemini) dentro de `/entrenamiento`

> **Estado:** IMPLEMENTADO — **pendiente de commit**
> **Fecha:** 21-10-2026
> **Alcance:** la pantalla `/entrenamiento` ahora arma la rutina del día con Google Gemini.
> **Decisiones de producto:** la rutina es **gratis para todos** por ahora (el gating Premium se
> configura más adelante) y el prompt usa **solo tiempo y lugar** de entrenamiento.
> **Base de datos:** **sin cambios de esquema**. No se guarda nada de la rutina.
> **Riesgo:** bajo — no toca login, registro, recuperación ni el wizard de primer uso.

---

## 1. Qué se implementó

| Archivo | Cambio |
|---|---|
| `services/geminiService.js` | **Nuevo.** Cliente de la API de Gemini: prompt, reintentos, timeout y normalización de la respuesta |
| `services/localRoutineService.js` | **Nuevo.** Generador de respaldo con la misma estructura de salida |
| `controllers/trainingController.js` | Llama al servicio, cachea la rutina del día en la sesión y maneja los errores |
| `views/post/entrenamiento.ejs` | Reemplaza el placeholder "Esta pantalla estará lista pronto" por la rutina real |
| `public/css/dashboard.css` | Estilos `.rutina-ia`, `.ejercicio-card`, `.lista-ejercicios` (se eliminó el CSS muerto `.soon-empty`) |
| `package.json` / `package-lock.json` | Dependencia `@google/generative-ai` (`^0.24.1`) |
| `TUTO.md` | Paso 7 nuevo: cómo obtener la `GEMINI_API_KEY` |

**No hay rutas nuevas.** Todo vive en `GET /entrenamiento`, que ya existía.

---

## 2. Decisiones de producto

| Decisión | Motivo |
|---|---|
| **Sin ruta aparte** (`/entrenamiento/ia` no existe) | La rutina es parte de la pantalla de entrenamiento, no una sección aparte |
| **Gratis para todos** | El gating Premium (`requirePaidPlan`) se configura más adelante, cuando exista la función de pago |
| **Solo tiempo y lugar** | El prompt no recibe edad, peso, objetivo, nivel, lesiones ni equipamiento: la rutina se arma con `minutos_sesion` y `entorno` del perfil |
| **Cero persistencia** | La rutina no se guarda en la base: se regenera y se cachea en la sesión |

---

## 3. Flujo de la pantalla

```
GET /entrenamiento?nueva=1        (nueva=1 fuerza una rutina nueva)
   │
   ├─ requireAuth                  -> sin sesión: redirect /login
   ├─ DashboardModel.getPerfil     -> sin perfil: redirect /profile
   ├─ sin minutos_sesion o entorno -> redirect /configuracion
   ├─ RoutineModel.construirSugerencia(perfil, alt)
   │                                  (el encabezado "Rutina de hoy", como siempre)
   │
   └─ generarRutinaPersonalizada({ tiempoDisponible, lugarEntrenamiento })
         │
         ├─ hay rutina cacheada de HOY en la sesión y no se pide nueva -> se reutiliza
         │
         └─ se llama a Gemini:
                ├─ respuesta OK -> se normaliza y se cachea (session.rutinaIA)
                ├─ 503 / 429 / timeout -> se reintenta 1 vez y, si falla, rutina local
                └─ otro error -> la vista muestra el mensaje de error y el plan del perfil
```

La rutina cacheada en la sesión vive en `req.session.rutinaIA = { fecha, rutina }` y se
descarta sola cuando cambia el día (`RoutineModel.aFechaISO`).

---

## 4. Contrato con Gemini

El prompt pide **solo** un JSON válido con esta forma:

```json
{
  "calentamiento":   [{ "nombre": "string", "duracionMin": number, "descripcion": "string" }],
  "rutinaPrincipal": [{ "nombre": "string", "series": number, "repeticiones": number,
                         "descansoSeg": number, "descripcion": "string" }],
  "estiramiento":    [{ "nombre": "string", "duracionMin": number, "descripcion": "string" }],
  "tiempoTotalMin": number,
  "lugarEntrenamiento": "string"
}
```

`normalizarRutina()` deja esa estructura lista para la vista: si el modelo omite un campo,
devuelve tipos raros o no manda ejercicios, se completan con valores por defecto y nunca
se rompe el render.

### Control de saturación

| Situación | Qué hace el servicio |
|---|---|
| `503 high demand` / `429` / `quota` | Reintenta una vez esperando 1,5 s |
| Timeout de la llamada (`GEMINI_TIMEOUT_MS`, 10 s por defecto) | Cuenta como saturación: reintenta y luego cae al respaldo |
| Sigue fallando | Devuelve la rutina del generador local (`fuente: 'local'`) |

La vista marca las rutinas de respaldo con la etiqueta **"Rutina de respaldo"**, para no
hacer pasar por generada una rutina que no salió del modelo.

---

## 5. Variables de entorno

```dotenv
GEMINI_API_KEY=          # obligatoria para usar Gemini (sin ella hay respaldo)
GEMINI_MODEL=            # opcional, por defecto gemini-3.8-flash
GEMINI_TIMEOUT_MS=       # opcional, por defecto 10000 (10 s por llamada)
```

> `gemini-2.5-flash` devuelve `404` para cuentas nuevas: el modelo por defecto es
> `gemini-3.8-flash`.

---

## 6. Pruebas realizadas

| # | Prueba | Resultado |
|---|---|---|
| 1 | `node --check` en los 3 JS tocados | ✔ sin errores |
| 2 | Render EJS de `entrenamiento.ejs` con rutina, con error y con rutina de respaldo | ✔ 13/13 comprobaciones |
| 3 | Generador local con `45 min` / `Gimnasio` | ✔ estructura igual a la de Gemini |
| 4 | Llamada real a Gemini (`45 min` / `Casa`) | ⚠️ la API respondió `503 high demand` en las 12 pruebas del día (Google estaba saturado): el servicio cayó al respaldo local, que es lo esperado. El prompt y el parseo del JSON quedaron verificados por código, no por una respuesta real del modelo |
| 5 | Gemini saturado (503 `high demand`) | ✔ cae a la rutina local en ~3 s, con la etiqueta "Rutina de respaldo" |
| 6 | `GET /entrenamiento` con usuario real (login HTTP) | ✔ 200, 8 ejercicios, 3 bloques |
| 7 | `GET /entrenamiento` repetido | ✔ 0,8 s (cache de sesión, sin llamar a la API) |
| 8 | `GET /entrenamiento?nueva=1` | ✔ regenera la rutina |
| 9 | Perfil sin `minutos_sesion`/`entorno` | ✔ 302 → `/configuracion` |
| 10 | Sin `GEMINI_API_KEY` | ✔ devuelve la rutina local en 1 ms, sin romper la pantalla |
| 11 | Usuario y cliente temporales de las pruebas | ✔ borrados (0 usuarios de prueba) |

---

## 7. Deuda técnica

- **E24 sigue pendiente**: la función premium existe (la rutina IA) pero todavía **no** se
  aplica `requirePaidPlan`. Cuando se defina, es agregar el middleware a `GET /entrenamiento`.
- **La sesión es en memoria** (E6): al reiniciar el servidor se vuelve a pedir la rutina.
- **No se registra la sesión de entrenamiento**: la rutina se muestra, pero todavía no se
  guarda qué se hizo (sigue siendo el hueco del placeholder original).
- **La rutina es efímera**: no hay historial ni "rutina del día" para comparar.

---

## 8. Reversión

```bash
git checkout -- controllers/trainingController.js views/post/entrenamiento.ejs public/css/dashboard.css
rm services/geminiService.js services/localRoutineService.js
npm uninstall @google/generative-ai
```

No hay cambios de base de datos que revertir.
