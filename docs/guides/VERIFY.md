# Verificación

Ejecuta `make ci` para validar sintaxis, el contrato estático y las fronteras arquitectónicas. Ejecuta `make gc` para detectar deriva documental y de arquitectura.

En el cliente, confirma que la grilla exponga exactamente 31 fechas consecutivas
desde hoy, cruce correctamente al mes siguiente y muestre el rango en el encabezado.
Las flechas deben mover periodos de 31 días; `Desde hoy` debe restaurar el rango
vigente y el seguimiento diario. Verifica que el margen de Airbnb siga bloqueando
las fechas correspondientes después del cambio de día.

Al modificar la Edge Function, ejecuta las pruebas Deno indicadas en `AGENTS.md`. Luego verifica manualmente que el feed devuelva un calendario, que `/availability` responda el contrato JSON mínimo y que ninguna ruta exponga nombres, notas o fuentes de reserva.
