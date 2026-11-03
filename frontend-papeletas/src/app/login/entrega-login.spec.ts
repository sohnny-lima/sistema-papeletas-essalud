import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../services/auth.service';

describe('F5/A2/A9 mensajes accesibles del login', () => {
  let login: jasmine.Spy;
  let sesion: string | null;
  beforeEach(() => {
    sesion = null; login = jasmine.createSpy('login');
    TestBed.configureTestingModule({ imports: [LoginComponent], providers: [
      { provide: AuthService, useValue: { login } },
      { provide: ActivatedRoute, useValue: { snapshot: { get queryParamMap() { return convertToParamMap({ sesion }); } } } }
    ] });
  });
  for (const [status, mensaje] of [
    [401, 'Usuario o contraseña incorrectos.'], [400, 'Complete el usuario y la contraseña.'],
    ...[0, 502, 503, 504].map(s => [s, 'No se pudo conectar con el servidor. Compruebe su conexión e inténtelo nuevamente.']),
    [500, 'No se pudo iniciar sesión. Inténtelo más tarde.'],
    // U3 (bloque U): una cuenta desactivada recibe 403 con la clave correcta.
    [403, 'La cuenta está desactivada. Contacte con un administrador.']
  ] as [number, string][]) {
    it(`status ${status}: mensaje específico asociado al formulario sin alert`, () => {
      login.and.returnValue(throwError(() => ({ status, error: { message: 'interno' } })));
      const f = TestBed.createComponent(LoginComponent); const c = f.componentInstance;
      const alerta = spyOn(window, 'alert'); c.nombreUsuario = 'usuario'; c.contrasena = 'clave';
      c.onSubmit(); f.detectChanges();
      expect(c.errorMessage).toBe(mensaje);
      expect(f.nativeElement.querySelector('form').getAttribute('aria-describedby')).toBe('login-error');
      expect(f.nativeElement.querySelector('#login-error[role="alert"]').textContent).toContain(mensaje);
      expect(alerta).not.toHaveBeenCalled();
    });
  }
  it('los datos incompletos no llaman a la API', () => {
    const c = TestBed.createComponent(LoginComponent).componentInstance;
    c.nombreUsuario = ' '; c.contrasena = 'clave'; c.onSubmit();
    expect(c.errorMessage).toBe('Complete el usuario y la contraseña.'); expect(login).not.toHaveBeenCalled();
  });
  it('muestra el motivo de sesión caducada al llegar del guard o del interceptor', () => {
    sesion = 'caducada';
    const f = TestBed.createComponent(LoginComponent); f.detectChanges();
    expect(f.nativeElement.querySelector('#login-error').textContent).toContain('Su sesión ha caducado. Vuelva a iniciar sesión.');
  });
  it('U3 envía el nombre sin espacios en los extremos (no cuenta como intento fallido)', () => {
    login.and.returnValue(throwError(() => ({ status: 401 })));
    const c = TestBed.createComponent(LoginComponent).componentInstance;
    c.nombreUsuario = '  admin_prueba '; c.contrasena = 'clave'; c.onSubmit();
    expect(login).toHaveBeenCalledOnceWith('admin_prueba', 'clave');
  });
  it('U3 tras cambiar la propia contraseña muestra un aviso informativo (no un error)', () => {
    sesion = 'clave-cambiada';
    const f = TestBed.createComponent(LoginComponent); f.detectChanges();
    expect(f.nativeElement.querySelector('#login-error')).toBeNull();
    const aviso = f.nativeElement.querySelector('#login-aviso[role="status"]');
    expect(aviso.textContent).toContain('Contraseña actualizada. Inicie sesión con la nueva.');
  });
});
