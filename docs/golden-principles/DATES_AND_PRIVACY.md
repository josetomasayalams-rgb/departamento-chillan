# Fechas y privacidad de calendarios

## Regla

Todas las estancias son `[llegada, salida)` y el feed público solo revela indisponibilidad.

La fecha de salida vuelve a estar libre. Esta convención debe coincidir en la PWA, la base de datos y los calendarios generados o importados.

La PWA puede mostrar un marcador `Check-out 12:00` en esa fecha libre. Es una
señal informativa: no añade una noche ni impide mostrar `Check-in 15:00` para otra
reserva el mismo día.

## Sí

```ts
calendar.createEvent({ start, end, allDay: true, summary: "No disponible" });
```

```ts
// El checkout del 24 no bloquea el día 24.
const reservation = { start_date: "2026-07-20", end_date: "2026-07-24" };
```

## No

```ts
calendar.createEvent({ start, end, summary: reservation.family_id, description: reservation.note });
```

```ts
// No conviertas un rango exclusivo en uno inclusivo.
calendar.createEvent({ start, end: addDays(end, 1), allDay: true });
```

## Verificación

- Confirma `DTSTART` y `DTEND` en el feed generado.
- Busca nombres, notas e identificadores familiares en el resultado y exige que no aparezcan.
- Ejecuta las pruebas Deno cuando cambie una conversión de fechas.

## Excepción

Los detalles pueden mostrarse dentro de la PWA a usuarios de confianza, pero no deben salir por el feed iCal.
