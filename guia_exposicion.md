# Guía de Exposición: Sistema de Control Patrimonial - EsSalud

Esta guía está diseñada para ayudarte a explicar el funcionamiento técnico y funcional de tu sistema en una exposición o presentación.

---

## 1. Estructura del Proyecto (Carpetas)

El sistema utiliza una arquitectura de **Separación de Responsabilidades** (Frontend y Backend independientes).

### 📂 Raíz del Proyecto
*   **`backend-papeletas/`**: Es el "cerebro". Maneja la base de datos, la seguridad y las reglas de negocio.
*   **`frontend-papeletas/`**: Es la "cara". Es la aplicación web interactiva que usan los administrativos.

### 📂 Detalle del Backend (Node.js + Express)
*   **`config/`**: Contiene la conexión a la base de datos (PostgreSQL).
*   **`controllers/`**: Aquí está la lógica. Cuando pides ver los "Equipos", el controlador busca en la base de datos y responde.
*   **`routes/`**: Define las URLs de la API (ej. `/api/papeletas`, `/api/auth/login`).
*   **`middlewares/`**: Contiene el guardián de seguridad (`authMiddleware.js`) que verifica que el usuario tenga un token JWT válido antes de entrar.
*   **`utils/`**: Funciones de ayuda, como el manejo estandarizado de respuestas.

### 📂 Detalle del Frontend (Angular 18 + Tailwind)
*   **`src/app/services/`**: Aquí están los "mensajeros" (`BackendService`). Son los que llaman al backend para traer o enviar datos.
*   **`src/app/components/`**: Cada sección que ves (Dashboard, Equipos, Lugares) es un componente independiente.
*   **`src/styles.css`**: Es el corazón visual. Aquí definimos la paleta de azules institucionales de EsSalud para que todo se vea uniforme.

---

## 2. Flujo de Funcionamiento (¿Cómo se conectan?)

1.  **Login**: El usuario ingresa sus datos -> El frontend los envía al backend -> El backend verifica la contraseña (encriptada con `bcrypt`) -> Si es correcto, devuelve un **Token JWT** (válido por 1 hora).
2.  **Petición de Datos**: Cuando entras a "Equipos", el frontend envía el Token en la cabecera. El backend lo valida y le pide a PostgreSQL los registros.
3.  **Visualización**: El frontend recibe los datos en formato JSON y los dibuja en las tablas responsivas que optimizamos.

---

## 3. Tecnologías (Stack Tecnológico)

*   **Base de Datos**: PostgreSQL (Relacional, robusta).
*   **Backend**: Node.js con Express (Rápido y escalable).
*   **Frontend**: Angular 18 (Arquitectura profesional) + Tailwind CSS (Diseño moderno).
*   **Seguridad**: JWT (Autenticación) + Bcrypt (Seguridad de contraseñas).
*   **Reportes**: jsPDF (Generación de PDF en el navegador).

---

## 4. Posibles Preguntas de la Expo (FAQ)

**P: ¿Cómo aseguras que las contraseñas no sean robadas?**
*   *R: Las contraseñas no se guardan como texto simple. Usamos `bcrypt` para aplicar un hash salado de 10 rondas. Incluso si alguien entra a la base de datos, no podrá ver la clave real.*

**P: ¿Qué pasa si el token JWT es interceptado?**
*   *R: El token tiene una vida corta (1 hora). Además, viaja en los encabezados HTTP y solo es válido para la sesión actual. Al cerrar sesión, se elimina del LocalStorage del navegador.*

**P: ¿Cómo manejas el rendimiento si hay miles de registros?**
*   *R: Implementamos una paginación híbrida. El backend envía los datos y el frontend los organiza en grupos de 10, evitando que el navegador se congele y permitiendo una navegación fluida.*

**P: ¿Por qué usaste Angular y no React?**
*   *R: Angular nos ofrece una estructura más robusta y organizada (TypeScript nativo) para sistemas administrativos empresariales como el de EsSalud, facilitando el mantenimiento a largo plazo.*

**P: ¿Cómo se generan las papeletas en PDF?**
*   *R: Usamos las librerías `jsPDF` y `html2canvas`. Capturamos el diseño del formulario que ves en pantalla y lo convertimos en un documento PDF listo para imprimir sin necesidad de recargar la página.*

**P: ¿Cómo garantizas la consistencia visual?**
*   *R: Centralizamos todos los colores en variables CSS institucionales (`--essalud-blue`). Si la institución cambia de color, solo editamos una línea de código y todo el sistema (botones, tablas, menús) se actualiza automáticamente.*
