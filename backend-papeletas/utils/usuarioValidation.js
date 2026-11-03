function nombreUsuarioError(nombre) {
    if (typeof nombre !== 'string' || !nombre.trim()) return 'El nombre de usuario no puede estar vacío.';
    if (nombre !== nombre.trim()) return 'El nombre de usuario no puede tener espacios al principio ni al final.';
    if (!/^[A-Za-z0-9._-]{3,50}$/.test(nombre)) return 'El nombre de usuario debe tener de 3 a 50 caracteres: letras, números, punto, guion o guion bajo.';
    return null;
}
module.exports = { nombreUsuarioError };
