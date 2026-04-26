# 🏥 EsSalud - Sistema de Control Patrimonial

Este proyecto es una solución integral diseñada para gestionar, controlar y emitir papeletas de traslado de bienes patrimoniales, equipos y trabajadores dentro de una institución como EsSalud.

El sistema permite optimizar los procesos administrativos relacionados con el control de activos, mejorando la trazabilidad, organización y seguridad de la información.

Consta de dos partes principales: un **Backend (API RESTful)** y un **Frontend (SPA)**.

---

## 🚀 Tecnologías Utilizadas

### 🔹 Backend

- Node.js
- Express
- PostgreSQL
- JSON Web Tokens (JWT)

### 🔹 Frontend

- Angular 18
- Tailwind CSS
- Bootstrap

---

## 🏗️ Arquitectura del Proyecto

El proyecto está separado en dos carpetas principales, permitiendo que el desarrollo del frontend y el backend sean independientes, escalables y mantenibles.

- **`backend-papeletas/`**  
  Contiene la lógica de negocio, conexión a base de datos y la API REST. Gestiona autenticación, operaciones CRUD y generación de datos.

- **`frontend-papeletas/`**  
  Contiene la interfaz de usuario (SPA). Permite la interacción del usuario con el sistema mediante una experiencia moderna y responsive.

---

## ⚙️ Características Principales

1. **📄 Gestión de Papeletas**  
   Creación de Formatos Únicos Patrimoniales para traslados, mantenimientos o devoluciones de bienes, con opción de generación en PDF.

2. **💻 Inventario de Equipos**  
   Control de CPUs, monitores, impresoras, teléfonos y otros bienes patrimoniales.

3. **📍 Gestión de Lugares**  
   Administración de centros asistenciales, dependencias y ambientes físicos.

4. **👨‍💼 Directorio de Trabajadores**  
   Gestión del personal al cual se le asignan bienes.

5. **🔐 Autenticación (JWT)**  
   Sistema de login seguro con protección de rutas mediante tokens.

---

## ▶️ Despliegue y Ejecución

Para levantar el sistema en entorno de desarrollo, es necesario ejecutar el backend y el frontend en terminales separadas.

### 🔹 Backend

cd backend-papeletas
npm install
npm run dev

### 🔹 Frontend

cd frontend-papeletas
npm install
npm start
