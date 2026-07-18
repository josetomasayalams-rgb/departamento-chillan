# Desarrollo local

Desde esta carpeta ejecuta `python3 -m http.server 8000` y abre `http://localhost:8000`. No abras el HTML con `file://`.

Sin configuración remota, la aplicación usa `localStorage`. Para trabajar contra el backend compartido se configura el cliente público en el punto central de configuración y se aplica el esquema/migraciones con la CLI de Supabase. Los valores sensibles se cargan únicamente en el gestor de secretos de la plataforma.
