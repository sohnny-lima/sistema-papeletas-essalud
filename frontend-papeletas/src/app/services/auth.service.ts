import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { jwtDecode } from 'jwt-decode';
import Swal from 'sweetalert2';
import { API_BASE_URL } from './api-config';

/** Usuario de la sesión vigente (bloque U, contrato §7.13). Solo informa: los permisos los decide la API. */
export interface SesionUsuario {
  idUsuario: number;
  nombreUsuario: string;
  rol: 'admin' | 'user';
  rolNombre: string;
}

/** Nombre legible del rol; coincide con el `rolNombre` que devuelve GET /api/auth/sesion. */
export function nombreDeRol(rol: 'admin' | 'user'): string {
  return rol === 'admin' ? 'Administrador' : 'Usuario';
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = inject(API_BASE_URL);
  private location = inject(Location);
  private authTokenKey = 'authToken';
  private sesionCaducada = false;
  private readonly sesionActual = signal<SesionUsuario | null>(null);
  private secuenciaRefresco = 0;
  /** Señal de solo lectura: primero los datos del token, después los confirmados por el servidor. */
  readonly sesion = this.sesionActual.asReadonly();

  /** Token con el que trabaja esta pestaña; si el de `localStorage` cambia, lo cambió otra pestaña. */
  private tokenConocido: string | null;
  /** r007-1: hay una carga completa del documento en curso; no se envía nada más. */
  private recargando = false;
  /** r007b-2: la carga pendiente se reintenta si el documento no llegó a sustituirse. */
  private cargaPendiente: (() => void) | null = null;

  constructor(
    private router: Router,
    private http: HttpClient
  ) {
    this.tokenConocido = this.getToken();
    this.sesionActual.set(this.sesionDesdeToken());
    this.escucharOtrasPestanas();
  }

  /**
   * Las pestañas del mismo perfil comparten `localStorage`: el evento `storage` avisa de los cambios
   * hechos en otra. Al volver a la pestaña también se compara, por si el navegador no entregó el evento.
   */
  private escucharOtrasPestanas(): void {
    const alAlmacenar = (evento: StorageEvent) => {
      if (evento.key === null || evento.key === this.authTokenKey) this.comprobarCambioExterno();
    };
    const alVolver = () => {
      if (document.visibilityState === 'hidden') return;
      if (this.recargando && this.getToken() === this.tokenConocido) this.cargaPendiente?.();
      else this.comprobarCambioExterno();
    };
    window.addEventListener('storage', alAlmacenar);
    window.addEventListener('focus', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('storage', alAlmacenar);
      window.removeEventListener('focus', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    });
  }

  /**
   * Otra pestaña cerró la sesión o entró con otra cuenta. Se carga de nuevo el documento para descartar
   * los datos, formularios, diálogos y peticiones de la identidad anterior; los guardas deciden la ruta.
   */
  comprobarCambioExterno(): void {
    const actual = this.getToken();
    if (actual === this.tokenConocido) return;
    this.tokenConocido = actual;
    if (!this.isAuthenticated()) {
      this.sesionCaducada = true; // los 401 tardíos de la sesión anterior no muestran otro aviso
      this.sesionActual.set(null);
      this.retirarDialogos();
      this.iniciarCarga(() => this.abrirDocumento('/login', { sesion: 'otra-pestana' }));
      return;
    }
    this.sesionCaducada = false;
    this.sesionActual.set(this.sesionDesdeToken());
    if (this.router.url.split(/[?#]/)[0] === '/login') this.iniciarCarga(() => this.abrirDocumento('/menu-principal'));
    else this.iniciarCarga(() => this.recargarPagina());
  }

  /** Desde aquí no sale ninguna petición hasta que cargue el documento nuevo (r007-1). */
  private iniciarCarga(carga: () => void): void {
    this.recargando = true;
    this.cargaPendiente = carga;
    carga();
  }

  /**
   * r007-1: una petición solo sale con el token que conoce esta pestaña. Si otra lo cambió y el evento
   * aún no llegó, no se envía (un formulario de la cuenta anterior no actúa con la nueva) y la pestaña se pone al día.
   */
  puedeEnviar(token: string | null): boolean {
    if (this.recargando) {
      this.cargaPendiente?.(); // r007b-2: si la carga anterior no sustituyó el documento, se reintenta
      return false;
    }
    if (token === this.tokenConocido) return true;
    this.comprobarCambioExterno();
    return false;
  }

  /**
   * r007-2: al salir de la sesión se cierran los diálogos abiertos, para que una confirmación de la
   * identidad anterior no sobreviva en el login (SweetAlert2 resuelve su promesa como descartada).
   */
  private retirarDialogos(): void {
    Swal.close();
    const bootstrap = (window as any).bootstrap;
    document.querySelectorAll('.modal').forEach(el => {
      const instancia = bootstrap?.Modal?.getInstance(el);
      // Abierto o abriéndose (`_isShown`); uno que su componente ya está cerrando se deja terminar.
      if (!instancia?._isShown) return;
      // r007b-1: se completan las transiciones pendientes (p. ej., una apertura en curso) antes de
      // disponer, para que ningún callback diferido de Bootstrap actúe sobre una instancia vacía.
      const fondo = instancia._backdrop?._element as HTMLElement | null | undefined;
      [fondo, el.querySelector('.modal-dialog'), el].forEach(n => n?.dispatchEvent(new Event('transitionend')));
      try { instancia.dispose(); } catch { /* el componente ya lo retiró */ }
    });
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  }

  /** Carga completa de una ruta de la aplicación (respeta el `base href`). */
  protected abrirDocumento(ruta: string, queryParams?: Record<string, string>): void {
    const url = this.router.serializeUrl(this.router.createUrlTree([ruta], { queryParams }));
    window.location.replace(this.location.prepareExternalUrl(url));
  }

  protected recargarPagina(): void {
    window.location.reload();
  }

  /** Id de la cuenta del token vigente, o null. Sirve para reconocer la propia cuenta en la interfaz. */
  getIdUsuario(): number | null {
    const id = this.decodeValidToken()?.idUsuario;
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  }

  /**
   * Confirma usuario y rol con GET /api/auth/sesion (p. ej., tras renombrar la propia cuenta).
   * Un 401 lo gestiona el interceptor; ante otros errores se conservan los datos del token.
   */
  refrescarSesion(): void {
    const token = this.getToken();
    if (!token || !this.isAuthenticated()) return;
    // R001-06: solo vale la respuesta del último refresco (renombrar no cambia el token).
    const secuencia = ++this.secuenciaRefresco;
    this.http.get<{ data?: Partial<SesionUsuario> }>(`${this.apiUrl}/auth/sesion`).subscribe({
      next: respuesta => {
        // Respuesta tardía de un token anterior o de un refresco superado: se descarta.
        if (this.getToken() !== token || secuencia !== this.secuenciaRefresco) return;
        const datos = respuesta?.data;
        if (!datos || typeof datos.nombreUsuario !== 'string' || (datos.rol !== 'admin' && datos.rol !== 'user')) return;
        this.sesionActual.set({
          idUsuario: Number(datos.idUsuario),
          nombreUsuario: datos.nombreUsuario,
          rol: datos.rol,
          rolNombre: typeof datos.rolNombre === 'string' && datos.rolNombre ? datos.rolNombre : nombreDeRol(datos.rol)
        });
      },
      error: () => { /* sin cambios: el indicador sigue con los datos del token */ }
    });
  }

  /** Tras cambiar la propia contraseña el servidor invalida la sesión: se sale sin el aviso de «caducada». */
  cerrarSesionPorCambioDeClave(): void {
    this.sesionCaducada = true; // ignora los 401 tardíos de la sesión anterior
    localStorage.removeItem(this.authTokenKey);
    this.tokenConocido = null;
    this.sesionActual.set(null);
    this.retirarDialogos();
    this.router.navigate(['/login'], { queryParams: { sesion: 'clave-cambiada' } });
  }

  login(username: string, password: string): Observable<any> {
    return this.http
      .post<{ token: string }>(`${this.apiUrl}/auth/login`, {
        nombreUsuario: username,
        contrasena: password
      })
      .pipe(
        tap(response => {
          this.saveToken(response.token);
          this.router.navigate(['/menu-principal']);
        })
      );
  }

  saveToken(token: string): void {
    this.sesionCaducada = false;
    localStorage.setItem(this.authTokenKey, token);
    this.tokenConocido = token;
    this.sesionActual.set(this.sesionDesdeToken());
  }

  logout(): void {
    localStorage.removeItem(this.authTokenKey);
    this.tokenConocido = null;
    this.sesionActual.set(null);
    this.retirarDialogos();
    this.router.navigate(['/login']);
  }

  /** Un solo aviso por sesión; ignora respuestas tardías de un token anterior. */
  expireSession(token: string | null): void {
    const vigente = this.getToken();
    if (this.sesionCaducada || (vigente !== null && vigente !== token)) return;
    this.sesionCaducada = true;
    localStorage.removeItem(this.authTokenKey);
    this.tokenConocido = null;
    this.sesionActual.set(null);
    this.retirarDialogos();
    this.router.navigate(['/login'], { queryParams: { sesion: 'caducada' } });
  }

  /** Comprueba si el token no ha expirado */
  isAuthenticated(): boolean {
    return this.decodeValidToken() !== null;
  }

  getToken(): string | null {
    return localStorage.getItem(this.authTokenKey);
  }

  /**
   * Rol del token vigente ('admin' | 'user'), o null si no hay token, es inválido o caducó.
   * Solo sirve para adaptar la interfaz: los permisos los comprueba la API.
   */
  getRol(): 'admin' | 'user' | null {
    const rol = this.decodeValidToken()?.rol;
    return rol === 'admin' || rol === 'user' ? rol : null;
  }

  isAdmin(): boolean {
    return this.getRol() === 'admin';
  }

  /** Datos de sesión del token vigente (antes de confirmarlos con el servidor). */
  private sesionDesdeToken(): SesionUsuario | null {
    const datos = this.decodeValidToken();
    const rol = datos?.rol;
    if (!datos || typeof datos.nombreUsuario !== 'string' || (rol !== 'admin' && rol !== 'user')) return null;
    return { idUsuario: Number(datos.idUsuario), nombreUsuario: datos.nombreUsuario, rol, rolNombre: nombreDeRol(rol) };
  }

  /**
   * Contenido del token si se puede decodificar, tiene exp y no ha caducado; si no, null.
   * Única regla de validez para isAuthenticated() y getRol().
   */
  private decodeValidToken(): any | null {
    const token = this.getToken();
    if (!token) {
      return null;
    }
    try {
      const decoded: any = jwtDecode(token);
      // Sin exp se considera inválido; exp está en segundos
      if (!decoded?.exp) {
        return null;
      }
      return decoded.exp > Math.floor(Date.now() / 1000) ? decoded : null;
    } catch {
      // Error al decodificar => token inválido
      return null;
    }
  }
}
