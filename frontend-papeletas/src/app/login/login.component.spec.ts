import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../services/auth.service';

class MockAuthService {
  login(username: string, _password: string) {
    return of({
      success: true,
      token: 'mockToken',
      user: { idUsuario: 1, nombreUsuario: username, rol: 'admin' },
    });
  }

  saveToken(token: string) {
    localStorage.setItem('authToken', token);
  }
}

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: MockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call AuthService.login on submit with valid credentials', () => {
    spyOn(authService, 'login').and.callThrough();
    component.nombreUsuario = 'testUser';
    component.contrasena = 'testPassword';

    component.onSubmit();

    expect(authService.login).toHaveBeenCalledWith('testUser', 'testPassword');
    expect(component.successMessage).toContain('Inicio de sesión exitoso');
    expect(component.errorMessage).toBe('');
  });

  it('should set errorMessage when login fails', () => {
    spyOn(authService, 'login').and.returnValue(
      throwError(() => ({ status: 401 }))
    );
    component.nombreUsuario = 'testUser';
    component.contrasena = 'badPassword';

    component.onSubmit();

    expect(component.errorMessage).toBe('Usuario o contraseña incorrectos.');
    expect(component.successMessage).toBe('');
  });
});
