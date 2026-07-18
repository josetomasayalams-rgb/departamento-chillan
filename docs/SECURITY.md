# Seguridad

## Límites de acceso

La PWA usa un cliente público de Supabase y está diseñada para un grupo familiar de confianza. Las políticas actuales permiten las operaciones necesarias desde ese cliente; cualquier endurecimiento debe incluir un diseño de autenticación que preserve el uso compartido previsto.

## Secretos

- Los secretos de sincronización se guardan solo en el gestor de secretos de la plataforma.
- No se incluyen valores de secretos en código, documentación, fixtures ni registros.
- La rotación se realiza desde el panel de la plataforma y requiere volver a verificar la sincronización.

## Amenazas y controles

| Riesgo | Control actual |
| --- | --- |
| Fuga de detalles familiares por iCal | El feed publica solo “No disponible” |
| Fuga de proveedor o huésped hacia Operaciones | `/availability` publica sólo reservas particulares y fechas externas con un identificador HMAC opaco; nunca fuente, UID, familia, huésped, notas ni URL |
| Fuga de identidad hacia el Linktree | `/public-availability` incluye todas las ocupaciones, pero solo publica rangos consolidados sin identificadores ni fuente |
| Fallo de un proveedor externo | La sincronización conserva el último conjunto válido |
| HTML inyectado desde notas | La interfaz escapa texto antes de insertarlo |
| Respuestas externas grandes | La función limita el tamaño del calendario |

Preservar el check-in original de una estadía activa no amplía los campos del
contrato: sigue entregando únicamente identidad opaca y fechas de la reserva.

Mostrar 30 días consecutivos, incluso cuando cruzan al mes siguiente, es una
proyección local de datos ya autorizados. No amplía los feeds, no revela campos
nuevos y conserva las restricciones de reserva y el margen de Airbnb. Marcar el
día 1 en dorado, sin tintes por mes, es únicamente una decisión de presentación.
Las horas fijas de check-in y check-out se añaden localmente a la vista; no provienen
de los feeds, no amplían sus campos ni revelan identidad o notas de las reservas.

Reporta un incidente a los administradores del departamento; evita pegar información sensible en tickets o conversaciones.
