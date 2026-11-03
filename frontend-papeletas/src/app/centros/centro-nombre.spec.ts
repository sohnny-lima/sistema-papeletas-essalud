import { normalizarNombreCentro, mismoNombreCentro } from './centro-nombre';

describe('Utilidades de nombre de centro asistencial (centro-nombre)', () => {
  describe('normalizarNombreCentro', () => {
    it('recorta espacios extremos, colapsa espacios repetidos y convierte a mayúsculas', () => {
      expect(normalizarNombreCentro('  hospital   nacional\t\talmenara   ')).toBe(
        'HOSPITAL NACIONAL ALMENARA'
      );
    });

    it('devuelve cadena vacía para valores vacíos, solo espacios, null o undefined', () => {
      expect(normalizarNombreCentro('')).toBe('');
      expect(normalizarNombreCentro('   \t\n  ')).toBe('');
      expect(normalizarNombreCentro(null as unknown as string)).toBe('');
      expect(normalizarNombreCentro(undefined as unknown as string)).toBe('');
    });
  });

  describe('mismoNombreCentro', () => {
    it('devuelve true si dos nombres coinciden tras normalizar mayúsculas y espacios', () => {
      expect(
        mismoNombreCentro('HOSPITAL DE PRUEBA NORTE', '  hospital   de\tprueba  norte ')
      ).toBeTrue();
    });

    it('devuelve false si los nombres normalizados son distintos', () => {
      expect(
        mismoNombreCentro('HOSPITAL DE PRUEBA NORTE', 'HOSPITAL DE PRUEBA SUR')
      ).toBeFalse();
    });
  });
});
