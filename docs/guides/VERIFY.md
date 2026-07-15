# Verificación

Ejecuta `make ci` para validar sintaxis, el contrato estático y las fronteras arquitectónicas. Ejecuta `make gc` para detectar deriva documental y de arquitectura.

Al modificar la Edge Function, instala o habilita Deno y ejecuta las pruebas iCal indicadas en `AGENTS.md`. Luego verifica manualmente que el feed devuelva un calendario y no exponga nombres ni notas.
