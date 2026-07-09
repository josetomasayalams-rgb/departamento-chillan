# Reservas · Departamento Chillán

> **Backend compartido (v18).** Este repositorio es la fuente de verdad de
> `supabase/`: migraciones y la Edge Function `calendar-api` que usan ambas
> plataformas. Las claves familiares ya no se guardan en JavaScript. Configurá
> en Supabase los secretos `FAMILY_PIN`, `OPS_PIN`, `OPS_ADMIN_PIN`,
> `CALENDAR_SESSION_SECRET`, `RATE_LIMIT_SALT` y `SUPABASE_SERVICE_ROLE_KEY`
> antes de desplegar la migración.

Calendario compartido para reservar el departamento, con estética **Liquid Glass**
sobre una foto de los Nevados de Chillán. Cinco familias, cada una con su color.

El frontend es estático, pero el calendario siempre usa la API compartida de
Supabase. Sin conexión puede visualizar el último estado cargado, pero bloquea
los cambios hasta que el backend vuelva a responder.

---

## Características

- 🔒 **Lock screen validado por servidor**. El PIN nunca queda embebido en la PWA y la sesión de escritura expira a las 24 horas.
- 📱 **App instalable (PWA)**: agregá a pantalla de inicio en iOS/Android y se abre sin barra del navegador, en modo standalone.
- 🏔️ **Background optimizado por viewport**: desktop usa `chillan-bg.jpg` (1.3 MB, 2560×1706); mobile usa `chillan-bg-mobile.jpg` (330 KB, 1600×1066) bajo los 900px de ancho.
- 👆 **Mobile-first**: `touch-action: manipulation`, popover en bottom sheet, layout compacto en landscape, tap-highlight suprimido.
- 🖥️ **Desktop adaptativo**: el layout crece con el monitor hasta 1400px (antes capeado en 1080). En pantalla completa de 1920×1080 o 2560×1440 se ve cómodo.
- ⚡ **Carga rápida**: preconnect/preload del background, `<script defer>`, sin build step.

## Seguridad (importante si vas a publicar el repo)

La versión actual deja ver un calendario público sin detalles personales.
Nombres de huéspedes, referencias, notas y comentarios se entregan solo por
`calendar-api` después de validar el PIN en servidor. Las sesiones duran 24 h,
hay cinco intentos por 15 minutos y las tablas privadas rechazan DML directo.

### Orden de migración

1. Aplicá `supabase/migrations/202607090001_calendar_security.sql` primero en
   un proyecto de staging. Revisá las filas con `needs_resolution = true`; no
   se borra ningún dato heredado.
2. Cargá los secretos, desplegá `calendar-api` y publicá ambos frontends.
3. Esperá al menos 10 minutos de caché de GitHub Pages y aplicá
   `supabase/manual/finalize-direct-access-lockdown.sql`. Ante problemas,
   volvé al commit previo de cada sitio antes de cerrar DML directo.
4. Cuando no queden filas marcadas, aplicá
   `supabase/manual/after-conflicts-resolved.sql` para sumar las restricciones
   físicas de no-solapamiento.

El workflow manual **Deploy shared Supabase backend** pide los secretos
`SUPABASE_ACCESS_TOKEN` y `SUPABASE_DB_PASSWORD`, y la variable
`SUPABASE_PROJECT_REF`. No ejecutes migraciones sin revisar el reporte de
solapamientos.

---
## 1) Probarlo localmente

```bash
cd "PLATAFORMAS CHILLAN"
python3 -m http.server 8000
```
Abrir http://localhost:8000 (hay que usar `http`, no abrir el archivo directo).

La interfaz local se conecta al backend remoto configurado. Para crear o borrar
reservas se debe desplegar previamente `calendar-api` y sus secretos.

## Despliegue

El calendario familiar se publica en
`https://josetomasayalams-rgb.github.io/departamento-chillan/` y operaciones
en `https://josetomasayalams-rgb.github.io/chillan-rentas/`. El workflow de
GitHub Pages despliega cada repositorio por separado. Antes de publicar una
versión que cambie la API, ejecutá el workflow manual del backend y verificá:

- lectura pública sin notas o datos personales;
- sesión correcta, sesión vencida e intento de PIN incorrecto;
- creación, conflicto y eliminación de una reserva;
- arriendo, tarea, comentario y sincronización entre dos navegadores.

---

## Familias y colores

| Grupo | Color |
|-------|-------|
| Papás | morado `#A855F7` |
| Quiroz Ayala | verde `#10B981` |
| Ayala Gonzalez | ámbar `#F59E0B` |
| Cattan Ayala | rosa `#EC4899` |
| Coco | azul `#3B82F6` |

Para cambiar un color o nombre, edita el arreglo `CONFIG.families` en `app.js`.

## Archivos

- `index.html` / `styles.css` / `app.js` — la app (vanilla JS, sin build).
- `manifest.webmanifest` — PWA manifest (instalable, standalone).
- `assets/chillan-bg.jpg` — fondo desktop (1.3 MB, 2560×1706).
- `assets/chillan-bg-mobile.jpg` — fondo mobile (330 KB, 1600×1066, `<900px`).
- `assets/icon-192.png` / `assets/icon-512.png` — iconos PWA / apple-touch-icon.
- `schema.sql` — tabla + permisos + realtime para Supabase.
- `AGENTS.md` — guía para futuras sesiones de OpenCode/Claude.
