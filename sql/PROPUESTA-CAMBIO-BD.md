# Propuesta de cambio de base de datos — GEKO

**Para:** equipo de desarrollo / responsable técnico
**De:** equipo de GEKO (vía Open Code)
**Fecha:** 2026-10-05
**Estado:** propuesta en revisión · **Nada de esto está aplicado todavía**

---

## 1. Resumen para quien tenga 30 segundos

La aplicación ya permite iniciar sesión con Google y recuperar contraseña por
correo. Ambas funciones funcionan sobre el esquema actual, **sin tocar la base
de datos**.

Pero aparece un problema que **no se puede resolver en código**, porque la
tabla `usuarios` no guarda ninguna información sobre **cómo** se autentica
una cuenta. Consecuencias:

1. No se puede distinguir una cuenta creada con Google de una cuenta normal.
2. No se puede saber si a una cuenta se le puede permitir recuperar contraseña.
3. Apple Sign In no se puede implementar, porque Apple no devuelve el correo
   y el correo es la única llave de la tabla.

Proponemos **agregar una columna** a `usuarios`. Nada más: ni tablas nuevas,
ni borrados, ni cambios en otras tablas.

---

## 2. El problema en detalle

### 2.1 Cómo funciona hoy el registro con Google

Cuando alguien entra con Google por primera vez, Google entrega el correo,
el nombre y el apellido. Pero en `usuarios` hay tres columnas que **no**
entrega Google y que son obligatorias:

```sql
numero         VARCHAR(20) NOT NULL UNIQUE
nombre_usuario VARCHAR(50) NOT NULL UNIQUE
apellido       VARCHAR(50) NOT NULL
```

Por eso la aplicación pide esos 3 datos en una pantalla intermedia antes de
crear la cuenta.

Como `contrasena_hash` es `NOT NULL`, a la cuenta social hay que
guardarle *alguna* contraseña. La aplicación le pone una aleatoria:

```js
contrasena_hash = bcrypt(randomBytes(32))
```

Es una contraseña que nadie conoce, así que la cuenta **no** se puede entrar
con usuario y contraseña. Está bloqueada de hecho, pero no de forma explícita.

### 2.2 Los tres problemas que esto genera

**Problema A — Una cuenta social puede "ganar" una contraseña.**
La recuperación de contraseña ya funciona. Si alguien con una cuenta creada con
Google la usa, el sistema le escribe una contraseña nueva y ahora esa cuenta
tiene **dos** formas de entrar: Google y contraseña. Puede entrar por cualquiera
de las dos, y el equipo no tiene forma de saber cuál es la esperada.

**Problema B — No hay forma de bloquearlo ni de auditarlo.**
Como las dos clases de cuenta son indistinguibles, no se puede:
- bloquear el acceso por contraseña a las cuentas sociales,
- auditar cuántos usuarios entraron por Google,
- mostrar en el perfil "iniciaste sesión con Google".

**Problema C — Apple Sign In es imposible sin esto.**
Apple **no entrega el correo** en el primer paso, salvo que se solicite
explícitamente en un segundo paso de autorización. Si Apple no da el correo,
no hay forma de encontrar la fila de `usuarios`, porque `correo` es la única
columna que identifica a la persona y además es `UNIQUE`.

---

## 3. Lo que se solicita

### Cambio único propuesto

```sql
ALTER TABLE usuarios
  ADD COLUMN usuario_proveedor VARCHAR(20) NOT NULL DEFAULT 'local';
```

**Una columna. Nada más.**

Qué resuelve:
- `usuario_proveedor = 'local'` → cuenta con contraseña.
- `usuario_proveedor = 'google'` → cuenta que entra con Google.
- Con eso, `login` puede rechazar el acceso por contraseña a las cuentas
  sociales, y la recuperación puede avisar "esta cuenta usa Google, entra con
  Google" en lugar de entregar una contraseña nueva.

---

## 4. Cambio adicional, solo si se decide implementar Apple

Apple no entrega el correo, así que hace falta guardar el identificador que
sí entrega:

```sql
ALTER TABLE usuarios
  ADD COLUMN proveedor_id_externo VARCHAR(255) NULL,
  ADD UNIQUE INDEX uq_usuarios_proveedor_externo
    (usuario_proveedor, proveedor_id_externo);
```

- Google entrega este identificador en el campo `sub`.
- Apple también lo entrega, en el campo `sub`.
- Se deja `NULL` en las cuentas locales, por eso es `NULL` y no `NOT NULL`.

**Este segundo cambio no es necesario si el proyecto sigue sin Apple.**
Ver sección 6.

