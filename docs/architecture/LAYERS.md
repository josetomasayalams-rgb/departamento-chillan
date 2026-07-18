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

La ventana móvil pertenece a la capa Cliente: deriva 30 fechas desde un inicio,
las alinea con la semana y vuelve a renderizar cuando cambia el día. No consulta
el puerto ni la Edge Function para calcular el rango. La misma reconciliación
actualiza `firstBookable` para conservar el margen de Airbnb. El borde y marcador
dorados del día 1 son presentación pura; no existe una franja ni un estado mensual.
La misma capa añade un marcador informativo en la fecha exclusiva de salida para
mostrar `Check-out 12:00`; no modifica el puerto, el rango persistido ni el cálculo
de conflictos, y permite un `Check-in 15:00` concurrente en esa fecha.

`/availability` es la frontera compartida con Operaciones. Publica las reservas
particulares y los bloqueos de Airbnb/Booking como `reservedRanges`, además de
`blockedRanges` y frescura usando fechas e identidades HMAC opacas; la plataforma
consumidora no consulta las tablas de reservas ni los calendarios externos
directamente.
`reservedRanges` conserva las fechas originales de cada estadía activa para que
la identidad operativa no parezca cambiar cuando avanza la ventana diaria;
`blockedRanges` sí se recorta a la ventana pública.

`/public-availability` es la frontera del Linktree. Consulta todas las reservas
familiares y los bloqueos externos, pero devuelve únicamente `blockedRanges` y
frescura. No entrega identidades individuales y no reemplaza el contrato de
Operaciones.

## Remediación

Si aparece `VIOLATION`, mueve la lógica a la capa de destino adecuada. Para cambiar almacenamiento, agrega un adaptador en `initStore()` que implemente la misma interfaz; no cambies cada llamada de la UI.
