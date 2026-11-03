function passwordError(nombre, clave, env = process.env) {
    const minimo = Number(env.PASSWORD_MIN_LENGTH || 10);
    if (typeof clave !== 'string' || clave.length < minimo) {
        return `La contraseña debe tener al menos ${minimo} caracteres.`;
    }
    // bcrypt solo considera los primeros 72 bytes; se rechaza la truncación silenciosa.
    if (Buffer.byteLength(clave, 'utf8') > 72) return 'La contraseña no puede superar 72 bytes UTF-8.';
    if (!/\p{L}/u.test(clave) || !/[0-9]/.test(clave)) return 'La contraseña debe incluir al menos una letra y un número.';
    if (clave.toLocaleLowerCase() === nombre.trim().toLocaleLowerCase()) return 'La contraseña debe ser distinta del nombre de usuario.';
    return null;
}
module.exports = { passwordError };
