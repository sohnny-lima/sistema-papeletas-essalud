import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpErrorResponse, HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { AuthInterceptor } from './auth.interceptor';
import { AuthGuard } from '../auth.guard';
import { API_BASE_URL, esApiPropia } from './api-config';

describe('A9 sesión caducada: interceptor, servicio y guard', () => {
  let auth: AuthService, http: HttpClient, control: HttpTestingController, guard: AuthGuard;
  let router: jasmine.SpyObj<Router>;
  const token = (exp: number) => `e30.${btoa(JSON.stringify({ exp, rol: 'user' }))}.firma`;
  beforeEach(() => {
    localStorage.removeItem('authToken');
    router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withXhr(), withInterceptorsFromDi()), provideHttpClientTesting(),
      { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
      { provide: Router, useValue: router }, AuthGuard
    ] });
    auth = TestBed.inject(AuthService); http = TestBed.inject(HttpClient);
    control = TestBed.inject(HttpTestingController); guard = TestBed.inject(AuthGuard);
  });
  afterEach(() => { control.verify(); localStorage.removeItem('authToken'); });
  const fallar = (url: string, status = 401) => control.expectOne(url).flush({}, { status, statusText: 'Error' });
  const error = (_err: HttpErrorResponse) => {};
  it('A9 g008 no entrega el 401 autenticado a las alertas de las pantallas y completa la petición', () => {
    auth.saveToken(token(Date.now() / 1000 + 3600));
    const alerta = jasmine.createSpy('alerta de pantalla');
    const completada = jasmine.createSpy('completada');
    http.get('/api/equipos').subscribe({ error: alerta, complete: completada });
    fallar('/api/equipos');
    expect(alerta).not.toHaveBeenCalled();
    expect(completada).toHaveBeenCalled();
    expect(auth.getToken()).toBeNull();
  });
  it('un 401 autenticado elimina el token y navega una vez, aunque fallen peticiones simultáneas', () => {
    const t = token(Date.now() / 1000 + 3600); auth.saveToken(t);
    http.get('/api/equipos').subscribe({ error }); http.get('/api/papeletas').subscribe({ error });
    const req = control.expectOne('/api/equipos');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${t}`);
    req.flush({}, { status: 401, statusText: 'Unauthorized' }); fallar('/api/papeletas');
    expect(auth.getToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { sesion: 'caducada' } });
  });
  it('el 401 del login se propaga sin cerrar la sesión ni añadir token', () => {
    auth.saveToken(token(Date.now() / 1000 + 3600));
    auth.login('usuario', 'clave').subscribe({ error });
    const req = control.expectOne('/api/auth/login');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(router.navigate).not.toHaveBeenCalled(); expect(auth.getToken()).not.toBeNull();
  });
  it('un 403 no caduca la sesión', () => {
    auth.saveToken(token(Date.now() / 1000 + 3600));
    http.delete('/api/equipos/1').subscribe({ error }); fallar('/api/equipos/1', 403);
    expect(router.navigate).not.toHaveBeenCalled(); expect(auth.getToken()).not.toBeNull();
  });
  it('g010 #1 un 401 propio sin token caduca una sola vez y completa sin alertas', () => {
    const alerta=jasmine.createSpy('alerta'), completa=jasmine.createSpy('completa');
    for(const url of ['/api/equipos','/api/papeletas']) http.get(url).subscribe({error:alerta,complete:completa});
    fallar('/api/equipos');fallar('/api/papeletas');
    expect(alerta).not.toHaveBeenCalled();expect(completa).toHaveBeenCalledTimes(2);
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login'], {queryParams:{sesion:'caducada'}});
  });
  // SP (01/11/2026): antes llevaba a «caducada»; ahora la respuesta de la sesión anterior se descarta y la pestaña
  // va al login con el aviso de otra pestaña, aunque no le haya llegado el evento `storage`.
  it('g010 #1 un 401 propio lleva al login si otra pestaña eliminó el token durante la petición', () => {
    const abrir = spyOn<any>(auth, 'abrirDocumento'), alerta = jasmine.createSpy('alerta');
    auth.saveToken(token(2000000000));http.get('/api/equipos').subscribe({error: alerta});
    localStorage.removeItem('authToken');fallar('/api/equipos');
    expect(abrir).toHaveBeenCalledOnceWith('/login', { sesion: 'otra-pestana' });
    expect(alerta).not.toHaveBeenCalled(); expect(router.navigate).not.toHaveBeenCalled();
  });
  it('g010 #1 un 401 iniciado sin token no cierra una sesión nueva', () => {
    http.get('/api/equipos').subscribe({error});const nuevo=token(2000000000);auth.saveToken(nuevo);
    fallar('/api/equipos');expect(auth.getToken()).toBe(nuevo);expect(router.navigate).not.toHaveBeenCalled();
  });
  for(const url of ['https://ajeno.invalid/api/equipos','http://localhost:3001/api/equipos','/api-ajena/equipos','http://localhost:3000/assets/logo.png','//ajeno.invalid/api/equipos']) {
    it(`g010 #1 no envía Bearer ni caduca sesión por 401 ajeno: ${url}`, () => {
      const vigente=token(2000000000);auth.saveToken(vigente);const alerta=jasmine.createSpy('error');
      http.get(url).subscribe({error:alerta});const req=control.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBeFalse();req.flush({}, {status:401,statusText:'Unauthorized'});
      expect(alerta).toHaveBeenCalled();expect(auth.getToken()).toBe(vigente);expect(router.navigate).not.toHaveBeenCalled();
    });
  }
  it('g010 #1 envía Bearer a la API absoluta configurada y excluye el login relativo', () => {
    const vigente=token(2000000000);auth.saveToken(vigente);
    http.get('/api/equipos').subscribe();
    const req=control.expectOne('/api/equipos');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${vigente}`);req.flush({});
    http.post('/api/auth/login',{}).subscribe({error});const login=control.expectOne('/api/auth/login');
    expect(login.request.headers.has('Authorization')).toBeFalse();login.flush({}, {status:401,statusText:'Unauthorized'});
    expect(router.navigate).not.toHaveBeenCalled();expect(auth.getToken()).toBe(vigente);
  });
  it('no cierra una sesión nueva por un 401 tardío de la anterior', () => {
    auth.saveToken(token(2000000000));
    http.get('/api/antigua').subscribe({ error });
    const nueva = token(2000000010); auth.saveToken(nueva); fallar('/api/antigua');
    expect(auth.getToken()).toBe(nueva); expect(router.navigate).not.toHaveBeenCalled();
  });
  it('el guard rechaza el token caducado y conserva el motivo al navegar al login', () => {
    auth.saveToken(token(1)); expect(guard.canActivate()).toBeFalse();
    expect(auth.getToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { sesion: 'caducada' } });
  });
  it('el guard de rutas hijas detecta el token inválido al cambiar de pantalla', () => {
    auth.saveToken('invalido'); expect(guard.canActivateChild()).toBeFalse();
    expect(auth.getToken()).toBeNull();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { sesion: 'caducada' } });
  });
  it('permite token vigente y envía al login sin aviso si no existe token', () => {
    auth.saveToken(token(Date.now() / 1000 + 3600)); expect(guard.canActivateChild()).toBeTrue();
    auth.logout(); router.navigate.calls.reset(); expect(guard.canActivate()).toBeFalse();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login']);
  });
  it('un login correcto guarda el token y navega una sola vez', () => {
    const t = token(Date.now() / 1000 + 3600);
    auth.login('usuario', 'clave').subscribe();
    control.expectOne('/api/auth/login').flush({ token: t });
    expect(auth.getToken()).toBe(t); expect(router.navigate).toHaveBeenCalledOnceWith(['/menu-principal']);
  });
});

describe('g012 #6 base relativa configurable', () => {
  it('acepta la ruta exacta y sus recursos, sin aceptar vecinos ni otro origen', () => {
    const origen = 'https://papeletas.invalid';
    for (const base of ['/api', '/subruta/api']) {
      for (const url of [base, base + '/', base + '/equipos', origen + base]) expect(esApiPropia(url, base, origen)).toBeTrue();
      for (const url of [base + '-ajena', base + '/../privado', '//ajeno.invalid' + base, 'https://ajeno.invalid' + base]) expect(esApiPropia(url, base, origen)).toBeFalse();
    }
  });
});

describe('g010 #1 base de API relativa preparada para c005', () => {
  it('reconoce origen y prefijo completos, sin aceptar otro origen ni prefijos similares', () => {
    for(const base of ['https://api-configurada.invalid/api','/api']) {
      const origen='https://papeletas.invalid';const apiOrigen=base.startsWith('/')?origen:'https://api-configurada.invalid';
      expect(esApiPropia('/api/equipos',base,origen)).toBe(base === '/api');
      expect(esApiPropia(apiOrigen+'/api/equipos',base,origen)).toBeTrue();
      for(const url of [apiOrigen+'/api-ajena/equipos',apiOrigen+'/api/../privado','/api/../privado','https://ajeno.invalid/api/equipos','//ajeno.invalid/api/equipos','api/equipos']) {
        expect(esApiPropia(url,base,origen)).toBeFalse();
      }
    }
  });
  it('el interceptor usa la base relativa con el valor predeterminado F1 del despliegue', () => {
    const auth=jasmine.createSpyObj('AuthService',['getToken','expireSession','puedeEnviar']);auth.getToken.and.returnValue('ficticio');auth.puedeEnviar.and.returnValue(true);
    TestBed.configureTestingModule({providers:[
      provideHttpClient(withXhr(),withInterceptorsFromDi()),provideHttpClientTesting(),
      {provide:HTTP_INTERCEPTORS,useClass:AuthInterceptor,multi:true},
      {provide:AuthService,useValue:auth},{provide:API_BASE_URL,useValue:'/api'}
    ]});
    const http=TestBed.inject(HttpClient), control=TestBed.inject(HttpTestingController);
    const url=window.location.origin+'/api/equipos';http.get(url).subscribe();
    const req=control.expectOne(url);expect(req.request.headers.get('Authorization')).toBe('Bearer ficticio');
    req.flush({});control.verify();
  });
});
