const pool = require('./config/database');
const bcrypt = require('bcrypt');

// =========================================================
// SCRIPT PARA CREAR USUARIOS MANUALMENTE DESDE LA CONSOLA
// Instrucciones:
// 1. Cambia los valores de "nombre_usuario", "contrasena" y "id_rol".
// 2. Ejecuta en la terminal (estando en la carpeta backend-papeletas):
//    node crear_usuario.js
// =========================================================

async function createAdminUser() {
    try {
        // 👇👇 EDITAR AQUÍ 👇👇
        const nombre_usuario = 'admin';
        const contrasena = '123456';
        const id_rol = 1; // 1 = Admin, 2 = Usuario normal (según tu base de datos)
        // 👆👆 EDITAR AQUÍ 👆👆

        // Encriptar la contraseña (NO TOCAR)
        const hashedPassword = await bcrypt.hash(contrasena, 10);

        const query = `
            INSERT INTO usuarios (nombre_usuario, contrasena, id_rol) 
            VALUES ($1, $2, $3) RETURNING id_usuario, nombre_usuario, id_rol;
        `;
        const result = await pool.query(query, [nombre_usuario, hashedPassword, id_rol]);

        console.log('\n✅ Usuario creado exitosamente:');
        console.log(result.rows[0]);
        console.log('\nYa puedes iniciar sesión en el panel frontal con este usuario.');
    } catch (error) {
        console.error('\n❌ Error al crear el usuario:', error.message);
    } finally {
        pool.end();
    }
}

createAdminUser();
