// Regresión de los hallazgos de Gemini g006 sobre Lugares (escritas por Claude).
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { LugaresComponent } from './lugares.component';
import { BackendService } from '../services/backend.service';
import { AuthService } from '../services/auth.service';

class MockBackendService {
  lugares: any[] = [];
  getCentros() {
    return of({ success: true, message: 'OK', data: [{ id_centro: 1, nombre_centro: 'HOSPITAL A' }] });
  }
  getLugares() {
    return of({ success: true, message: 'OK', data: { data: this.lugares, totalItems: this.lugares.length } });
  }
}

class MockAuthService {
  isAdmin() {
    return true;
  }
}

describe('Revisión de Lugares (Gemini g006)', () => {
  let fixture: ComponentFixture<LugaresComponent>;
  let component: LugaresComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LugaresComponent],
      providers: [
        { provide: BackendService, useClass: MockBackendService },
        { provide: AuthService, useClass: MockAuthService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LugaresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function intentarCerrar(): Event {
    const evento = new Event('hide.bs.modal', { cancelable: true });
    fixture.nativeElement.querySelector('#lugarModal').dispatchEvent(evento);
    return evento;
  }

  it('impide cerrar el modal mientras se guarda el lugar', () => {
    component.guardando = true;
    expect(intentarCerrar().defaultPrevented).toBeTrue();
    component.guardando = false;
    expect(intentarCerrar().defaultPrevented).toBeFalse();
  });

  it('impide cerrar el modal mientras se guarda un centro nuevo desde el formulario', () => {
    component.abrirNuevoCentro();
    fixture.detectChanges();
    component.formularioCentro!.guardando = true;
    expect(intentarCerrar().defaultPrevented).toBeTrue();
  });

  it('Escape en los botones del panel de nuevo centro cierra solo el panel', () => {
    component.abrirNuevoCentro();
    fixture.detectChanges();
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector('[data-accion="guardar-centro"]');
    const evento = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    boton.dispatchEvent(evento);
    fixture.detectChanges();
    expect(component.mostrarNuevoCentro).toBeFalse();
    expect(evento.defaultPrevented).toBeTrue();
  });

  it('el estado vacío depende del filtro aplicado, no del texto que se está escribiendo', () => {
    component.searchText = 'XYZ';
    component.applyFilter();
    fixture.detectChanges();
    expect(component.hayFiltro).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Ningún lugar coincide con «XYZ»');

    // Borra el texto sin volver a buscar: sigue mostrándose el filtro aplicado y cómo limpiarlo
    component.searchText = '';
    fixture.detectChanges();
    expect(component.hayFiltro).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Limpiar búsqueda');
  });
});
