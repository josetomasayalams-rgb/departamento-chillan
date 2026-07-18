# Capas y límites

## Jerarquía

```text
Presentación: index.html, styles.css
        ↓
Cliente: app.js
        ↓
Puerto de persistencia: state.store
        ↓
Adaptadores: localStorage | cliente Supabase

Edge HTTP: supabase/functions/calendar-ical/index.ts
        ↓
Dominios puros: ical.ts | availability.ts
```

## Reglas

| Capa | Puede depender de | No puede depender de |
| --- | --- | --- |
| Presentación | Cliente mediante etiquetas HTML | Supabase ni almacenamiento directo |
| Cliente | APIs web y cliente Supabase remoto | módulos locales nuevos o la Edge Function |
| Puerto `state.store` | adaptador activo | DOM |
| Edge HTTP | paquetes Deno, `ical.ts`, `availability.ts`, Supabase | código de la PWA |
| Dominio iCal | paquetes Deno | HTTP, DOM o Supabase |
| Dominio de disponibilidad | APIs estándar de JavaScript | HTTP, DOM, Supabase o paquetes externos |

El test `tests/architecture/boundary.test.mjs` verifica los imports de las capas ejecutables. No hay violaciones base; `known-violations.json` debe permanecer vacío.

`/availability` es la frontera compartida con Operaciones. Publica las reservas
particulares y los bloqueos de Airbnb/Booking como `reservedRanges`, además de
`blockedRanges` y frescura usando fechas e identidades HMAC opacas; la plataforma
consumidora no consulta las tablas de reservas ni los calendarios externos
directamente.

## Remediación

Si aparece `VIOLATION`, mueve la lógica a la capa de destino adecuada. Para cambiar almacenamiento, agrega un adaptador en `initStore()` que implemente la misma interfaz; no cambies cada llamada de la UI.
