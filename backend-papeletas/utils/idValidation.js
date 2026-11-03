// Identificador PostgreSQL INTEGER positivo; acepta números o texto decimal.
function esIdValido(valor) {
    return (typeof valor === 'string' || typeof valor === 'number') &&
        /^[0-9]+$/.test(String(valor)) && Number.isSafeInteger(Number(valor)) &&
        Number(valor) >= 1 && Number(valor) <= 2147483647;
}
module.exports = { esIdValido };
