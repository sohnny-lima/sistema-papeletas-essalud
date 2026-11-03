import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminGuard } from './admin.guard';
import { AuthService } from './services/auth.service';

function crearJwtFicticio(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.firma_ficticia`;
}

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let authServiceSpy: jasmine.SpyObj<AuthService>;
  let routerSpy: jasmine.SpyObj<Router>;

  beforeEach(() => {
    const authSpy = jasmine.createSpyObj('AuthService', ['isAdmin', 'getRol']);
    const router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        AdminGuard,
        { provide: AuthService, useValue: authSpy },
        { provide: Router, useValue: router },
      ],
    });

    guard = TestBed.inject(AdminGuard);
    authServiceSpy = TestBed.inject(AuthService) as jasmine.SpyObj<AuthService>;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
  });

  it('permite activar la ruta cuando el usuario es administrador', () => {
    authServiceSpy.isAdmin.and.returnValue(true);
    expect(guard.canActivate()).toBeTrue();
    expect(routerSpy.navigate).not.toHaveBeenCalled();
  });

  it('redirige a /menu-principal/dashboard y devuelve false cuando el usuario no es admin', () => {
    authServiceSpy.isAdmin.and.returnValue(false);
    expect(guard.canActivate()).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/menu-principal/dashboard']);
  });
});

describe('AuthService (getRol e isAdmin)', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('devuelve null y false cuando no hay token o el token es inválido', () => {
    expect(service.getRol()).toBeNull();
    expect(service.isAdmin()).toBeFalse();

    service.saveToken('token-corrupto-invalido');
    expect(service.getRol()).toBeNull();
    expect(service.isAdmin()).toBeFalse();
  });

  it('identifica correctamente el rol admin y user desde el JWT', () => {
    const expFuturo = Math.floor(Date.now() / 1000) + 3600;

    service.saveToken(crearJwtFicticio({ id: 1, rol: 'admin', exp: expFuturo }));
    expect(service.getRol()).toBe('admin');
    expect(service.isAdmin()).toBeTrue();

    service.saveToken(crearJwtFicticio({ id: 2, rol: 'user', exp: expFuturo }));
    expect(service.getRol()).toBe('user');
    expect(service.isAdmin()).toBeFalse();
  });
});
