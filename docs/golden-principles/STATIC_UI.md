# UI estática y accesible

## Regla

Mantén una PWA servible por HTTP estático y centraliza los tokens visuales en CSS.

El navegador carga los archivos directamente. Un cambio no debe exigir instalar dependencias, compilar assets ni ejecutar un servidor de aplicación.

## Sí

```css
:root { --glass-bg: rgba(255, 255, 255, .32); }
```

```html
<!-- Las entradas del cliente permanecen explícitas. -->
<link rel="stylesheet" href="styles.css">
<script src="app.js"></script>
```

## No

```js
document.body.style.background = "#fff"; // dispersa la identidad visual
```

```js
// No introduzcas un runtime para una vista que ya es estática.
import Framework from "framework";
```

## Verificación

- Sirve la carpeta con `python3 -m http.server 8000`; no uses `file://`.
- Revisa escritorio y el corte móvil después de cambiar layout o tokens.
- Ejecuta `make ci` para comprobar entradas, sintaxis y archivos obligatorios.

## Excepción

Los colores por familia se asignan desde `CONFIG.families`, porque forman parte del dominio y no del tema global.
