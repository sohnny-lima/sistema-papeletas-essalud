import { AuthService } from '../services/auth.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EquiposComponent } from './equipos.component';
import { BackendService } from '../services/backend.service';
import { of, throwError } from 'rxjs';

class MockBackendService {
  getEquipos() {
    return of({
      success: true,
      message: 'Equipos obtenidos exitosamente',
      data: {
        data: [
          {
            id_equipo: 1,
            cod_patrimonial: '74080001',
            descripcion: 'CPU DE PRUEBA',
            marca: 'MARCA A',
            serie: 'SERIE-A1',
            modelo: 'MODELO-A',
          },
          {
            id_equipo: 2,
            cod_patrimonial: '74080002',
            descripcion: 'MONITOR DE PRUEBA',
            marca: 'MARCA B',
            serie: 'SERIE-B1',
            modelo: 'MODELO-B',
          },
        ],
        totalItems: 2,
        totalPages: 1,
        currentPage: 1,
      },
    });
  }
}

class MockAuthService {
  admin = true;
  isAdmin(): boolean {
    return this.admin;
  }
}

describe('EquiposComponent', () => {
  let component: EquiposComponent;
  let fixture: ComponentFixture<EquiposComponent>;
  let backendService: BackendService;
  let authService: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquiposComponent],
      providers: [
        { provide: AuthService, useClass: MockAuthService },
        { provide: BackendService, useClass: MockBackendService },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EquiposComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    authService = TestBed.inject(AuthService) as unknown as MockAuthService;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load equipment on init', () => {
    spyOn(backendService, 'getEquipos').and.callThrough();
    component.ngOnInit();
    expect(backendService.getEquipos).toHaveBeenCalled();
    expect(component.equipos.length).toBe(2);
    expect(component.totalItems).toBe(2);
  });

  it('should handle error when loading equipment', () => {
    spyOn(component, 'showErrorAlert');
    spyOn(backendService, 'getEquipos').and.returnValue(
      throwError(() => new Error('Error'))
    );
    component.equipos = [];
    component.getEquipos();
    expect(component.isLoading).toBeFalse();
    expect(component.showErrorAlert).toHaveBeenCalledWith(
      'Error de conexión con el servidor'
    );
    expect(component.equipos.length).toBe(0);
  });

  describe('LV Equipos listado unificado', () => {
    it('renderiza la tabla con clase es-table--apilada y contenedor es-table-wrap', () => {
      const wrap = fixture.nativeElement.querySelector('div.es-table-wrap');
      const table = fixture.nativeElement.querySelector('table.es-table.es-table--compacta.es-table--apilada');
      expect(wrap).not.toBeNull();
      expect(table).not.toBeNull();
    });

    it('asigna data-label en todas las celdas de datos de cada fila', () => {
      const primeraFila = fixture.nativeElement.querySelector('tbody tr');
      expect(primeraFila).not.toBeNull();

      const celdas = primeraFila.querySelectorAll('td');
      // Esperamos 7 celdas: 6 de datos y 1 de acciones
      expect(celdas.length).toBe(7);

      const celdaId = celdas[0];
      const celdaCod = celdas[1];
      const celdaDesc = celdas[2];
      const celdaMarca = celdas[3];
      const celdaSerie = celdas[4];
      const celdaModelo = celdas[5];

      expect(celdaId.getAttribute('data-label')).toBe('ID');
      expect(celdaCod.getAttribute('data-label')).toBe('Código patrimonial');
      expect(celdaDesc.getAttribute('data-label')).toBe('Descripción');
      expect(celdaMarca.getAttribute('data-label')).toBe('Marca');
      expect(celdaSerie.getAttribute('data-label')).toBe('Serie');
      expect(celdaModelo.getAttribute('data-label')).toBe('Modelo');

      // Columna principal y estilos de columna
      expect(celdaDesc.classList.contains('es-celda-principal')).toBeTrue();
      expect(celdaId.classList.contains('es-col-id')).toBeTrue();
    });

    it('configura las acciones con aria-label descriptivo y título', () => {
      const btnEditar = fixture.nativeElement.querySelector(
        'button[title="Editar"][aria-label="Editar equipo CPU DE PRUEBA"]'
      );
      expect(btnEditar).not.toBeNull();
      expect(btnEditar.classList.contains('es-icon-btn')).toBeTrue();

      const btnEliminar = fixture.nativeElement.querySelector(
        'button[title="Eliminar"][aria-label="Eliminar equipo CPU DE PRUEBA"]'
      );
      expect(btnEliminar).not.toBeNull();
      expect(btnEliminar.classList.contains('es-icon-btn--peligro')).toBeTrue();
    });

    it('respeta la visibilidad por rol: admin ve eliminar, usuario regular solo editar', () => {
      // Como admin (inicial)
      let btnEliminar = fixture.nativeElement.querySelector('button[title="Eliminar"]');
      let btnEditar = fixture.nativeElement.querySelector('button[title="Editar"]');
      expect(btnEliminar).not.toBeNull();
      expect(btnEditar).not.toBeNull();

      // Cambiar a usuario no admin
      authService.admin = false;
      fixture.detectChanges();

      btnEliminar = fixture.nativeElement.querySelector('button[title="Eliminar"]');
      btnEditar = fixture.nativeElement.querySelector('button[title="Editar"]');
      expect(btnEliminar).toBeNull();
      expect(btnEditar).not.toBeNull();
    });
  });
});
