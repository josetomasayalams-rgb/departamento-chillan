# Convenciones del stack

- El navegador carga `app.js` directamente; valida sintaxis con Node, no con un bundler.
- Sirve la app por HTTP: `file://` impide la importación dinámica del cliente remoto.
- TypeScript en `supabase/functions/` se ejecuta con Deno/Supabase, no con Node.
- El esquema inicial está en `schema.sql`; las migraciones son aditivas e idempotentes.
- No se admiten dependencias locales sin justificar su beneficio frente a una PWA sin build.

Operaciones consume el contrato HTTPS público `/availability` sin SDK adicional;
no accede a tablas, credenciales ni URLs iCal y no comparte código ejecutable
con esta plataforma. La Edge Function usa una clave privada del entorno para
derivar identidades HMAC estables que no revelan los identificadores de origen.
La consulta filtra `reservations` por `family_id = particular`; los demás grupos
familiares permanecen exclusivamente en esta plataforma.
La lista individual preserva fechas originales; sólo la vista compacta de
bloqueos se recorta al horizonte de disponibilidad.
