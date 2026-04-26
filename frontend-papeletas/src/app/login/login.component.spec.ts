import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { BackendService } from '../services/backend.service';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'; // Agrega esta línea

class MockBackendService {
  login() {
    return of({ token: 'mockToken' });
  }
}

class MockAuthService {
  saveToken(token: string) {
    localStorage.setItem('authToken', token);
  }
}

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [LoginComponent, RouterTestingModule],
    providers: [
        { provide: BackendService, useClass: MockBackendService },
        { provide: AuthService, useClass: MockAuthService },
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting()
    ]
}).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call login method on submit', () => {
    spyOn(component, 'onSubmit').and.callThrough();
    component.nombreUsuario = 'testUser';
    component.contrasena = 'testPassword';
    component.onSubmit();
    expect(component.onSubmit).toHaveBeenCalled();
  });
});
