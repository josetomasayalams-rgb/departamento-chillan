# Seguridad

## Límites de acceso

La PWA usa una pantalla de acceso obligatoria con la clave familiar `9014`. No solicita correo ni inicio de sesión con Google. El cliente nunca convierte un fallo de conexión a Supabase en escritura local silenciosa.

La clave se valida en el cliente estático: evita el acceso casual a la interfaz,
pero no es un secreto validado por el servidor. Los roles `anon` y
`authenticated` de Supabase pueden leer y modificar reservas mediante la API
pública del proyecto; `authenticated` se conserva sólo para dispositivos con
una sesión persistida del flujo OAuth retirado.

## Secretos

- Los secretos de sincronización se guardan solo en el gestor de secretos de la plataforma.
- No se incluyen valores de secretos en código, documentación, fixtures ni registros.
- La rotación se realiza desde el panel de la plataforma y requiere volver a verificar la sincronización.

## Amenazas y controles

| Riesgo | Control actual |
| --- | --- |
| Fuga de detalles familiares por iCal | El feed publica solo “No disponible” |
| Acceso casual a la interfaz | La pantalla de clave `9014` es obligatoria en cada carga y no puede desactivarse desde la aplicación |
| Acceso directo a la API pública | Riesgo aceptado por el modelo de clave local; Supabase permite a `anon` y a sesiones antiguas `authenticated` leer, insertar y actualizar reservas |
| Pérdida por borrado | `deleted_at` oculta la fila y el trigger append-only conserva actor y versiones |
| Fuga de proveedor o huésped hacia Operaciones | `/availability` publica sólo reservas particulares y fechas externas con un identificador HMAC opaco; nunca fuente, UID, familia, huésped, notas ni URL |
| Fuga de identidad hacia el Linktree | `/public-availability` incluye todas las ocupaciones, pero solo publica rangos consolidados sin identificadores ni fuente |
| Fallo de un proveedor externo | La sincronización conserva el último conjunto válido |
| Supresión accidental de una reserva real | Las excepciones se limitan a la clave compuesta `source + external_uid`, están cerradas a `anon` y se administran sólo con `service_role` |
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
