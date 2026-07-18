# Verificación

Ejecuta `make ci` para validar sintaxis, el contrato estático y las fronteras arquitectónicas. Ejecuta `make gc` para detectar deriva documental y de arquitectura.

En el cliente, confirma que la grilla exponga exactamente 30 fechas consecutivas
desde hoy, resalte únicamente el día 1 en dorado, sin franjas ni tintes por mes, y comunique el rango.
Las flechas deben mover periodos de 30 días; `Desde hoy` debe restaurar el rango
vigente y el seguimiento diario. Verifica que el margen de Airbnb siga bloqueando
las fechas correspondientes después del cambio de día.

Comprueba para una reserva familiar, una de Airbnb y una de Booking que la llegada
muestre `Check-in 15:00`, los días intermedios `Reserva` y la fecha de salida
`Check-out 12:00`. Confirma también que dos reservas consecutivas puedan mostrar
check-out y check-in en la misma fecha sin convertir la salida en una noche ocupada,
y que las etiquetas no se recorten en un viewport de 390 px.

Al modificar la Edge Function, ejecuta las pruebas Deno indicadas en `AGENTS.md`. Luego verifica manualmente que el feed devuelva un calendario, que `/availability` responda el contrato JSON mínimo y que ninguna ruta exponga nombres, notas o fuentes de reserva.
