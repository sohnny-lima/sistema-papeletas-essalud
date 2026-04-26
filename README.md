# EsSalud - Sistema de Control Patrimonial

Este proyecto es una solución integral diseñada para gestionar, controlar y emitir papeletas de traslados de bienes patrimoniales, equipos y trabajadores. Consta de dos partes principales: un **Backend** (API RESTful) y un **Frontend** (SPA).

## Arquitectura del Proyecto

El proyecto está separado en dos carpetas principales, permitiendo que el desarrollo del frontend y el backend sean independientes y escalables.

- **`backend-papeletas/`**: Contiene la lógica de negocio, conexión a base de datos y la API. Construido con Node.js, Express y PostgreSQL.
- **`frontend-papeletas/`**: Contiene la interfaz de usuario. Construida con Angular 18, Tailwind CSS y Bootstrap para componentes visuales estáticos.

## Características Principales

1. **Gestión de Papeletas**: Creación de Formatos Únicos Patrimoniales para traslados, mantenimientos o devoluciones de bienes. Generación en PDF.
2. **Inventario de Equipos**: Control de CPUs, Monitores, Impresoras, Teléfonos y otros bienes patrimoniales.
3. **Gestión de Lugares**: Control de dependencias, centros asistenciales y ambientes físicos.
4. **Directorio de Trabajadores**: Administración de personal al cual se le puede asignar bienes.
5. **Autenticación (JWT)**: Sistema de login y protección de rutas mediante JSON Web Tokens.

## Despliegue y Ejecución

Para levantar todo el ecosistema en desarrollo, necesitarás ejecutar tanto el backend como el frontend de manera simultánea en terminales separadas.

Consulta el `README.md` de cada carpeta para obtener detalles específicos sobre su configuración y ejecución:
- [Documentación del Backend](./backend-papeletas/README.md)
- [Documentación del Frontend](./frontend-papeletas/README.md)
