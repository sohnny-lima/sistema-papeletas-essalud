// Nombre de un centro asistencial: mismas reglas que el backend (utils/centroValidation.js).
// Dos nombres son el mismo centro si coinciden tras quitar espacios extremos, reducir los
// espacios repetidos a uno y pasar a mayúsculas.

export interface Centro {
  id_centro: number;
  nombre_centro: string;
  total_lugares?: number;
}

export const MAX_NOMBRE_CENTRO = 200;

export function normalizarNombreCentro(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}

export function mismoNombreCentro(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizarNombreCentro(a) === normalizarNombreCentro(b);
}

/** Copia ordenada alfabéticamente (como la devuelve la API). */
export function ordenarCentros(centros: Centro[]): Centro[] {
  return [...centros].sort(
    (a, b) =>
      String(a.nombre_centro ?? '').localeCompare(String(b.nombre_centro ?? ''), 'es') ||
      Number(a.id_centro) - Number(b.id_centro)
  );
}
