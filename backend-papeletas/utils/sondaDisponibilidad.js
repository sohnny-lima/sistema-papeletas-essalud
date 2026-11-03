// g012 #5: una comprobación en vuelo y caché de resultados, incluidos los fallos.
function crearSonda(comprobar, reloj = Date.now) {
    let enVuelo, resultado, hasta = 0;
    return function consultar() {
        if (enVuelo) return enVuelo;
        if (reloj() < hasta) return Promise.resolve(resultado);
        enVuelo = Promise.resolve().then(comprobar).then(Boolean, () => false).then(ok => {
            resultado = ok;
            hasta = reloj() + 2000;
            enVuelo = undefined;
            return ok;
        });
        return enVuelo;
    };
}
module.exports = { crearSonda };
