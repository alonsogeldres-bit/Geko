# PayPal — pago único: estado de suscripciones y planes

> **Fecha:** 21-10-2026
> **Alcance:** flujo de pago con PayPal (Checkout Orders API v2) y persistencia del estado de la suscripción.
> **Decisión de producto:** pago único mensual. No hay cobro automático ni `paypal_subscription_id`.
> **No se guardan capturas** (`paypal_capture_id`): la orden se verifica y captura, pero solo se persiste su `order_id`.

---

## 1. Qué se implementó

| Archivo | Cambio |
|---|---|
| `sql/schema.sql` | **Actualizado.** Incluye los cambios de PayPal (`precio_usd`, `paypal_order_id`, `moneda` y `webhook_evento`). El archivo de migración se eliminó al quedar el esquema como única fuente de verdad |
| `models/planModel.js` | Checkout pendiente, vínculo con la orden, activación idempotente, rechazos y expiración |
| `controllers/planController.js` | Validación de monto/moneda, control de concurrencia, webhook con firma e idempotencia |
| `config/paypal.js` | `verifyWebhookSignature` |
| `views/post/planes.ejs` | Estado real del plan, checkout pendiente y precio USD |
| `public/css/paywall.css` | Estilos para estado y precio USD |
| `routes/planRoutes.js` | Comentarios actualizados a PayPal |

---

## 2. Base de datos

### Columnas nuevas

| Tabla | Columna | Tipo | Uso |
|---|---|---|---|
| `tipo_plan` | `precio_usd` | `DECIMAL(10,2) NULL` | Precio real que se cobra en PayPal (PayPal no soporta CLP) |
| `pago` | `paypal_order_id` | `VARCHAR(64) NULL` + `UNIQUE` | Id de la orden de PayPal (`ORDER_ID`) |
| `pago` | `moneda` | `VARCHAR(3) NOT NULL DEFAULT 'USD'` | Moneda del pago; los históricos quedaron en `CLP` |

### Tabla nueva

```sql
CREATE TABLE webhook_evento (
  id_evento VARCHAR(64) PRIMARY KEY,
  tipo VARCHAR(80) NOT NULL,
  recibido_en DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Sirve para no procesar dos veces el mismo evento de PayPal.

### Backfill aplicado

```sql
UPDATE tipo_plan SET precio_usd = 0    WHERE nombre_plan = 'Gratis';
UPDATE tipo_plan SET precio_usd = 9.99 WHERE valor > 0;
```

Ajusta esos valores si el catálogo real cambia.

---

## 3. Flujo de estados

```
POST /planes/premium
   │
   ├─ suscripcion = 'Pendiente' + pago = 'Pendiente' (USD)
   ├─ PayPal createOrder  →  se guarda pago.paypal_order_id
   └─ redirect a PayPal

Usuario paga
   │
   ├─ GET /planes/retorno?token=ORDER
   │     └─ getOrder → captureOrder → verificar monto/moneda → activar
   │
   └─ POST /webhook/paypal
         ├─ verifica firma (PAYPAL_WEBHOOK_ID)
         ├─ deduplica por event_id
         ├─ PAYMENT.CAPTURE.COMPLETED → activa
         ├─ PAYMENT.CAPTURE.DENIED    → pago 'Rechazado' + suscripción 'Cancelada'
         └─ PAYMENT.CAPTURE.REFUNDED  → pago 'Rechazado' + suscripción 'Cancelada'
