const { randomBytes } = require('node:crypto');

// El identificador siempre se devuelve, también si se desactiva el registro.
function accessLog(req, res, next) {
    const recibido = req.get('X-Request-Id');
    const idPeticion = typeof recibido === 'string' && /^[a-f0-9]{32}$/.test(recibido)
        ? recibido : randomBytes(16).toString('hex');
    res.locals.idPeticion = idPeticion;
    res.set('X-Request-Id', idPeticion);
    if (process.env.ACCESS_LOG_ENABLED === 'false' || req.path.startsWith('/api/salud')) return next();

    const inicio = process.hrtime.bigint();
    let ruta;
    const actualizarRuta = () => {
        if (req.baseUrl) {
            ruta = typeof req.route?.path === 'string' ? req.baseUrl + req.route.path : req.baseUrl;
        } else if (!ruta && typeof req.route?.path === 'string') {
            ruta = req.route.path;
        }
    };
    let registrado = false;
    const writeHead = res.writeHead;
    res.writeHead = function (...args) {
        // Capturar antes de que Express restaure baseUrl al salir del router.
        actualizarRuta();
        return writeHead.apply(this, args);
    };
    const registrar = () => {
        if (registrado) return;
        registrado = true;
        actualizarRuta();
        console.log(JSON.stringify({
            evento: 'acceso', fecha: new Date().toISOString(), idPeticion,
            metodo: req.method, ruta: ruta || 'SIN_RUTA', estado: res.statusCode,
            duracionMs: Number(process.hrtime.bigint() - inicio) / 1e6,
            idUsuario: req.usuario?.idUsuario ?? null,
            interrumpida: !res.writableFinished,
        }));
    };
    res.once('finish', registrar);
    res.once('close', registrar);
    next();
}

module.exports = { accessLog };
