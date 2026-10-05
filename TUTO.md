# TUTO — Configurar el entorno desde cero

> Guía para dejar el proyecto andando en una máquina nueva.
> Cada persona del equipo hace esto **una vez**. No se comparte `.env`.
>
> Complementa a `HILO.md` (que explica el estado del proyecto).
> Este documento solo explica cómo ponerlo a funcionar.

---

## Antes de empezar

### Qué necesitas

| Requisito | Versión | Notas |
|---|---|---|
| Node.js | 18 o superior | Se usó v26 durante el desarrollo |
| MySQL | 8.0 o superior | La base se llama `geko` |
| Una cuenta de Gmail | — | Para el login con Google y para enviar correos |
| Navegador | Cualquiero actual | |

### Instalar Node.js

Descárgalo de <https://nodejs.org>. Verifica la instalación abriendo una
terminal y ejecutando:

```bash
node -v
npm -v
```

Si aparece un número, quedó bien.

---

## Paso 1 — Clonar e instalar

```bash
git clone https://github.com/alonsogeldres-bit/Geko.git
cd Geko
npm install
```

`npm install` tarda un poco la primera vez porque `bcrypt` se compila en
tu equipo.

---

## Paso 2 — Crear la base de datos

Abre MySQL. Puedes usar MySQL Workbench, phpMyAdmin o la terminal.

Crea la base y las tablas ejecutando el script del proyecto:

```bash
mysql -u root -p < sql/schema.sql
```

> **Ojo:** `schema.sql` termina con varios `SELECT` de ejemplo. Se pueden
> ejecutar sin problema, solo muestran datos.

### Comprobar que se creó

```sql
USE geko;
SELECT COUNT(*) FROM usuarios;
```

Deberías ver **3**. Si aparece `0`, no se cargó el script.

---

## Paso 3 — Crear el archivo `.env`

Este archivo **no está en Git, es intencional**. Por eso hay que crearlo a mano
la primera vez. Contiene contraseñas, así que **nunca se sube ni se comparte**.

Copia el archivo de ejemplo y edítalo:

```bash
cp .env.example .env
```

Si no existe `.env.example`, créalo con el contenido de la sección siguiente.

Ábrelo con un editor de texto y pega esto completo:

```dotenv
# ==========================================
#  SERVIDOR
# ==========================================
PORT=6767
BASE_URL=http://localhost:6767

# Clave para firmar las cookies de sesion.
# Ver seccion "Generar SESSION_SECRET" mas abajo.
SESSION_SECRET=

# ==========================================
#  BASE DE DATOS MySQL
# ==========================================
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_NAME=geko

# ==========================================
#  LOGIN CON GOOGLE (OAuth 2.0)
# ==========================================
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:6767/auth/google/callback

# ==========================================
#  ENVIO DE CORREOS (recuperacion de contrasena)
# ==========================================
MAIL_USER=
MAIL_APP_PASSWORD=
MAIL_ENABLED=false
MAIL_FROM_NAME=GEKO

# Vigencia del enlace de recuperacion, en minutos
RECOVERY_TOKEN_TTL_MINUTES=15
```

---

## Paso 4 — Generar `SESSION_SECRET`

Es una cadena aleatoria de 64 caracteres que protege las sesiones. **Cada
máquina genera la suya.**

Copia, pega y ejecuta en la terminal:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado y ponlo en `.env`:

```dotenv
SESSION_SECRET=el_valor_que_salio_aqui
```

> **Nunca compartas ni subas esta clave.** Si se filtra, alguien puede
> falsificar sesiones. Si crees que quedó expuesta, genera otra y reinicia.

---

## Paso 5 — Login con Google

### 5.1 Crear el proyecto

1. Entra a <https://console.cloud.google.com>
2. Crea un proyecto nuevo (por ejemplo, `GEKO`)
3. Arriba a la izquierda, abre el selector de proyecto y elige el que creaste

### 5.2 Activar la API

1. Menú **APIs y servicios** → **Biblioteca**
2. Busca **Google People API** (es la que entrega nombre y correo)
3. Clic en **Activar**

> Si la API no está activada, el login muestra el error
> `sso_not_configured` aunque las claves estén bien puestas.

### 5.3 Crear las credenciales

1. **APIs y servicios** → **Credenciales**
2. **Crear credenciales** → **ID de cliente de OAuth**
3. **Tipo de aplicación:** Aplicación web
4. Ponle un nombre, por ejemplo `GEKO local`

### 5.4 Configurar el URI de redirección

En **URI de redirección autorizado** agrega exactamente esto:

```
http://localhost:6767/auth/google/callback
```

> Debe coincidir **carácter por carácter** con `GOOGLE_REDIRECT_URI` de tu
> `.env`, incluido el puerto. Si no coincide, Google rechaza el acceso.

### 5.5 Copiar las claves

Cuando crees el ID de cliente, Google muestra dos valores:

- **ID de cliente** → `GOOGLE_CLIENT_ID`
- **Secreto de cliente** → `GOOGLE_CLIENT_SECRET`

Pégalos en `.env`:

```dotenv
GOOGLE_CLIENT_ID=1234567890-abc.def.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-tu_secreto_aqui
```

### 5.6 Cada persona con su propio cliente

Google marca como sospechoso el login si muchas personas usan el mismo
cliente. Recomendación: **cada miembro del equipo crea su propio ID de cliente**
en la consola de Google y lo mete en su `.env` local. No se comparte.

---

## Paso 6 — Correo (opcional al principio)

