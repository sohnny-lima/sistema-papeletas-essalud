// g024-1: pg sustituye el error fatal por «not queryable» en la consulta siguiente.
// Conservar la causa original; la registra el controlador con el id de petición.
function conservarErrorCliente(client) {
    let primerError;
    client.on('error', error => { primerError ??= error; });
    const causa = error => primerError &&
        /^Client (has encountered a connection error and is|was closed and is) not queryable$/.test(error?.message || '')
        ? primerError : error;
    const query = client.query;
    client.query = function (...args) {
        const ultimo = args.length - 1;
        if (typeof args[ultimo] === 'function') {
            const callback = args[ultimo];
            args[ultimo] = (error, resultado) => callback(causa(error), resultado);
        }
        try {
            const resultado = query.apply(this, args);
            return resultado && typeof resultado.catch === 'function'
                ? resultado.catch(error => { throw causa(error); }) : resultado;
        } catch (error) { throw causa(error); }
    };
}

module.exports = { conservarErrorCliente };
