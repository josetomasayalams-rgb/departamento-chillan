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
  ruta pública; Airbnb y Booking se actualizan por su ciclo iCal de 15 minutos.
- Ninguna interfaz afirmará sincronización instantánea con proveedores que no
  la ofrecen.

## Publicación

1. Probar dominio, rutas HTTP, privacidad y compatibilidad con Operaciones.
2. Desplegar la Edge Function antes de cambiar el consumidor público.
3. Verificar contrato productivo sin identidades y con frescura real.
4. Publicar el Linktree y revisar julio, agosto y septiembre en móvil y
   escritorio.

## Estado

En implementación.
