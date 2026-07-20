# Blindaje integral del calendario

## Propósito

Proteger escrituras con Google Auth, conservar eliminaciones recuperables y registrar historial append-only sin exponer PII en iCal o disponibilidad pública.

## Progreso

- [x] 2026-07-20: Se respaldaron esquema y datos productivos antes de cambiar políticas.
- [x] 2026-07-20: Se añadió allowlist de José y Sofía, borrado lógico, auditoría e interfaz de autenticación fail-closed.
- [x] 2026-07-20: Google OAuth y los retornos exactos quedaron configurados en Supabase.
- [x] 2026-07-20: La migración se aplicó sobre una restauración local productiva; `anon` no pudo escribir y el administrador autorizado sí.
- [ ] Desplegar PWA autenticada, comprobar ambas cuentas y luego aplicar la revocación en producción.
- [ ] Verificar feed iCal y disponibilidad sanitizada después del cierre.

## Orden y rollback

1. Desplegar el cliente capaz de autenticar.
2. Probar login de los dos administradores.
3. Aplicar la migración y probar alta, edición, borrado lógico y restauración.
4. Verificar que feed y disponibilidad siguen sin nombres, familias ni notas.

Si falla la identidad, se revierte GitHub Pages y no se aplica la revocación. Si falla la migración, se conserva el dump previo y se restaura en una base aislada antes de tocar producción.

## Validación

```sh
make ci
npx -y deno test --allow-read --allow-env supabase/functions/calendar-ical/
```
