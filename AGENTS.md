# Reservas familiares — mapa para agentes

PWA en español para coordinar las reservas de un departamento familiar en Chillán e integrar bloqueos iCal de Airbnb y Booking.

## Stack y límites

| Área | Tecnología |
| --- | --- |
| Cliente | HTML, CSS y JavaScript nativo; sin build ni dependencias locales |
| Persistencia | Supabase o `localStorage`, elegidos al iniciar |
| Integración | Edge Function de Supabase en TypeScript/Deno e iCal |
| Pruebas locales | Node para estáticos; Deno/Supabase CLI para la función |

No añadir framework, bundler, `package.json` ni linter de terceros sin una petición explícita. La sencillez de despliegue es un requisito.

## Arquitectura

`index.html` + `styles.css` → `app.js` → interfaz `state.store` → `localStorage` **o** Supabase

La Edge Function está aislada: `index.ts` (HTTP/Supabase) → `ical.ts` (conversión iCal). Consulta las reglas definitivas en `docs/architecture/LAYERS.md`.

## Convenciones que no se negocian

- Las fechas usan `[llegada, salida)`: el día de salida queda disponible.
- La UI solo habla con `state.store`; no acoples una vista a un backend concreto.
- `reservations` contiene solo reservas familiares. Los bloqueos externos no se reexportan.
- Mantén la interfaz en español y las variables visuales en `:root`.
- Nunca coloques credenciales o URLs privadas en documentación, fixtures o logs.

## Comandos

```sh
python3 -m http.server 8000
make ci
make gc
node --check app.js
```

Para probar la Edge Function se requiere Deno: `npx -y deno test --allow-read --allow-env supabase/functions/calendar-ical/`.

## Dónde empezar

| Necesidad | Archivo |
| --- | --- |
| Mapa del dominio | `ARCHITECTURE.md` |
| Capas y dependencias | `docs/architecture/LAYERS.md` |
| Reglas de datos y sincronización | `docs/golden-principles/PERSISTENCE.md` |
| Configurar/desplegar Supabase | `README.md` y `docs/guides/DEPLOYMENT.md` |
| Esquema | `schema.sql` y `supabase/migrations/` |
| Fallos y recuperación | `docs/RELIABILITY.md` |
| Validar cambios | `docs/guides/VERIFY.md` |

## Verificación obligatoria

- Ejecuta `make ci` antes de entregar cambios del cliente.
- Ejecuta las pruebas Deno antes de cambiar `supabase/functions/` cuando Deno esté disponible.
- `tests/architecture/known-violations.json` es un ratchet: nunca agregues violaciones nuevas.
