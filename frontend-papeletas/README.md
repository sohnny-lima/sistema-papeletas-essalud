# Frontend · SPA Angular

Interfaz del Sistema de Papeletas (Angular 22, TypeScript 6, Bootstrap 5.3, Tailwind CSS 3). Visión general e instalación: [README principal](../README.md).

- **Estructura:** `src/app/`, con un componente *standalone* por módulo (papeletas, equipos, trabajadores, lugares, centros, usuarios, dashboard y acerca). `services/` concentra el acceso HTTP (`backend.service.ts`), la sesión (`auth.service.ts`, sincronizada entre pestañas) y el interceptor del token.
- **Estilos comunes:** clases `es-*` en `src/styles.css` (encabezado, buscador, tablas que pasan a fichas en el móvil, estados y diálogos).
- **Desarrollo:** `npm ci` y `npm start` (http://localhost:4200; `/api` se redirige a `http://localhost:3000`).
- **Pruebas:** `npx ng test --watch=false --browsers=ChromeHeadless`.
- **Compilación:** `npx ng build`.
- **Imagen Docker:** `Dockerfile` (Nginx sin privilegios; configuración en `nginx/`).
- **Versión mostrada en la interfaz:** `src/app/version.ts`, que se actualiza junto con `APP_VERSION`.