---

## 5. Alternativas que se evaluaron y se descartaron

| Alternativa | Por qué no |
|---|---|
| Dejar `contrasena_hash` y asumir que la recuperación aplica a todas las cuentas | Es lo que hace la versión actual. Funciona, pero deja el Problema A abierto |
| Usar un valor centinela en `contrasena_hash` para marcar cuentas sociales | Frágil. Nada impide que alguien escriba ese valor. No es una garantía |
| Crear una tabla `proveedores` y otra `usuario_proveedor` (relacional, con FK) | Más correcto en la teoría, pero para 2 o 3 valores de texto es sobreingeniería. Aporte bajo frente al costo de migrar |
| Usar una tabla aparte solo para cuentas sociales | Duplica el alta de usuario y rompe la FK con `clientes` |

---

## 6. Preguntas que necesitamos que respondan

1. **¿Se aprueba agregar `usuario_proveedor`?** Sin esto no se puede cerrar el
   punto de seguridad de las cuentas sociales.
2. **¿Debe una cuenta creada con Google poder establecer contraseña?**
   - Opción 1: sí, y queda con dos accesos (comportamiento actual).
   - Opción 2: no. La cuenta social **no** puede recuperar contraseña; el
     sistema le responde "esta cuenta se creó con Google, entra con Google".
   Recomendamos la **opción 2**: una sola forma de entrar por cuenta es más
   fácil de soportar y de auditar.
3. **¿Se sigue adelante con Apple?** Requiere USD 99 al año. Si la respuesta
   es no, la sección 4 queda descartada y solo se pide la columna de la
   sección 3.
4. **Nombre de la columna.** El esquema está en español, por lo que
   `usuario_proveedor` es consistente. Si prefieren nomenclatura inglesa,
   diganlo y se cambia antes de aplicar.
5. **¿En qué entornos se aplica?** Nosotros no tenemos acceso a la base de
   datos de producción. Necesitamos que alguien del equipo aplique el `ALTER`
   en cada entorno y nos confirme.

---

## 7. Detalles técnicos para quien aplique el cambio

### Seguridad de la migración
El `ALTER` es **no destructivo y compatible hacia atrás**:

- Los 3 usuarios existentes quedan con `usuario_proveedor = 'local'`, que es
  su comportamiento real hoy.
- La columna tiene `DEFAULT`, así que los `INSERT` que no la mencionen siguen
  funcionando. **Ninguna consulta existente necesita modificarse.**
- No hay que actualizar filas, no hay downtime y no hay que bloquear la tabla.

### Verificación posterior

```sql
-- 1. Comprobar que la columna existe
SHOW COLUMNS FROM usuarios LIKE 'usuario_proveedor';

-- 2. Comprobar que los datos previos quedaron correctos
SELECT usuario_proveedor, COUNT(*) AS total
FROM usuarios
GROUP BY usuario_proveedor;

-- 3. Antes de aplicar: respaldar
CREATE TABLE usuarios_backup AS SELECT * FROM usuarios;
```

### Rollback

```sql
ALTER TABLE usuarios DROP COLUMN usuario_proveedor;
```

> Nota: el rollback descarta los valores de la columna. Si llegan a aplicarse
> los cambios de la sección 4, respaldar antes.

---

## 8. Lo que cambia en el código después de aprobarlo

Nada de esto está escrito todavía. Se hace **solo** después de la aprobación:

| Archivo | Cambio |
|---|---|
| `models/userModels.js` | `SELECT` incluye la columna nueva; `create` la recibe |
| `controllers/authControllers.js` | `googleCallback` guarda `'google'`; `login` rechaza contraseña en cuentas sociales; recuperación avisa en vez de entregar contraseña |
| `sql/schema.sql` | Se agrega la columna al `CREATE TABLE usuarios` |

La aplicación sigue funcionando igual mientras la columna no exista, porque
todo el código nuevo es opcional hasta que se apruebe.

---

## 9. Nota sobre el estado actual

- No hay ninguna migración aplicada. La base de datos está intacta.
- La recuperación de contraseña **no usa tabla de tokens**: los tokens se firman
  en el servidor con HMAC y `SESSION_SECRET`, con 15 minutos de vigencia. Por
  eso no se necesita ninguna tabla extra para ese flujo.
- Si en el futuro se necesita **revocar** un enlace de recuperación ya enviado,
  eso sí requeriría una tabla. Hoy no es un requisito: los enlaces expiran
  solos y no se pueden revocar. Con avisamos si hace falta.
