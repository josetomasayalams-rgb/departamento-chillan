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
Dominio iCal: supabase/functions/calendar-ical/ical.ts
```

## Reglas

| Capa | Puede depender de | No puede depender de |
| --- | --- | --- |
| Presentación | Cliente mediante etiquetas HTML | Supabase ni almacenamiento directo |
| Cliente | APIs web y cliente Supabase remoto | módulos locales nuevos o la Edge Function |
| Puerto `state.store` | adaptador activo | DOM |
| Edge HTTP | paquetes Deno, `ical.ts`, Supabase | código de la PWA |
| Dominio iCal | paquetes Deno | HTTP, DOM o Supabase |

El test `tests/architecture/boundary.test.mjs` verifica los imports de las capas ejecutables. No hay violaciones base; `known-violations.json` debe permanecer vacío.

## Remediación

Si aparece `VIOLATION`, mueve la lógica a la capa de destino adecuada. Para cambiar almacenamiento, agrega un adaptador en `initStore()` que implemente la misma interfaz; no cambies cada llamada de la UI.
