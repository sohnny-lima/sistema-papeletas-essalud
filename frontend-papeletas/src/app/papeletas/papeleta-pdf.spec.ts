import { prepararDatosPDF } from './papeleta-pdf';

describe('P8/P9 preparación pura del PDF', () => {
  it('asigna dependencia y ambiente distintos en origen y destino, incluidos paréntesis', () => {
    const p = Object.freeze({
      lugar_origen_nombre: 'NO INTERPRETAR (TEXTO)',
      lugar_origen_ambiente: 'OFICINA (101)', lugar_origen_dependencia: 'ADMINISTRACIÓN',
      lugar_destino_ambiente: 'ALMACÉN CENTRAL', lugar_destino_dependencia: 'LOGÍSTICA (SUR)'
    });
    const datos = prepararDatosPDF(p);
    expect(datos.origen[1]).toEqual(['DEPENDENCIA', 'ADMINISTRACIÓN']);
    expect(datos.origen[2]).toEqual(['AMBIENTE', 'OFICINA (101)']);
    expect(datos.destino[1]).toEqual(['DEPENDENCIA', 'LOGÍSTICA (SUR)']);
    expect(datos.destino[2]).toEqual(['AMBIENTE', 'ALMACÉN CENTRAL']);
  });
  it('cada bien tiene seis celdas en el orden de las cabeceras, aunque falten datos', () => {
    const datos = prepararDatosPDF({ equipos_patrimoniales: [{ cod_patrimonial: '1234', descripcion: 'CPU', marca: 'M', serie: 'S', modelo: 'MO' }, {}] });
    expect(datos.cabeceras.length).toBe(6);
    expect(datos.bienes[0]).toEqual([1, '1234', 'CPU', 'M', 'S', 'MO']);
    expect(datos.bienes.every(fila => fila.length === datos.cabeceras.length)).toBeTrue();
    expect(prepararDatosPDF({}).bienes).toEqual([]);
  });
});
