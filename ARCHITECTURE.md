# Arquitectura — Reservas familiares

La plataforma combina una PWA estática y una Edge Function de sincronización; ambas comparten Supabase como persistencia, pero tienen responsabilidades separadas.

## Dominios

- **Calendario familiar:** captura, valida y muestra reservas creadas por la familia.
- **Bloqueos externos:** conserva eventos importados de Airbnb y Booking como solo lectura.
- **Feed operativo:** publica sólo reservas particulares y bloqueos externos,
  sin nombres ni notas privadas.
- **Sincronización:** actualiza fuentes externas de forma atómica y mantiene el último estado válido ante errores.

## Flujo principal

```text
Usuario → PWA (`app.js`) → `state.store` → localStorage | Supabase
Airbnb/Booking → Edge Function → external_calendar_events → PWA
Supabase reservations → Edge Function → feed iCal público
reservations(family_id=particular) + external_calendar_events → /availability → Operaciones (identidad opaca + fechas)
reservations(todas) + external_calendar_events → /public-availability → Linktree (solo ocupado/libre)
```

La PWA proyecta reservas y bloqueos sobre una ventana móvil de 30 fechas
consecutivas. `state.view.start` controla el inicio y `followsToday` permite que
la vista avance con la fecha local; navegar manualmente pausa ese seguimiento
hasta usar `Desde hoy`. El margen de Airbnb se recalcula en la misma reconciliación
diaria. Esta proyección no modifica reservas ni eventos externos.

Las reglas de dependencia y su verificación mecánica están en `docs/architecture/LAYERS.md`. El contrato de datos vive en `schema.sql` y las migraciones son la evolución canónica del esquema.

La disponibilidad pública ofrece las reservas particulares y estadías externas
individuales sanitizadas en `reservedRanges`, y las compacta en `blockedRanges`.
Las reservas de otros grupos familiares no cruzan esta frontera. Ninguno de los
dos contratos publica fuente, grupo, huésped, UID, notas ni URLs; Operaciones
solo recibe fechas y un identificador opaco estable, derivado mediante HMAC, para
representar cada estadía como “Reserva” y detectar cambios sin conocer su origen.
Las estadías individuales conservan su check-in original mientras estén activas;
el recorte a la ventana se aplica únicamente a los rangos compactos de bloqueo.

El Linktree usa una frontera distinta: `/public-availability` incluye todas las
reservas familiares para bloquear el inmueble de inmediato, pero elimina
`reservedRanges` por completo. Su contrato solo contiene rangos consolidados de
ocupación y frescura, de modo que nunca puede reconstruir identidades, familias
ni canales.