Sin esto el login con Google funciona igual, pero **no se pueden recuperar
contraseñas**.

### 6.1 Crear la contraseña de aplicación

Gmail **no** acepta tu contraseña normal. Necesitas una clave especial:

1. Entra a <https://myaccount.google.com/security>
2. Activa la **verificación en 2 pasos** (pide clave de teléfono o SMS)
3. Regresa a <https://myaccount.google.com/apppasswords>
4. Selecciona la aplicación **"Correo"** y el dispositivo **"Otro"**
5. Clic en **Generar**
6. Google muestra una clave de **16 caracteres**

> Verás un ejemplo: `abcd efgh ijkl mnop`. **Guárdala**, no se vuelve a mostrar.

### 6.2 Ponerla en `.env`

```dotenv
MAIL_USER=tu.cuenta@gmail.com
MAIL_APP_PASSWORD=abcd efgh ijkl mnop
MAIL_ENABLED=true
MAIL_FROM_NAME=GEKO
```

### 6.3 Detalles importantes

- La clave **sí** lleva espacios. Ponla tal cual la entrega Google.
- Google envía **como máximo ~500 correos al día**. Alcanza de sobra aquí.
- Si la cuenta tiene 2 pasos pero **no** clave de aplicación, el envío falla.
- Mientras `MAIL_ENABLED=false`, el enlace de recuperación se imprime en la
  consola del servidor. Sirve para probar sin gastar correos.

---

## Paso 7 — Verificar que todo quedó bien

```bash
npm run doctor
```

Este script revisa `.env`, MySQL, Google y Gmail, y te dice **exactamente qué
falta**. Es la primera cosa que hay que ejecutar si algo no anda.

Deberías ver algo así:

```
=== 1. Variables de entorno ===
  [OK]     PORT = 6767
  [OK]     SESSION_SECRET = a3f9...(64 chars)
  [OK]     MYSQL_* completos

=== 2. Conexion a MySQL ===
  [OK]     Conectado a Geko
  [OK]     Tabla usuarios accesible (3 registros)

=== 3. Autenticacion social ===
  [OK]     Google configurado
           redirect_uri: http://localhost:6767/auth/google/callback
  [AVISO]  Apple ID: Apple ID esta desactivado...

=== 4. Recuperacion de contrasena (Gmail) ===
  [AVISO]  Correo no disponible -> El envio de correo esta desactivado

=== 5. Resultado ===
  Todo listo. Arranca con: npm run dev
```

El aviso de Apple es **normal**: Apple requiere un plan de pago de USD 99 al
año y el proyecto no lo usa.

---

## Paso 8 — Arrancar

```bash
npm run dev
```

Abre <http://localhost:6767> en el navegador.

`npm run dev` usa `nodemon`, que reinicia solo si cambias código. Para producción
sin recarga automática se usa `npm start`.

---

## Problemas frecuentes

### "Access denied for user" al arrancar
MySQL rejects las credenciales. Revisa `MYSQL_USER` y `MYSQL_PASSWORD` en
`.env`, y que el servicio de MySQL esté corriendo.

### "Unknown database 'geko'"
No creaste la base. Ejecuta el `sql/schema.sql` del paso 2.

### El login con Google responde `sso_not_configured`
Falta `GOOGLE_CLIENT_ID` o `GOOGLE_CLIENT_SECRET` en `.env`. Recuerda que
**las claves vacías no están comentadas**: revisa que no quede nada después del `=`.

### El login con Google dice `redirect_uri_mismatch`
El URI de redirección de la consola de Google no coincide con
`GOOGLE_REDIRECT_URI`. Revisa el puerto y que no sobre nada.

### Google devuelve 403 o dice "app bloqueada"
Falta activar la **Google People API** en la consola (paso 5.2), o tu propia
cuenta de Google no está en la lista de usuarios de prueba.

### El correo no llega
1. ¿`MAIL_ENABLED=true`?
2. ¿El proyecto quedó en la pantalla de "verificación en 2 pasos" de Google?
3. ¿La clave de aplicación es de 16 caracteres, con sus espacios?
4. Corre `npm run doctor`: si dice que Gmail rechazó las credenciales, el
   mensaje exacto viene de Google.

### Cambié el `.env` y no cambia nada
`dotenv` lee el archivo al arrancar. **Reinicia el servidor** después de
cualquier cambio.

### Cambié el puerto y Google falla
Si cambias `PORT`, hay que cambiar también `GOOGLE_REDIRECT_URI`, `BASE_URL` y
el URI de redirección en la consola de Google.

---

## Comprobación de seguridad antes de commitear

```bash
git status
```

`.env` **nunca debe aparecer** en la lista. Si aparece, no hagas commit:

```bash
git check-ignore .env
```

Debe responder con la regla del `.gitignore` que lo cubre. Si no responde,
`git add .env` antes de volver a intentarlo.

Nunca escribas contraseñas o claves de Google directamente en el código.

---

## Resumen: checklist del primer arranque

- [ ] Node.js instalado (`node -v` responde)
- [ ] `git clone` + `npm install`
- [ ] `sql/schema.sql` ejecutado, `SELECT COUNT(*)` da 3
- [ ] `.env` creado con todas las variables
- [ ] `SESSION_SECRET` generado con el comando del paso 4
- [ ] API de Google activada en la consola
- [ ] `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` en `.env`
- [ ] `npm run doctor` sin errores
- [ ] `npm run dev` y la página abre en el puerto correcto
- [ ] (opcional) clave de aplicación de Gmail + `MAIL_ENABLED=true`
