// U2: clasificación y etiqueta de los dos roles de autenticación.
function rolDesdeId(idRol) { return idRol === 1 ? 'admin' : 'user'; }
function nombreRol(rol) { return rol === 'admin' ? 'Administrador' : 'Usuario'; }
module.exports = { rolDesdeId, nombreRol };
