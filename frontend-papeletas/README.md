# Frontend - Panel de Administración (Sistema Patrimonial)

Este subproyecto contiene la interfaz visual del sistema, permitiendo a los usuarios autenticados gestionar de manera ágil e interactiva los registros de la base de datos.

## Tecnologías Utilizadas

- **Angular 18**: Framework principal (SPA, componentes standalone, enrutamiento).
- **Tailwind CSS**: Framework de utilidades CSS para diseño responsivo y moderno.
- **Bootstrap 5**: Utilizado de manera suplementaria principalmente para ventanas modales nativas y utilidades JS.
- **Chart.js**: Librería para visualización de gráficos estadísticos en el Dashboard.
- **SweetAlert2**: Para alertas y notificaciones modales estilizadas y no intrusivas.
- **jsPDF y html2canvas**: Para la generación en tiempo real y exportación de las papeletas (Formulario Único) a PDF.

## Paleta de Colores Institucional

Todo el diseño está regido por una paleta centralizada en `src/styles.css`, la cual usa como eje principal el azul institucional (`#007BFF`) y el azul oscuro marino (`#004085`). Todo el sistema (botones primarios, barras de navegación, modales y tablas) responde a estas variables CSS, lo que garantiza una coherencia de diseño absoluta.

## Estructura de Componentes

La aplicación está modularizada en componentes `standalone` ubicados en `src/app`:

- **`/login`**: Interfaz de autenticación con protección de rutas.
- **`/menu-principal`**: El esqueleto de la aplicación (Layout). Contiene el Navbar y el Sidebar colapsable.
- **`/dashboard`**: Pantalla inicial con métricas, gráficos en vivo (`Chart.js`) con ejecución fuera de Angular Zone (`runOutsideAngular`) para mejor rendimiento.
- **CRUDs (`/equipos`, `/lugares`, `/trabajadores`, `/papeletas`)**: Tablas interactivas con sistema de paginación compacta, sistema de filtrado interno en frontend, y diseño responsivo adaptado tanto a pantallas grandes (Desktop) como a dispositivos móviles (tarjetas/cards).
- **`/services`**: Contiene `BackendService`, el encargado exclusivo de orquestar todas las llamadas HTTP (GET, POST, PUT, DELETE) hacia el backend, así como `AuthInterceptor` para incrustar los tokens JWT en cada petición automáticamente.

## Rendimiento y UI/UX
- **Paginación híbrida**: Para garantizar agilidad, componentes como "Papeletas" implementan el particionamiento de datos en grupos de 10 de manera local en el frontend, lo que elimina bloqueos visuales y ralentizaciones.
- **Carga (Loaders)**: Inserción de *spinners* asincrónicos para indicar al usuario las peticiones en curso sin congelar el navegador.

## Inicio de Servidor de Desarrollo

Ejecuta el proyecto con Angular CLI:
```bash
npm install
npm start
```
Abre `http://localhost:4200/` en tu navegador.
