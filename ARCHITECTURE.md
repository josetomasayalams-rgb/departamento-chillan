# Arquitectura — Reservas familiares

La plataforma combina una PWA estática y una Edge Function de sincronización; ambas comparten Supabase como persistencia, pero tienen responsabilidades separadas.

## Dominios

- **Calendario familiar:** captura, valida y muestra reservas creadas por la familia.
- **Bloqueos externos:** conserva eventos importados de Airbnb y Booking como solo lectura.
- **Feed público:** publica disponibilidad mínima, sin nombres ni notas privadas.
- **Sincronización:** actualiza fuentes externas de forma atómica y mantiene el último estado válido ante errores.

## Flujo principal

```text
Usuario → PWA (`app.js`) → `state.store` → localStorage | Supabase
Airbnb/Booking → Edge Function → external_calendar_events → PWA
Supabase reservations → Edge Function → feed iCal público
reservations + external_calendar_events → /availability → Linktree (solo rangos consolidados)
```

Las reglas de dependencia y su verificación mecánica están en `docs/architecture/LAYERS.md`. El contrato de datos vive en `schema.sql` y las migraciones son la evolución canónica del esquema.

La disponibilidad pública compacta todas las fuentes en `blockedRanges`. No
publica estadías individuales, fuente, familia, huésped, UID, notas ni cantidad
de reservas; el consumidor solo puede distinguir noches libres y bloqueadas.
