import { InjectionToken } from '@angular/core';

// F1: servicio e interceptor comparten la API del mismo origen.
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '/api'
});

export function esApiPropia(url: string, base: string, origen: string): boolean {
  try {
    // g012 #6: solo rutas desde la raíz o absolutas, con el prefijo configurado.
    if (!url.startsWith('/') && !/^https?:\/\//.test(url)) return false;
    const relativa = base.startsWith('/') && !base.startsWith('//');
    const destino = relativa ? new URL(url, origen) : new URL(url);
    const api = new URL(base, origen);
    const ruta = api.pathname.replace(/\/$/, '');
    return destino.origin === api.origin &&
      (destino.pathname === ruta || destino.pathname.startsWith(ruta + '/'));
  } catch {
    return false;
  }
}
