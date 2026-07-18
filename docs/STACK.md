# Convenciones del stack

- El navegador carga `app.js` directamente; valida sintaxis con Node, no con un bundler.
- Sirve la app por HTTP: `file://` impide la importación dinámica del cliente remoto.
- TypeScript en `supabase/functions/` se ejecuta con Deno/Supabase, no con Node.
- El esquema inicial está en `schema.sql`; las migraciones son aditivas e idempotentes.
- No se admiten dependencias locales sin justificar su beneficio frente a una PWA sin build.

El Linktree consume el contrato HTTPS `/availability`; no accede a tablas,
credenciales ni URLs iCal y no comparte código ejecutable con esta plataforma.
