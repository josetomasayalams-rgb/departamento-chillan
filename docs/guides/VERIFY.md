# Verificación

Ejecuta `make ci` para validar sintaxis, el contrato estático y las fronteras arquitectónicas. Ejecuta `make gc` para detectar deriva documental y de arquitectura.

Al modificar la Edge Function, ejecuta las pruebas Deno indicadas en `AGENTS.md`. Luego verifica manualmente que el feed devuelva un calendario, que `/availability` responda el contrato JSON mínimo y que ninguna ruta exponga nombres, notas o fuentes de reserva.
