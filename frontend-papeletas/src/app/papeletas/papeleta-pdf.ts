type FilaFicha = [string, string] | [string, string, string, string];

/** Prepara los datos sin DOM ni jsPDF; nunca interpreta el nombre compuesto del lugar. */
export function prepararDatosPDF(papeleta: any): {
  origen: FilaFicha[]; destino: FilaFicha[]; cabeceras: string[]; bienes: (string | number)[][];
} {
  const ficha = (lado: 'origen' | 'destino'): FilaFicha[] => [
    ['TRABAJADOR', papeleta[`trabajador_${lado}_nombre`] || '', 'CÓDIGO', papeleta[`trabajador_${lado}_codigo`] || ''],
    ['DEPENDENCIA', papeleta[`lugar_${lado}_dependencia`] || ''],
    ['AMBIENTE', papeleta[`lugar_${lado}_ambiente`] || ''],
    ['CENTRO', papeleta[`${lado}_centro`] || '']
  ];
  return {
    origen: ficha('origen'),
    destino: ficha('destino'),
    cabeceras: ['ITEM', 'CÓDIGO PATRIMONIAL', 'DESCRIPCIÓN Y ESPECIFICACIONES DEL BIEN', 'MARCA', 'SERIE', 'MODELO'],
    bienes: (papeleta.equipos_patrimoniales || []).map((e: any, i: number) => [
      i + 1, e.cod_patrimonial || '', e.descripcion || '', e.marca || '', e.serie || '', e.modelo || ''
    ])
  };
}
