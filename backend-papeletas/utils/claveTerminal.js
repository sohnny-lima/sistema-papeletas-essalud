// Función pura: permite comprobar la entrada sin eco sin necesitar un terminal real.
function procesarTecla(clave, texto, key = {}) {
    if (key.ctrl && (key.name === 'c' || key.name === 'd')) return { clave, accion: 'cancelar' };
    if (key.name === 'return' || key.name === 'enter') return { clave, accion: 'terminar' };
    if (key.name === 'backspace') return { clave: Array.from(clave).slice(0, -1).join(''), accion: 'continuar' };
    const noImprimibles = ['escape', 'tab', 'delete', 'up', 'down', 'left', 'right', 'home', 'end', 'pageup', 'pagedown', 'insert'];
    if (noImprimibles.includes(key.name) || key.ctrl || key.meta || !texto || /[\x00-\x1f\x7f]/u.test(texto)) {
        return { clave, accion: 'continuar' };
    }
    return { clave: clave + texto, accion: 'continuar' };
}
module.exports = { procesarTecla };
