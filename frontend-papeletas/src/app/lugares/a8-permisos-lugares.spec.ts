// A8: Lugares refleja en la interfaz los permisos del backend (escritas por Claude).
// GET /api/lugares es para cualquier usuario autenticado; POST, PUT y DELETE exigen administrador.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import Swal from 'sweetalert2';
import { LugaresComponent } from './lugares.component';
import { BackendService } from '../services/backend.service';
import { AuthService } from '../services/auth.service';

const LUGAR = {
  id_lugar: 4,
  nombre_ambiente: 'CERCA',
  dependencia: 'ADMINISTRACION',
  id_centro: 1,
  centro: 'HOSPITAL DE PRUEBA NORTE',
};

class MockBackendService {
  lugares: any[] = [LUGAR];
  getCentros() {
    return of({ success: true, message: 'OK', data: [{ id_centro: 1, nombre_centro: 'HOSPITAL DE PRUEBA NORTE' }] });
  }
  getLugares() {
    return of({ success: true, message: 'OK', data: { data: this.lugares, totalItems: this.lugares.length } });
  }
  createLugar = jasmine.createSpy('createLugar').and.returnValue(of({ success: true, message: 'OK', data: {} }));
  updateLugar = jasmine.createSpy('updateLugar').and.returnValue(of({ success: true, message: 'OK', data: {} }));
  deleteLugar = jasmine.createSpy('deleteLugar').and.returnValue(of({ success: true, message: 'OK', data: {} }));
}

class MockAuthService {
  admin = true;
  isAdmin() {
    return this.admin;
  }
}

describe('A8 permisos visibles en Lugares', () => {
  let auth: MockAuthService;
  let backend: MockBackendService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LugaresComponent],
      providers: [
        { provide: BackendService, useClass: MockBackendService },
        { provide: AuthService, useClass: MockAuthService },
      ],
    }).compileComponents();
    auth = TestBed.inject(AuthService) as unknown as MockAuthService;
    backend = TestBed.inject(BackendService) as unknown as MockBackendService;
  });

  function crear(admin: boolean): ComponentFixture<LugaresComponent> {
    auth.admin = admin;
    const fixture = TestBed.createComponent(LugaresComponent);
    fixture.detectChanges();
    return fixture;
  }

  const q = (f: ComponentFixture<LugaresComponent>, sel: string) => f.nativeElement.querySelectorAll(sel).length;

  it('el administrador ve «Nuevo lugar», Editar y Eliminar, y no ve el aviso de consulta', () => {
    const f = crear(true);
    expect(q(f, '[data-accion="nuevo-lugar"]')).toBe(1);
    expect(q(f, '[data-accion="editar-lugar"]')).toBe(1);
    expect(q(f, '[data-accion="eliminar-lugar"]')).toBe(1);
    expect(q(f, 'th.es-col-acciones')).toBe(1);
    expect(q(f, '[data-permiso="solo-consulta"]')).toBe(0);
  });

  it('el usuario normal conserva la consulta pero no ve acciones prohibidas', () => {
    const f = crear(false);
    const texto: string = f.nativeElement.textContent;
    // Consulta: tabla, buscador y paginación siguen
    expect(texto).toContain('CERCA');
    expect(q(f, '#buscarLugares')).toBe(1);
    expect(q(f, '.es-paginacion')).toBe(1);
    // Sin acciones de escritura ni columna vacía de acciones
    expect(q(f, '[data-accion="nuevo-lugar"]')).toBe(0);
    expect(q(f, '[data-accion="editar-lugar"]')).toBe(0);
    expect(q(f, '[data-accion="eliminar-lugar"]')).toBe(0);
    expect(q(f, '.es-col-acciones')).toBe(0);
    expect(q(f, '[data-accion="nuevo-centro-lugar"]')).toBe(0);
    // Explica por qué no hay acciones
    expect(q(f, '[data-permiso="solo-consulta"]')).toBe(1);
  });

  it('el estado vacío no invita al usuario normal a usar «Nuevo lugar»', () => {
    backend.lugares = [];
    const f = crear(false);
    expect(f.nativeElement.textContent).not.toContain('Registre el primero');
    expect(f.nativeElement.textContent).toContain('cuando un administrador los registre');
  });

  it('las acciones no hacen nada para el usuario normal aunque se invoquen directamente', () => {
    const f = crear(false);
    const c = f.componentInstance;
    const swal = spyOn(Swal, 'fire').and.callThrough();
    c.nuevoLugar();
    c.editLugar({ ...LUGAR });
    c.deleteLugar(4, 'CERCA');
    c.abrirNuevoCentro();
    c.lugar = { nombre_ambiente: 'INTENTO', dependencia: 'INTENTO', id_centro: 1 };
    c.onSubmit();
    expect(swal).not.toHaveBeenCalled();
    expect(c.mostrarNuevoCentro).toBeFalse();
    expect(backend.createLugar).not.toHaveBeenCalled();
    expect(backend.updateLugar).not.toHaveBeenCalled();
    expect(backend.deleteLugar).not.toHaveBeenCalled();
  });

  it('un 403 del servidor se explica como falta de permisos', () => {
    const f = crear(true);
    const c = f.componentInstance;
    backend.createLugar.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { success: false, message: 'Acceso denegado. Se requiere el rol de admin.' } }))
    );
    c.lugar = { nombre_ambiente: 'NUEVO AMBIENTE', dependencia: 'NUEVA DEPENDENCIA', id_centro: 1 };
    c.onSubmit();
    expect(c.errorFormulario).toBe('No tiene permisos para modificar lugares. Solo un administrador puede hacerlo.');
  });
});
