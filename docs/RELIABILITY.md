# Confiabilidad

La PWA estática debe seguir disponible aunque Supabase o un proveedor iCal falle temporalmente. No existe un SLA formal; el objetivo operativo es degradar con datos conocidos y nunca publicar información privada para recuperar disponibilidad.

## Modos de degradación

| Falla | Comportamiento esperado | Verificación |
| --- | --- | --- |
| Supabase no configurado | La PWA usa `localStorage` | Crear y recargar una reserva local |
| Descarga iCal falla | Se conserva el último conjunto válido de esa fuente | Revisar el estado de sincronización |
| Feed familiar falla | Respuesta controlada sin detalles internos | Confirmar estado HTTP y cuerpo genérico |
| Una fuente externa falla | La otra fuente se procesa de forma independiente | Probar resultados por proveedor |

## Límites y recuperación

- La Edge Function limita tiempo y tamaño de respuestas externas.
- El reemplazo de eventos se realiza por fuente y de forma atómica.
- Los errores se sanitizan antes de registrarse o devolverse.
- La recuperación es reintentar la sincronización; no se borran datos válidos por un fallo remoto.

## Cambios de riesgo

Los cambios en fechas, privacidad, reemplazo atómico o rutas HTTP requieren las pruebas Deno y una verificación manual del feed. Los cambios al cliente requieren `make ci`; `make gc` confirma que límites y documentación siguen vigentes.
