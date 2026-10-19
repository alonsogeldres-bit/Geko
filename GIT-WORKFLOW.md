# Flujo de trabajo con Git — GEKO

> Objetivo: que dos personas puedan trabajar a la vez en el repo **sin pisarse**
> y sin que cada `pull` sea una bomba de relojería.
> Fecha: 19-10-2026

---

## 1. La regla de oro

```bash
git status          # 1. el árbol está limpio?
git pull --rebase   # 2. sincronizar (rebase, no merge)
                    # 3. trabajar
git add -A
git commit -m "..."
git push
```

**Nunca** `git pull` con cambios sin commitear. Eso genera un merge commit
automático, ensucia el historial y mezcla el trabajo de otra persona en el
mío.

### Configuración (una vez por máquina)

```bash
git config --global pull.rebase true      # pull = rebase, no merge
git config --global rerere.enabled true    # git recuerda las resoluciones de conflicto
```

`rerere` es el que más ayuda: cuando el mismo conflicto aparece otra vez, Git
**aplica solo** la resolución que hiciste la vez anterior.

---

## 2. Por qué `rebase` y no `merge`

Con `merge`, cada `pull` deja un nodo con dos padres en el historial. Con
cuatro personas trabajando, el `git log` se vuelve ilegible y nadie sabe qué
cambió dónde.

Con `rebase`, tu commit se reaplica **encima** del remoto:

```
merge:   A---B---M---C          <- M mezcla 2 ramas
rebase:  A---B---C---B'         <- lineal, B' es tu commit reaplicado
```

Tu commit local **nunca se pushea antes de tiempo**, así que el `rebase` es
seguro: no hay que usar `--force`.

> Si ya tenés un merge commit local sin pushear, `git rebase origin/main` lo
> aplana igual. Si ya lo pusheaste, no lo rebases (reescribe historia
> compartida): en ese caso, `git pull` normal.

---

## 3. Antes de tocar un archivo, mirá si el remoto lo tocó

```bash
git fetch origin
git log --oneline HEAD..origin/main -- views/post/dashboard.ejs
```

Si sale algo, ese archivo está **en disputa**. Dos opciones:

1. Coordinar antes de escribir (lo ideal para vistas y modelos compartidos).
2. Rebasear ahora y recién ahí editar, sobre el código más nuevo.

---

## 4. Archivos que se repiten

Estos son los que han generado conflictos. La idea es que cada quien tenga
"su" archivo y los cambios comunes vivan en archivos chicos y dedicados.

| Archivo | Quién lo toca | Nota |
|---|---|---|
| `views/post/configuracion.ejs` + `public/js/configuracion.js` + `public/css/configuracion.css` | quien trabaje en `/configuracion` | son un bloque indivisible |
| `views/post/dashboard.ejs` | quien trabaje en el dashboard | **el menú del avatar no debería vivir acá** (ver sección 5) |
| `views/post/profile.ejs` + `public/js/profile.js` | quien trabaje en el wizard | |
| `models/profileModel.js` | quien trabaje en el guardado del perfil | |
| `models/dashboardModel.js`, `models/routineModel.js` | quien trabaje en el dashboard | **archivos nuevos: cero solape** |

**Regla práctica:** los modelos de lectura van en su **propio archivo** por
vista. Así dos personas que necesitan leer el mismo dato no editan el mismo
archivo, y el conflicto se reduce a un `git add` sin conflicto.

---

## 5. El menú del avatar (el punto de roce actual)

Hoy el array `menu` está **dentro de cada vista**:

- `views/post/dashboard.ejs`
- `views/post/entrenamiento.ejs`

Cada vez que se agrega o cambia un item, hay que editar las dos. Y si las dos
personas lo hacen a la vez → conflicto garantizado (ya pasó).

**Solución:** sacarlo a un partial.

```ejs
// views/partials/avatar-menu.ejs
<% const menu = [
     { href: '/configuracion', icono: '', texto: 'Configuración' },
     { href: '#',              icono: '', texto: 'Mi progreso',  pronto: true },
     { href: '#',              icono: '', texto: 'Ayuda',        pronto: true }
   ]; %>
```

```ejs
<!-- en cada vista -->
<%- include('../partials/avatar-menu') %>
```

A partir de ahí, el menú vive en **un archivo de 8 líneas**. El próximo
cambio choca en 8 líneas, no en 200, y las vistas dejan de ser territorio del
menú.

---

## 6. Un cambio = un commit = un documento

Es la convención que ya sigue el repo: cada cambio tiene su `CAMBIOS-*.md`.

```
CAMBIOS-CONFIGURACION-PERFIL.md
CAMBIOS-ENLACE-UN-SOLO-USO.md
CAMBIOS-PERFIL-COMPLETADO.md
CAMBIOS-DASHBOARD-DATOS-REALES.md
```

**Por qué sirve** (más allá de la documentación):

- Si el merge choca, el doc dice **qué se decidió y por qué**, y la resolución
  es obvia sin tener que reconstruir el contexto.
- El `ERRORES-PENDIENTES.md` queda como índice de todo lo que se hizo.

**Reglas de formato** (copiar de `CAMBIOS-CONFIGURACION-PERFIL.md`):

| Bloque | Contenido |
|---|---|
| Encabezado | Estado, Fecha, Archivos afectados, Base de datos, Riesgo |
| 1 | Problema reportado |
| 2 | Causa raíz |
| 3 | Solución implementada (con el diagrama del flujo) |
| 4 | Detalle por archivo |
| 5+ | Pruebas, deuda técnica, reversión |

Y cuando se arregla un error del inventario, se mueve a la tabla **Resueltos**
con el hash del commit (regla que ya está escrita arriba de ese archivo).

---

## 7. Antes de commitear

```bash
git status                    # ¿queda algo sin stage que no debería?
git diff --cached             # ¿el diff es lo que creo?
git diff --check              # ¿espaciosconflictivos / whitespace roto?
```

Y para los `.ejs`, un chequeo rápido de que no quedaron marcadores de
conflicto:

```bash
git grep -n "^\(<<<<<<<\|=======\|>>>>>>>\)" -- '*.ejs' '*.js' '*.md'
```

Debe salir vacío. Un `<<<<<<<` en un `.ejs` no da error al commitear:
**revienta la página en runtime** con
`SyntaxError: Unexpected token '<<' while compiling ejs`.

---

## 8. Finales de línea

El repo tiene `.gitattributes` con `* text=auto eol=lf`. Eso obliga a que:

- en el **índice** (repositorio) todo sea LF
- en el **disco** (working tree) todo sea LF

Así, aunque un compañero tenga `core.autocrlf=true` y otro `false`, el archivo
se ve igual en todas las máquinas y **no aparecen cambios fantasma**.

Si por algún motivo aparece un archivo "modificado" que nadie tocó, es casi
siempre esto. La solución es `git add --renormalize .` una sola vez.
