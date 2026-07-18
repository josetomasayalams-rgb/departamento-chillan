# Verificación

Ejecuta `make ci` para validar sintaxis, el contrato estático y las fronteras arquitectónicas. Ejecuta `make gc` para detectar deriva documental y de arquitectura.

En el cliente, confirma que la grilla exponga exactamente 30 fechas consecutivas
desde hoy, resalte únicamente el día 1 en dorado, sin franjas ni tintes por mes, y comunique el rango.
Las flechas deben mover periodos de 30 días; `Desde hoy` debe restaurar el rango
vigente y el seguimiento diario. Verifica que el margen de Airbnb siga bloqueando
las fechas correspondientes después del cambio de día.

Al modificar la Edge Function, ejecuta las pruebas Deno indicadas en `AGENTS.md`. Luego verifica manualmente que el feed devuelva un calendario, que `/availability` responda el contrato JSON mínimo y que ninguna ruta exponga nombres, notas o fuentes de reserva.
