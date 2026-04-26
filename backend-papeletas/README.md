# Backend - API RESTful (Sistema Patrimonial)

Este subproyecto contiene toda la lógica de negocio, manejo de base de datos y la API principal que consume el Frontend.

## Tecnologías Utilizadas

- **Node.js y Express**: Entorno de ejecución y framework para enrutamiento.
- **PostgreSQL**: Base de datos relacional para el almacenamiento persistente. Librería `pg`.
- **Bcrypt**: Para encriptación segura de contraseñas de usuarios.
- **JSON Web Tokens (JWT)**: Para la autenticación y validación de sesiones seguras (`jsonwebtoken`).
- **Dotenv**: Manejo de variables de entorno (credenciales, puertos).

## Estructura de Directorios

- **`/config`**: Archivos de configuración general (ej. `database.js` para la conexión a la pool de Postgres).
- **`/controllers`**: Lógica de cada endpoint. Aquí reside la conexión entre las peticiones HTTP y las consultas SQL (ej. `papeletasController.js`, `usuariosController.js`).
- **`/middlewares`**: Funciones intermediarias. Por ejemplo, `authMiddleware.js` se encarga de interceptar rutas privadas para asegurar que el token JWT sea válido.
- **`/routes`**: Definición de endpoints y rutas (ej. `/api/papeletas`, `/api/usuarios`, `/api/auth`).
- **`/utils`**: Funciones utilitarias y manejadores de respuestas estándar.

## Gestión de Usuarios (Creación)

Actualmente, **el sistema no cuenta con un módulo (interfaz) para el registro de nuevos usuarios**. 
Para crear nuevos usuarios en el sistema, es necesario interactuar directamente a nivel de backend:

1. **Vía Endpoint (API):**
   Puedes enviar un `POST` a `/api/usuarios/` con el siguiente cuerpo en formato JSON usando herramientas como Postman. Necesitarás proveer el token de un usuario Administrador en los Headers.
   ```json
   {
       "nombre_usuario": "nuevo_usuario",
       "contrasena": "tu_clave",
       "id_rol": 1
   }
   ```
2. **Vía Base de Datos / Script (Como se realizó para `admin2`):**
   Se puede crear un script temporal en Node.js que importe la librería `bcrypt` para hacer un `hash` de la contraseña y ejecutar un `INSERT INTO usuarios` mediante el objeto `pool`. Las contraseñas en la base de datos de Postgres **jamás** deben insertarse en texto plano.

## Inicio de Servidor

Asegúrate de contar con un archivo `.env` configurado con tus credenciales de Postgres.
```bash
npm install
npm start
```
El servidor escuchará típicamente en el puerto configurado (ej. 3000 o 5000).
