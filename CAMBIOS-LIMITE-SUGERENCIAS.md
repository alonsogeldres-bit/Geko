# Cambio: límite semanal de sugerencias + modal Premium en `/dashboard`

> **Estado:** IMPLEMENTADO — **pendiente de commit** (a pedido del usuario: sin commit)
> **Fecha:** 24-10-2026
> **Archivos afectados:** 4 modificados + 3 nuevos + `sql/schema.sql` sincronizado
> **Base de datos:** **nueva tabla** `uso_sugerencia` (migración idempotente ya aplicada en la BD local)
> **Riesgo:** bajo — solo afecta al botón "Cambiar sugerencia" del dashboard; no toca login, registro, perfil ni pagos

---

## 1. Problema reportado

En `/dashboard`, el botón **"↻ Cambiar sugerencia"** llegaba a **3/3** y se deshabilitaba. Se pidió:

1. Mantener el límite de **3 sugerencias** para el plan Gratis.
2. Al presionar de nuevo estando en **3/3**, mostrar una **ventana flotante** avisando que la función es de Premium, con un botón al final que lleve a **`/planes`**.
3. Que el contador **se restablezca a 1/3 cada semana**, para que el plan Gratis no quede limitado para siempre.

## 2. Causa raíz

| Capa | Estado antes |
|---|---|
| `controllers/dashboardController.js` | `alt = 0` fijo en cada carga ("modo prueba"): el contador nunca se guardaba |
| `controllers/dashboardController.js` | `POST /dashboard/sugerencia` devolvía cualquier variante sin aplicar tope |
| `public/js/dashboard.js` | Deshabilitaba el botón al llegar a 3/3, así que no había clic que pudiera abrir un modal |
| Base de datos | No existía ninguna tabla/columna que registrara el consumo semanal |

## 3. Solución implementada

```
GET /dashboard
  ├─ Premium → sugerencia ilimitada (como antes)
  └─ Gratis  → uso_sugerencia (semana actual) → variante 1..3

POST /dashboard/sugerencia
  ├─ Premium → rota infinitamente (1,2,3,1,2,3…)
  └─ Gratis  → avanzarUso()
                ├─ quedan vistas → 200 con la siguiente variante
                └─ ya está en 3  → 402 { error: 'LIMITE_SEMANAL' }
                                    └─ dashboard.js abre el modal
                                       └─ botón "Ver planes" → /planes
```

### Semana y reinicio

- La semana empieza el **lunes a las 00:00**.
- `semana_inicio` se calcula en MySQL:
  `DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)`.
- El reinicio a **1/3 es automático**: al cambiar de semana no existe fila y el modelo devuelve índice 1. No hay cron ni job de reinicio.
- Las filas de más de **8 semanas** se borran de forma diferida (máximo una limpieza por hora).

### Concurrencia

`avanzarUso()` abre una transacción y bloquea la fila del cliente (`SELECT ... FOR UPDATE`) antes de leer/escribir el uso. Dos clics simultáneos o dos pestañas no pueden superar el límite.

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `sql/migracion-limite-sugerencias.sql` | **Nuevo.** Crea `uso_sugerencia` (idempotente) |
| `sql/schema.sql` | Sincronizado con la nueva tabla (evita drift tipo E1) |
| `models/sugerenciaUsoModel.js` | **Nuevo.** `getUso()` y `avanzarUso()` |
| `controllers/dashboardController.js` | Retoma la variante semanal; aplica el límite y responde `402` |
| `views/post/dashboard.ejs` | Botón sin `disabled`, con `data-indice/variantes/ilimitado`; incluye el modal |
| `views/partials/upgrade_modal.ejs` | **Nuevo.** Modal "Función Premium" con botón a `/planes` |
| `public/css/dashboard.css` | Estilos del modal (overlay, tarjeta, botón, foco) |
| `public/js/dashboard.js` | Abre el modal en 3/3 o ante `402`; cierre con Escape/fondo y foco devuelto |

## 5. Verificación ejecutada

- Migración aplicada: columnas `id_uso, id_cliente, semana_inicio, ultimo_indice, actualizado_en` e índices `PRIMARY`, `uq_uso_sugerencia_semana`, `idx_uso_sugerencia_semana`.
- Modelo con un cliente Gratis: `1 → 2 → 3 → alcanzado`; una cuarta llamada no consume ni cambia el índice.
- Reinicio semanal simulado (fila de la semana pasada en 3/3): `getUso()` devuelve 1 y el primer clic crea la fila de la semana actual.
- Controlador de punta a punta con un cliente Gratis: `200 (2/3)`, `200 (3/3)`, `402 LIMITE_SEMANAL`, `402 LIMITE_SEMANAL`; `GET /dashboard` renderiza 3/3.
- Cliente Premium activo: variantes `1→2→3→1→2` con `ilimitado: true` y **cero filas** en `uso_sugerencia`.
- Vista EJS renderizada sin errores: `data-indice="3"`, contador `(3/3)`, sin `disabled` y modal incluido.
- Datos de prueba eliminados de `uso_sugerencia` al terminar.

## 6. Comportamiento por caso

| Caso | Resultado |
|---|---|
| Recargar el dashboard dentro de la semana | Mantiene la variante y el contador (1/3, 2/3 o 3/3) |
| Clic en 3/3 | Modal Premium, sin llamada al servidor |
| Clic forzado a la API en 3/3 | `402` (el servidor no confía en `alt` del cliente) |
| Lunes siguiente | Vuelve a 1/3 automáticamente |
| Premium | Ilimitado, sin tocar el contador |
| Baja de Premium a mitad de semana | Conserva el índice consumido |
| Error de BD | `500` con mensaje genérico |
