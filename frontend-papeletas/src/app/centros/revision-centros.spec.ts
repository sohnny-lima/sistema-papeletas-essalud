// Regresión de los hallazgos de /code-review (escritas por Claude).
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { CentrosComponent } from './centros.component';
import { ordenarCentros } from './centro-nombre';
import { BackendService } from '../services/backend.service';
import { AuthService } from '../services/auth.service';

class MockBackendService {
  getCentros() {
    return of({ success: true, message: 'OK', data: [{ id_centro: 1, nombre_centro: 'HOSPITAL A', total_lugares: 0 }] });
  }
}

function jwt(payload: Record<string, unknown>): string {
  return `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify(payload))}.firma`;
}

describe('Revisión de centros (code-review)', () => {
  describe('CentrosComponent: cierre del modal durante el guardado', () => {
    let fixture: ComponentFixture<CentrosComponent>;
    let component: CentrosComponent;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [CentrosComponent],
        providers: [{ provide: BackendService, useClass: MockBackendService }],
      }).compileComponents();
      fixture = TestBed.createComponent(CentrosComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      component.formularioAbierto = true;
      fixture.detectChanges();
    });

    function intentarCerrar(): Event {
      const evento = new Event('hide.bs.modal', { cancelable: true });
      fixture.nativeElement.querySelector('#centroModal').dispatchEvent(evento);
      return evento;
    }

    it('impide cerrar el modal mientras se guarda', () => {
      component.formulario!.guardando = true;
      expect(intentarCerrar().defaultPrevented).toBeTrue();
    });

    it('permite cerrarlo cuando no hay guardado en curso', () => {
      component.formulario!.guardando = false;
      expect(intentarCerrar().defaultPrevented).toBeFalse();
    });
  });

  describe('AuthService: una sola regla de validez del token', () => {
    let service: AuthService;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [AuthService, provideHttpClient(withXhr()), provideHttpClientTesting()] });
      service = TestBed.inject(AuthService);
    });

    afterEach(() => localStorage.clear());

    it('un token sin exp no autentica ni da rol de administrador', () => {
      service.saveToken(jwt({ rol: 'admin' }));
      expect(service.isAuthenticated()).toBeFalse();
      expect(service.isAdmin()).toBeFalse();
    });

    it('un token caducado no da rol', () => {
      service.saveToken(jwt({ rol: 'admin', exp: Math.floor(Date.now() / 1000) - 60 }));
      expect(service.getRol()).toBeNull();
    });
  });

  it('ordenarCentros tolera un nombre nulo sin lanzar', () => {
    const lista = [
      { id_centro: 2, nombre_centro: 'B' },
      { id_centro: 1, nombre_centro: null as unknown as string },
    ];
    expect(() => ordenarCentros(lista)).not.toThrow();
  });
});
