# Despliegue

La PWA se publica como archivos estáticos incluyendo `assets/` y el manifiesto. El backend se despliega mediante la CLI de Supabase tras aplicar migraciones. Antes de publicar, valida con `make ci`, prueba el feed iCal y confirma que las fuentes externas conservan el último estado válido si falla una descarga.
