import { TestBed } from '@angular/core/testing';
import { HttpClient, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthInterceptor } from './auth.interceptor';
import Swal from 'sweetalert2';

// SP: sesión compartida por las pestañas del mismo perfil (incidencia de la revisión manual del 01/11/2026).
describe('SP sesión entre pestañas del mismo perfil', () => {
  let auth: AuthService, http: HttpClient, control: HttpTestingController, router: Router;
  let recargar: jasmine.Spy, abrir: jasmine.Spy, urlActual: jasmine.Spy;
  const token = (id: number, rol: 'admin' | 'user', exp = Date.now() / 1000 + 3600) =>
    `e30.${btoa(JSON.stringify({ exp, idUsuario: id, nombreUsuario: rol === 'admin' ? 'admin_prueba' : 'usuario_prueba', rol }))}.firma`;
  const admin = token(1, 'admin');
  const usuario = token(2, 'user');
  /** Lo que haría el navegador si otra pestaña escribe en `localStorage`. */
  const otraPestana = (valor: string | null, key: string | null = 'authToken') => {
    if (key === null) localStorage.clear();
    else if (valor === null) localStorage.removeItem('authToken');
    else localStorage.setItem('authToken', valor);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: valor }));
  };

  beforeEach(() => {
    localStorage.removeItem('authToken');
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      provideHttpClient(withXhr(), withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
    ] });
    auth = TestBed.inject(AuthService); http = TestBed.inject(HttpClient);
    control = TestBed.inject(HttpTestingController); router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    recargar = spyOn<any>(auth, 'recargarPagina');
    abrir = spyOn<any>(auth, 'abrirDocumento');
    urlActual = spyOnProperty(router, 'url');
    urlActual.and.returnValue('/menu-principal/centros');
    auth.saveToken(admin);
  });
  afterEach(() => { control.verify(); localStorage.removeItem('authToken'); });

  it('SP-1 cerrar sesión en otra pestaña lleva al login con su aviso y retira la sesión', () => {
    otraPestana(null);
    expect(auth.sesion()).toBeNull();
    expect(abrir).toHaveBeenCalledOnceWith('/login', { sesion: 'otra-pestana' });
    expect(recargar).not.toHaveBeenCalled();
  });

  it('SP-2 entrar con otra cuenta en otra pestaña actualiza la sesión y recarga la pantalla', () => {
    otraPestana(usuario);
    expect(auth.sesion()).toEqual(jasmine.objectContaining({ nombreUsuario: 'usuario_prueba', rol: 'user', rolNombre: 'Usuario' }));
    expect(auth.isAdmin()).toBeFalse();
    expect(recargar).toHaveBeenCalledTimes(1);
    expect(abrir).not.toHaveBeenCalled();
  });

  it('SP-3 una pestaña en el login entra al menú cuando otra inicia sesión', () => {
    auth.logout();
    urlActual.and.returnValue('/login?sesion=otra-pestana');
    otraPestana(usuario);
    expect(abrir).toHaveBeenCalledOnceWith('/menu-principal');
    expect(recargar).not.toHaveBeenCalled();
  });

  it('SP-4 ignora eventos que no cambian el token y claves ajenas', () => {
    otraPestana(admin);
    localStorage.setItem('otraClave', 'x');
    window.dispatchEvent(new StorageEvent('storage', { key: 'otraClave', newValue: 'x' }));
    localStorage.removeItem('otraClave');
    expect(recargar).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
    expect(auth.sesion()?.rol).toBe('admin');
  });

  it('SP-5 localStorage.clear() y un token caducado cuentan como sesión cerrada', () => {
    otraPestana(null, null);
    expect(abrir).toHaveBeenCalledOnceWith('/login', { sesion: 'otra-pestana' });
    auth.saveToken(admin); abrir.calls.reset();
    otraPestana(token(2, 'user', Date.now() / 1000 - 10));
    expect(abrir).toHaveBeenCalledOnceWith('/login', { sesion: 'otra-pestana' });
    expect(recargar).not.toHaveBeenCalled();
  });

  it('SP-6 al volver a la pestaña detecta un cambio cuyo evento no llegó', () => {
    localStorage.setItem('authToken', usuario); // sin evento: pestaña congelada
    window.dispatchEvent(new Event('focus'));
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('SP-7 los cambios hechos por la propia pestaña no recargan ni redirigen', () => {
    auth.logout(); window.dispatchEvent(new Event('focus'));
    auth.saveToken(usuario); document.dispatchEvent(new Event('visibilitychange'));
    expect(recargar).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
  });

  it('SP-8 descarta las respuestas y errores pendientes de la sesión anterior', () => {
    const datos = jasmine.createSpy('datos'), alerta = jasmine.createSpy('alerta'), fin = jasmine.createSpy('fin');
    http.get('/api/equipos').subscribe({ next: datos, error: alerta, complete: fin });
    http.get('/api/centros').subscribe({ next: datos, error: alerta });
    http.get('/api/lugares').subscribe({ next: datos, error: alerta });
    const pendiente = control.expectOne('/api/equipos');
    expect(pendiente.request.headers.get('Authorization')).toBe(`Bearer ${admin}`);
    otraPestana(usuario);
    pendiente.flush({ success: true, message: 'ok', data: [{ id_equipo: 1 }] });
    control.expectOne('/api/centros').flush({}, { status: 500, statusText: 'Error' });
    control.expectOne('/api/lugares').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(datos).not.toHaveBeenCalled();
    expect(alerta).not.toHaveBeenCalled();
    expect(fin).toHaveBeenCalled();
    // El 401 tardío del token anterior no cierra la sesión nueva.
    expect(auth.getToken()).toBe(usuario);
    expect(router.navigate).not.toHaveBeenCalledWith(['/login'], jasmine.anything());
  });

  it('SP-9 las respuestas de la sesión vigente se entregan con normalidad', () => {
    const datos = jasmine.createSpy('datos');
    http.get('/api/equipos').subscribe(datos);
    control.expectOne('/api/equipos').flush({ success: true, message: 'ok', data: [] });
    expect(datos).toHaveBeenCalledTimes(1);
  });
  it('SP-10 r007-1 una acción de la cuenta anterior no sale con el token nuevo antes del evento', () => {
    localStorage.setItem('authToken', usuario); // otra pestaña cambió la cuenta; el evento aún no llegó
    const datos = jasmine.createSpy('datos');
    http.put('/api/equipos/1', { descripcion: 'formulario de la cuenta anterior' }).subscribe(datos);
    control.expectNone('/api/equipos/1');
    expect(datos).not.toHaveBeenCalled();
    expect(recargar).toHaveBeenCalledTimes(1);
  });

  it('SP-11 r007-1 durante la carga del documento nuevo no sale ninguna petición', () => {
    otraPestana(usuario);
    http.get('/api/lugares').subscribe();
    http.delete('/api/equipos/1').subscribe();
    control.expectNone('/api/lugares');
    control.expectNone('/api/equipos/1');
  });

  it('SP-12 r007-2 al caducar la sesión se cierra la confirmación abierta sin ejecutar su acción', async () => {
    const confirmacion = Swal.fire({ title: '¿Eliminar equipo?', showCancelButton: true });
    expect(Swal.isVisible()).toBeTrue();
    auth.expireSession(admin);
    const resultado = await confirmacion;
    expect(resultado.isConfirmed).toBeFalse();
    expect(resultado.isDismissed).toBeTrue(); // cerrada (su animación de salida puede seguir)
    expect(router.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { sesion: 'caducada' } });
  });

  it('SP-13 r007-2 cerrar sesión retira diálogos y su fondo', async () => {
    const fondo = document.createElement('div'); fondo.className = 'modal-backdrop show'; document.body.appendChild(fondo);
    document.body.classList.add('modal-open');
    const confirmacion = Swal.fire({ title: '¿Guardar?', showCancelButton: true });
    auth.logout();
    expect((await confirmacion).isConfirmed).toBeFalse();
    expect(document.querySelector('.modal-backdrop')).toBeNull();
    expect(document.body.classList.contains('modal-open')).toBeFalse();
  });
  it('SP-14 r007b-2 si el documento no se sustituye, la carga se reintenta al pedir datos y al volver a la pestaña', () => {
    otraPestana(usuario);
    expect(recargar).toHaveBeenCalledTimes(1);
    http.get('/api/equipos').subscribe();
    control.expectNone('/api/equipos');
    expect(recargar).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event('focus'));
    expect(recargar).toHaveBeenCalledTimes(3);
  });

  it('SP-15 r007b-1 cerrar sesión durante la apertura de un diálogo de Bootstrap no deja callbacks rotos', async () => {
    const bootstrap = (window as any).bootstrap;
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = '<div class="modal-dialog"><div class="modal-content"><button type="button">Cerrar</button></div></div>';
    document.body.appendChild(modal);
    const errores: string[] = [];
    const alError = (e: ErrorEvent) => { errores.push(e.message); e.preventDefault(); };
    window.addEventListener('error', alError);
    try {
      bootstrap.Modal.getOrCreateInstance(modal).show(); // la transición de apertura queda pendiente
      expect(bootstrap.Modal.getInstance(modal)._isShown).toBeTrue();
      auth.expireSession(admin);
      await new Promise(r => setTimeout(r, 700)); // más que la transición de Bootstrap
      expect(errores).toEqual([]);
      expect(bootstrap.Modal.getInstance(modal)).toBeNull();
      expect(document.querySelector('.modal-backdrop')).toBeNull();
      expect(document.body.classList.contains('modal-open')).toBeFalse();
    } finally {
      window.removeEventListener('error', alError);
      modal.remove();
    }
  });
});
