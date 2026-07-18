# Departamento Chillan - calendario familiar

PWA en Vanilla JS para administrar las reservas familiares del departamento y
sincronizar disponibilidad con Airbnb y Booking mediante iCal.

- Aplicacion: <https://josetomasayalams-rgb.github.io/departamento-chillan/>
- Feed familiar: <https://uimqusoylxpyljbfqumm.supabase.co/functions/v1/calendar-ical/calendario-familiar.ics>
- Disponibilidad pública sanitizada: <https://uimqusoylxpyljbfqumm.supabase.co/functions/v1/calendar-ical/availability>
- Backend compartido: Supabase, proyecto `uimqusoylxpyljbfqumm`

## Comportamiento de fechas

Todas las reservas usan la convencion hotelera `[llegada, salida)`. Una reserva
del 20 al 24 ocupa las noches 20, 21, 22 y 23; el dia 24 queda libre para otra
llegada. Las reservas familiares se pueden crear, editar, eliminar y deshacer.

Airbnb y Booking aparecen con colores propios y son de solo lectura. La
aplicacion impide guardar una reserva familiar que se cruce con cualquier
bloqueo existente.

## Arquitectura iCal

`reservations` contiene exclusivamente reservas familiares. La Edge Function
`calendar-ical` consulta esa tabla en cada solicitud y genera un calendario con
`SUMMARY:No disponible`; nunca publica familia, nota ni otro detalle privado.

`external_calendar_events` contiene solamente UID, fuente y fechas importadas.
La ruta `/sync` descarga ambos feeds y reemplaza cada fuente dentro de una sola
transaccion. Si una descarga o el parseo falla, conserva los ultimos eventos
validos. Un cron de Supabase ejecuta la sincronizacion cada 15 minutos.

El feed familiar nunca consulta `external_calendar_events`, lo que evita volver
a exportar bloqueos importados y formar ciclos.

La ruta JSON `/availability` une reservas familiares y bloqueos externos dentro
de un horizonte de 12 meses. Publica las estadías sanitizadas por separado en
`reservedRanges` y los períodos ocupados consolidados en `blockedRanges`, además
de frescura agregada. Operaciones consume solo `reservedRanges`; ningún rango
incluye fuente, UID, familia, huésped, notas ni URLs iCal. Si una fuente nunca se ha sincronizado, responde
`unavailable`; si conserva datos tras un error o supera 45 minutos sin éxito,
responde `stale`.

## Desarrollo local

La interfaz no tiene build, bundler ni dependencias locales:

```bash
python3 -m http.server 8000
```

Abrir <http://localhost:8000>. No usar `file://`, porque la importacion dinamica
del cliente de Supabase requiere HTTP.

Comprobaciones basicas:

```bash
node --check app.js
npx -y deno test --allow-read --allow-env supabase/functions/calendar-ical/
```

## Despliegue Supabase

Requisitos: Supabase CLI, acceso al proyecto y las URLs privadas de exportacion
iCal de Airbnb y Booking.

```bash
supabase login
supabase link --project-ref uimqusoylxpyljbfqumm
supabase db push
supabase functions deploy calendar-ical --no-verify-jwt
```

Generar un secreto aleatorio y cargar los tres secretos sin escribir sus valores
en archivos del repositorio:

```bash
read -s "SYNC_SECRET?Secreto de sincronizacion: "
read -s "AIRBNB_ICAL_URL?URL iCal de Airbnb: "
read -s "BOOKING_ICAL_URL?URL iCal de Booking: "
supabase secrets set \
  SYNC_SECRET="$SYNC_SECRET" \
  AIRBNB_ICAL_URL="$AIRBNB_ICAL_URL" \
  BOOKING_ICAL_URL="$BOOKING_ICAL_URL"
```

En Supabase Dashboard, abrir **Vault** y crear `calendar_sync_secret` con el
mismo valor de `SYNC_SECRET`. La migracion deja programado el job
`calendar-ical-sync-15m`; despues de cargar Vault se puede iniciar la primera
sincronizacion desde SQL Editor:

```sql
select public.invoke_calendar_ical_sync();
```

Verificar el estado sin exponer URLs:

```sql
select source, status, event_count, last_success_at, error_message
from public.calendar_sync_status
order by source;
```

## Configuracion en Airbnb y Booking

1. En Airbnb y Booking, importar el feed familiar publico indicado al inicio.
2. En el calendario familiar, las dos URLs de exportacion externas se cargan
   solamente como secretos de la Edge Function.
3. Para compartir reservas entre plataformas, importar en Airbnb el enlace de
   Booking e importar en Booking el enlace de Airbnb.
4. No usar como secreto el feed familiar: debe permanecer publico para que las
   plataformas puedan consultarlo automaticamente.

## Validacion y recuperacion

- El feed debe responder `200` y `Content-Type: text/calendar`.
- Sus eventos deben contener `SUMMARY:No disponible` y no nombres ni notas.
- Un evento externo debe aparecer en la PWA como `Solo lectura` y no aparecer
  dentro del feed familiar.
- Si el badge inferior indica que una fuente no se actualizo, revisar
  `calendar_sync_status` y volver a ejecutar `invoke_calendar_ical_sync()`.
- Para detener importaciones sin perder datos, desactivar el job
  `calendar-ical-sync-15m` desde Supabase Cron. Los ultimos bloqueos permanecen
  visibles hasta la siguiente sincronizacion correcta o su eliminacion manual.

## Seguimiento de publicacion externa

Cada alta comparte una `availability_version` entre todas las familias elegidas.
El frontend vuelve a leer el feed con `no-store` y solo marca **Publicado en
feed** cuando encuentra todos los UID, fechas, `STATUS:CONFIRMED` y
`TRANSP:OPAQUE` esperados. Cambiar llegada o salida crea una version nueva y
reinicia las verificaciones; cambiar familia o nota conserva la version.

Airbnb y Booking no entregan una confirmacion automatica de importacion. Por
eso la PWA mantiene la reserva como **Pendiente externo** hasta que una persona
abre cada canal, revisa las noches bloqueadas y usa **Marcar verificado**. Al
vencer las ventanas orientativas de dos horas para Booking o tres horas para
Airbnb, el estado cambia a **Revision requerida**, nunca a verificado.

En modo local la ficha indica expresamente que los datos permanecen solo en el
dispositivo y no se publican en los canales.

## Archivos principales

- `app.js`, `index.html`, `styles.css`: PWA familiar.
- `schema.sql`: instalacion inicial de `reservations`.
- `supabase/migrations/`: tablas externas, operaciones atomicas y cron.
- `supabase/functions/calendar-ical/`: feed publico e importadores.
- `supabase/fixtures/`: calendarios ficticios usados por las pruebas.
