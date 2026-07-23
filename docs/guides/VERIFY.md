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

Para sincronización y duplicados:

1. guarda una reserva familiar y comprueba que aparezca una sola vez aunque
   Airbnb o Booking devuelvan el mismo rango;
2. toca **Sincronizar** y verifica que el botón muestre progreso, el badge
   incluya la hora del último ciclo y el navegador no envíe `SYNC_SECRET`;
3. con dos proveedores publicando el mismo rango, confirma un solo bloqueo;
4. con un rango externo parcialmente superpuesto a una reserva familiar,
   confirma la advertencia **cruce entre calendarios** sin eliminación automática;
5. verifica que Operaciones reciba una sola estadía para rangos duplicados o
   superpuestos y no cree dos limpiezas ni dos avisos.
