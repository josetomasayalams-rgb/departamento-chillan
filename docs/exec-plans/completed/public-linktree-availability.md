# Disponibilidad pública del Linktree

## Objetivo

Publicar en el Linktree una disponibilidad binaria y privada que una todas las
reservas familiares con los bloqueos de Airbnb y Booking, sin alterar el
contrato de identidades opacas que consume Operaciones.

## Reglas

- `/availability` sigue reservado a Operaciones y solo incluye reservas
  particulares más canales externos.
- `/public-availability` incluye todas las reservas familiares y los canales
  externos, pero elimina identidades individuales y publica solo rangos
  consolidados.
- Ambas respuestas usan `no-store`, fechas civiles de `America/Santiago` y
  semántica `[llegada, salida)`.
- Una reserva familiar guardada en Supabase queda visible inmediatamente en la
  ruta pública; Airbnb y Booking se actualizan por el ciclo iCal configurado,
  actualmente cada 15 minutos.
- Ninguna interfaz afirma sincronización instantánea con proveedores que no la
  ofrecen.

## Publicación

1. Probar dominio, rutas HTTP, privacidad y compatibilidad con Operaciones.
2. Desplegar la Edge Function antes de cambiar el consumidor público.
3. Verificar contrato productivo sin identidades y con frescura real.
4. Publicar el Linktree y revisar julio, agosto y septiembre en móvil y
   escritorio.

## Estado

Completado el 18 de julio de 2026.

## Resultado

- La Edge Function productiva expone `/public-availability` con rangos
  consolidados, estado y frescura, sin nombres, familias ni canales.
- `/availability` conserva su contrato anterior para Operaciones.
- La prueba Deno cubre las dos audiencias y la unión binaria de rangos.
- El Linktree productivo consume la nueva ruta, muestra solo `Disponible` o
  `Reservado` y conserva el dato retenido cuando una fuente falla.
- La revisión productiva confirmó precios de $260.000 de domingo a jueves y
  $280.000 viernes y sábado, selección inmediata y cobertura hasta el 30 de
  septiembre de 2026 sin habilitar octubre.
- La limitación conocida es la propia de iCal: una reserva familiar aparece de
  inmediato en el endpoint, mientras un cambio originado en Airbnb o Booking
  puede tardar hasta el siguiente ciclo de sincronización.