```

### Estados de `suscripcion`

| Estado | Cuándo |
|---|---|
| `Pendiente` | Se inició el checkout y todavía no se confirmó el pago |
| `Activa` | Pago confirmado; `fecha_inicio = hoy`, `fecha_termino = hoy + 1 mes` |
| `Cancelada` | Pago rechazado, checkout abandonado (> 24 h) o reemplazada por otro plan |
| `Vencida` | `Activa` con `fecha_termino` pasada (se actualiza de forma diferida) |

La limpieza corre como máximo una vez por minuto, cuando se consulta el plan.

---

## 4. Reglas de consistencia implementadas

1. **Nunca se confía en el navegador**: la orden se reconsulta en PayPal antes de activar.
2. **Validación de monto y moneda**: si lo que devuelve PayPal no coincide con `pago.monto`/`pago.moneda`, no se activa.
3. **Idempotencia**: activar dos veces no extiende fechas; un evento repetido se ignora.
4. **Sin doble cobro**: una orden en vuelo (< 15 min) bloquea un checkout nuevo; además hay un lock en memoria por cliente y `SELECT ... FOR UPDATE` sobre `clientes`.
5. **Rechazos**: un pago denegado deja `pago = 'Rechazado'` y `suscripcion = 'Cancelada'`, permitiendo reintentar.
6. **Expiración**: las suscripciones vencidas pasan a `Vencida` sin job externo.
7. **Webhook seguro**: si `PAYPAL_WEBHOOK_ID` está configurado, una firma inválida responde `400`. Si el procesamiento falla, responde `500` para que PayPal reintente y borra el `event_id` para no bloquear el reintento.
8. **Respaldo de identificación**: `captureOrder` no siempre repite `custom_id` en su respuesta. Si falta, la suscripción se resuelve por `pago.paypal_order_id`.
9. **Reconciliación al entrar a `/planes`**: si hay un checkout pendiente con `paypal_order_id`, se reconsulta la orden y se activa si ya está `COMPLETED`. Cubre fallos del retorno del navegador o del webhook, sin capturar dos veces.

---

## 5. Configuración pendiente (producción/sandbox)

En el panel de PayPal:

1. Crear una app REST y copiar `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
2. Crear un webhook apuntando a `https://TU_DOMINIO/webhook/paypal`.
3. Suscribir los eventos:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`
4. Copiar el **Webhook ID** y agregarlo al `.env`:

```env
PAYPAL_WEBHOOK_ID=WH-XXXXXXXXXXXXXXXXXXXXXXXX
```

Mientras `PAYPAL_WEBHOOK_ID` esté vacío, el webhook sigue funcionando, pero valida la orden reconsultándola en PayPal en lugar de verificar la firma. Se registra un aviso una sola vez en el log.

`PLAN_PREMIUM_USD` ya no se usa: el precio sale de `tipo_plan.precio_usd`.

---

## 6. Verificación manual en sandbox

| Caso | Resultado esperado |
|---|---|
| Pago aprobado | `suscripcion = 'Activa'`, fechas cargadas, `pago = 'Pagado'`, `paypal_order_id` guardado |
| Cancelar en PayPal | Sin cambios de dinero; la suscripción queda `Pendiente`/`Cancelada` |
| Tarjeta rechazada | `pago = 'Rechazado'`, `suscripcion = 'Cancelada'`, se puede reintentar |
| Webhook duplicado | Segundo evento ignorado, sin doble activación |
| Dos pestañas | Solo una orden pagable; la segunda recibe `409` |
| `fecha_termino` pasada | Al entrar a `/planes`, la suscripción pasa a `Vencida` |
| Firma inválida | `400`, sin cambios en BD |

### Consultas de comprobación

```sql
SELECT s.id_suscripcion, s.estado, s.fecha_inicio, s.fecha_termino,
       tp.nombre_plan, p.monto, p.moneda, p.estado AS estado_pago,
       p.paypal_order_id
  FROM suscripcion s
  INNER JOIN tipo_plan tp ON tp.id_tipo_plan = s.id_tipo_plan
  LEFT JOIN pago p ON p.id_suscripcion = s.id_suscripcion
 ORDER BY s.id_suscripcion DESC;

SELECT * FROM webhook_evento ORDER BY recibido_en DESC LIMIT 20;
```

---

## 7. Fuera de alcance (decidido)

- **Cobro automático**: requeriría migrar a Subscriptions API (`paypal_subscription_id`, `BILLING.SUBSCRIPTION.*`, producto y billing plan en PayPal). No se implementó.
- **Reembolsos desde la app**: el webhook marca el pago como rechazado, pero no se inicia un reembolso desde el panel.
- **Capturas**: no se persiste `paypal_capture_id` por decisión explícita.
