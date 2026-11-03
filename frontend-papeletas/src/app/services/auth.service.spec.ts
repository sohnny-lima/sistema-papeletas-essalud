import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService, nombreDeRol } from './auth.service';
import { API_BASE_URL } from './api-config';

// Bloque U (U3, Claude): API de sesión que usan el indicador del encabezado y la pantalla «Usuarios».
describe('U3 AuthService: sesión del usuario', () => {
  let auth: AuthService, control: HttpTestingController;
  let router: jasmine.SpyObj<Router>;
  const ahora = () => Math.floor(Date.now() / 1000);
  // Token sin firma válida: el frontend solo lo decodifica; la firma la comprueba la API.
  const token = (datos: object, exp = ahora() + 3600) => `e30.${btoa(JSON.stringify({ exp, ...datos }))}.firma`;
  const admin = { idUsuario: 1, nombreUsuario: 'admin_prueba', rol: 'admin' };

  function iniciar() {
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: API_BASE_URL, useValue: '/api' },
      { provide: Router, useValue: router }
    ] });
    auth = TestBed.inject(AuthService);
    control = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    localStorage.removeItem('authToken');
    router = jasmine.createSpyObj('Router', ['navigate']);
    control = undefined as unknown as HttpTestingController;
  });
  // Algunas pruebas no crean el TestBed (funciones puras): solo se verifica si existe.
  afterEach(() => { control?.verify(); localStorage.removeItem('authToken'); });

  it('nombre legible de cada rol', () => {
    expect(nombreDeRol('admin')).toBe('Administrador');
    expect(nombreDeRol('user')).toBe('Usuario');
  });

  it('al arrancar con un token vigente expone la sesión y el id, sin pedir nada al servidor', () => {
    localStorage.setItem('authToken', token(admin));
    iniciar();
    expect(auth.sesion()).toEqual({ idUsuario: 1, nombreUsuario: 'admin_prueba', rol: 'admin', rolNombre: 'Administrador' });
    expect(auth.getIdUsuario()).toBe(1);
  });

  it('sin token, con token caducado o con datos incompletos no hay sesión ni id', () => {
    iniciar();
    expect(auth.sesion()).toBeNull();
    expect(auth.getIdUsuario()).toBeNull();
    auth.saveToken(token(admin, ahora() - 10));
    expect(auth.sesion()).toBeNull();
    auth.saveToken(token({ idUsuario: 3, rol: 'superusuario', nombreUsuario: 'x' }));
    expect(auth.sesion()).toBeNull();
    auth.saveToken(token({ idUsuario: 'abc', rol: 'user', nombreUsuario: 'x' }));
    expect(auth.getIdUsuario()).toBeNull();
  });

  it('refrescarSesion confirma usuario y rol con GET /api/auth/sesion (dentro de data)', () => {
    iniciar();
    auth.saveToken(token(admin));
    auth.refrescarSesion();
    control.expectOne('/api/auth/sesion').flush({ success: true, message: 'ok',
      data: { idUsuario: 1, nombreUsuario: 'admin_renombrado', rol: 'admin', rolNombre: 'Administrador' } });
    expect(auth.sesion()?.nombreUsuario).toBe('admin_renombrado');
  });

  it('ignora la respuesta tardía de un token anterior y las respuestas mal formadas', () => {
    iniciar();
    auth.saveToken(token(admin));
    auth.refrescarSesion();
    const pendiente = control.expectOne('/api/auth/sesion');
    auth.saveToken(token({ idUsuario: 2, nombreUsuario: 'usuario_prueba', rol: 'user' }));
    pendiente.flush({ success: true, data: { idUsuario: 1, nombreUsuario: 'admin_prueba', rol: 'admin', rolNombre: 'Administrador' } });
    expect(auth.sesion()?.nombreUsuario).toBe('usuario_prueba');

    auth.refrescarSesion();
    control.expectOne('/api/auth/sesion').flush({ success: true, data: { nombreUsuario: 'x', rol: 'root' } });
    expect(auth.sesion()?.rolNombre).toBe('Usuario');
  });

  it('R001-06 con el mismo token, una respuesta anterior que llega tarde no restaura el nombre antiguo', () => {
    iniciar();
    auth.saveToken(token(admin));
    auth.refrescarSesion();
    auth.refrescarSesion(); // p. ej., tras renombrar la propia cuenta
    const [antigua, nueva] = control.match('/api/auth/sesion');
    nueva.flush({ success: true, data: { idUsuario: 1, nombreUsuario: 'admin_renombrado', rol: 'admin', rolNombre: 'Administrador' } });
    antigua.flush({ success: true, data: { idUsuario: 1, nombreUsuario: 'admin_prueba', rol: 'admin', rolNombre: 'Administrador' } });
    expect(auth.sesion()?.nombreUsuario).toBe('admin_renombrado');
  });

  it('si el servidor falla (no 401) conserva los datos del token', () => {
    iniciar();
    auth.saveToken(token(admin));
    auth.refrescarSesion();
    control.expectOne('/api/auth/sesion').flush({}, { status: 503, statusText: 'No disponible' });
    expect(auth.sesion()?.nombreUsuario).toBe('admin_prueba');
  });

  it('sin sesión vigente no pide nada al servidor', () => {
    iniciar();
    auth.refrescarSesion();
    control.expectNone('/api/auth/sesion');
    expect(auth.sesion()).toBeNull();
  });

  it('cerrarSesionPorCambioDeClave borra el token y va al login con el aviso informativo, no con «caducada»', () => {
    iniciar();
    auth.saveToken(token(admin));
    auth.cerrarSesionPorCambioDeClave();
    expect(localStorage.getItem('authToken')).toBeNull();
    expect(auth.sesion()).toBeNull();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { sesion: 'clave-cambiada' } });
    // Un 401 tardío de la sesión anterior no añade el aviso de «sesión caducada».
    auth.expireSession(null);
    expect(router.navigate).toHaveBeenCalledTimes(1);
  });

  it('logout y expireSession vacían la sesión del indicador', () => {
    iniciar();
    auth.saveToken(token(admin));
    auth.logout();
    expect(auth.sesion()).toBeNull();
    auth.saveToken(token(admin));
    auth.expireSession(localStorage.getItem('authToken'));
    expect(auth.sesion()).toBeNull();
  });
});
