# Arquitectura — Reservas familiares

La plataforma combina una PWA estática y una Edge Function de sincronización; ambas comparten Supabase como persistencia, pero tienen responsabilidades separadas.

## Dominios

- **Calendario familiar:** captura, valida y muestra reservas creadas por la familia.
- **Bloqueos externos:** conserva eventos importados de Airbnb y Booking como solo lectura.
- **Feed operativo:** publica sólo reservas particulares y bloqueos externos,
  sin nombres ni notas privadas.
- **Sincronización:** actualiza fuentes externas de forma atómica, permite
  solicitar un ciclo manual y mantiene el último estado válido ante errores.
- **Supresiones externas:** excluye por `source + external_uid` ecos concretos
  que una persona confirmó como duplicados, sin afectar otros eventos.

## Flujo principal

```text
Usuario → clave familiar → PWA (`app.js`) → `state.store` → localStorage | Supabase con RLS
Airbnb/Booking → Edge Function → external_calendar_events → PWA
Supabase reservations → Edge Function → feed iCal público
reservations(family_id=particular) + external_calendar_events → /availability → Operaciones (identidad opaca + fechas)
reservations(todas) + external_calendar_events → /public-availability → Linktree (solo ocupado/libre)
```

La PWA proyecta reservas y bloqueos sobre una ventana móvil de 30 fechas
consecutivas. `state.view.start` controla el inicio y `followsToday` permite que
la vista avance con la fecha local; navegar manualmente pausa ese seguimiento
hasta usar `Desde hoy`. El margen de Airbnb se recalcula en la misma reconciliación
diaria. Cuando el rango cruza a otro mes, la vista sólo marca el día 1 en dorado;
no añade franjas ni tintes de fondo por mes. Esta proyección no modifica reservas
ni eventos externos.

Cuando Supabase está configurado, la composición usa la clave familiar como
compuerta de interacción y el rol anónimo del cliente para el calendario
compartido. Un fallo de conexión no cambia al adaptador local: la escritura
queda cerrada para evitar dos calendarios divergentes.
Las sesiones `authenticated` persistidas por la versión OAuth anterior reciben
el mismo contrato temporal que `anon`, de modo que no oculten reservas en
dispositivos antiguos.
El modo `localStorage` existe únicamente para una instalación deliberadamente
no conectada y avisa que no publica en Airbnb ni Booking.

La proyección visual incluye la fecha exclusiva de salida únicamente para mostrar
`Check-out 12:00`, mientras `Check-in 15:00` identifica la llegada. Esto no cambia
el rango persistido `[llegada, salida)`: la salida sigue disponible y puede mostrar
simultáneamente el check-in de otra reserva en un carril independiente.

Las reglas de dependencia y su verificación mecánica están en `docs/architecture/LAYERS.md`. El contrato de datos vive en `schema.sql` y las migraciones son la evolución canónica del esquema.

La disponibilidad pública ofrece las reservas particulares y estadías externas
individuales sanitizadas en `reservedRanges`, y las compacta en `blockedRanges`.
Las reservas de otros grupos familiares no cruzan esta frontera. Ninguno de los
dos contratos publica fuente, grupo, huésped, UID, notas ni URLs; Operaciones
solo recibe fechas y un identificador opaco estable, derivado mediante HMAC, para
representar cada estadía como “Reserva” y detectar cambios sin conocer su origen.
Las estadías individuales conservan su check-in original mientras estén activas;
el recorte a la ventana se aplica únicamente a los rangos compactos de bloqueo.
Antes de construir ambos contratos, la Edge Function retira eventos externos
que coinciden con una reserva familiar y colapsa duplicados de proveedor. El
cliente aplica la misma defensa al renderizar. Los cruces parciales no se borran
automáticamente: se señalan para que una persona corrija la reserva equivocada.
Cuando un proveedor desplaza las fechas de un eco confirmado, la tabla
`external_calendar_event_suppressions` evita que ese UID vuelva a insertarse en
reemplazos futuros del feed.

El botón **Sincronizar** invoca una RPC limitada que reutiliza
`invoke_calendar_ical_sync()` y su secreto guardado en Vault; el navegador nunca
recibe ese secreto. Después vuelve a consultar Airbnb, Booking y el feed familiar,
y muestra la hora del último ciclo correcto.

El Linktree usa una frontera distinta: `/public-availability` incluye todas las
reservas familiares para bloquear el inmueble de inmediato, pero elimina
`reservedRanges` por completo. Su contrato solo contiene rangos consolidados de
ocupación y frescura, de modo que nunca puede reconstruir identidades, familias
ni canales.
