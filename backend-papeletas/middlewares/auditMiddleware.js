// Una línea JSON por escritura terminada. Nunca se registran cabeceras ni cuerpos.
const ID_FIELDS = ['id', 'id_papeleta', 'id_equipo', 'id_trabajador', 'id_lugar', 'id_centro', 'id_usuario', 'id_rol', 'id_estado', 'id_tipo_formulario'];

function auditWrites(req, res, next) {
    if (process.env.AUDIT_ENABLED === 'false' || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    const inicio = process.hrtime.bigint();
    let idAfectado = null;
    // Cierre VM1 (g024-3): sin patrón de Express solo el montaje conocido o SIN_RUTA,
    // nunca segmentos del path enviados por el cliente (podrían ser datos personales).
    let ruta = 'SIN_RUTA';
    const json = res.json;
    res.json = function (body) {
        ruta = req.route ? req.baseUrl + req.route.path : (req.baseUrl || ruta);
        const id = req.params?.id ?? ID_FIELDS.map(campo => body?.data?.[campo]).find(valor => valor != null);
        if (/^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id))) idAfectado = Number(id);
        return json.call(this, body);
    };
    res.once('finish', () => {
        ruta = req.route ? req.baseUrl + req.route.path : (req.baseUrl || ruta);
        const id = req.params?.id;
        if (/^\d+$/.test(String(id)) && Number.isSafeInteger(Number(id))) idAfectado = Number(id);
        console.log(JSON.stringify({
            evento: 'auditoria',
            fecha: new Date().toISOString(),
            idUsuario: req.usuario?.idUsuario ?? null,
            rol: req.usuario?.rol ?? null,
            metodo: req.method,
            ruta,
            idAfectado,
            codigoRespuesta: res.statusCode,
            duracionMs: Number(process.hrtime.bigint() - inicio) / 1e6,
        }));
    });
    next();
}

module.exports = { auditWrites };
