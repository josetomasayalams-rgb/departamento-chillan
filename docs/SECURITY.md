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
| Fallo de un proveedor externo | La sincronización conserva el último conjunto válido |
| HTML inyectado desde notas | La interfaz escapa texto antes de insertarlo |
| Respuestas externas grandes | La función limita el tamaño del calendario |

Reporta un incidente a los administradores del departamento; evita pegar información sensible en tickets o conversaciones.
