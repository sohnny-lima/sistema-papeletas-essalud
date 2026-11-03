import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TrabajadoresComponent } from './trabajadores.component';
import { BackendService } from '../services/backend.service';
import { AuthService } from '../services/auth.service';

describe('TrabajadoresComponent', () => {
  let component: TrabajadoresComponent;
  let fixture: ComponentFixture<TrabajadoresComponent>;
  let backendService: jasmine.SpyObj<BackendService>;
  let authServiceStub: { isAdmin: jasmine.Spy };

  const mockTrabajadores = [
    {
      id_trabajador: 1,
      nombres: 'JUAN',
      apellido_paterno: 'PEREZ',
      apellido_materno: 'LOPEZ',
      numero_identificacion: '12345678',
    },
  ];

  beforeEach(async () => {
    const backendSpy = jasmine.createSpyObj('BackendService', ['getTrabajadores']);
    authServiceStub = { isAdmin: jasmine.createSpy('isAdmin').and.returnValue(true) };
    backendSpy.getTrabajadores.and.returnValue(
      of({
        success: true,
        message: 'Trabajadores obtenidos exitosamente',
        data: {
          data: mockTrabajadores,
          totalItems: 1,
          totalPages: 1,
          currentPage: 1,
        },
      })
    );

    await TestBed.configureTestingModule({
      imports: [TrabajadoresComponent],
      providers: [
        { provide: AuthService, useValue: authServiceStub },
        { provide: BackendService, useValue: backendSpy },
      ],
    }).compileComponents();

    backendService = TestBed.inject(BackendService) as jasmine.SpyObj<BackendService>;
    fixture = TestBed.createComponent(TrabajadoresComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch trabajadores on init', () => {
    expect(backendService.getTrabajadores).toHaveBeenCalled();
    expect(component.trabajadores).toEqual(mockTrabajadores);
    expect(component.totalItems).toBe(1);
  });

  it('should handle error if getTrabajadores fails', () => {
    spyOn(component, 'showErrorAlert');
    backendService.getTrabajadores.and.returnValue(
      throwError(() => new Error('Error'))
    );
    component.trabajadores = [];

    component.getTrabajadores();

    expect(component.isLoading).toBeFalse();
    expect(component.showErrorAlert).toHaveBeenCalled();
    expect(component.trabajadores).toEqual([]);
  });

  describe('LV Trabajadores listado unificado', () => {
    it('renderiza la tabla con las clases institucionales y es-table--apilada', () => {
      const tableWrap = fixture.nativeElement.querySelector('.es-table-wrap');
      expect(tableWrap).toBeTruthy();

      const table = tableWrap.querySelector('table');
      expect(table).toBeTruthy();
      expect(table.classList.contains('es-table')).toBeTrue();
      expect(table.classList.contains('es-table--compacta')).toBeTrue();
      expect(table.classList.contains('es-table--apilada')).toBeTrue();

      const caption = table.querySelector('caption.visually-hidden');
      expect(caption).toBeTruthy();
      expect(caption.textContent).toContain('Trabajadores registrados');
    });

    it('asigna data-label en todas las celdas de datos de una fila para vista móvil', () => {
      const row = fixture.nativeElement.querySelector('table.es-table tbody tr');
      expect(row).toBeTruthy();

      const cells = row.querySelectorAll('td');
      expect(cells.length).toBe(6);

      expect(cells[0].getAttribute('data-label')).toBe('ID');
      expect(cells[0].classList.contains('es-col-id')).toBeTrue();

      expect(cells[1].getAttribute('data-label')).toBe('Nombres');
      expect(cells[1].classList.contains('es-celda-principal')).toBeTrue();
      expect(cells[1].textContent.trim()).toBe('JUAN');

      expect(cells[2].getAttribute('data-label')).toBe('Apellido paterno');
      expect(cells[2].textContent.trim()).toBe('PEREZ');

      expect(cells[3].getAttribute('data-label')).toBe('Apellido materno');
      expect(cells[3].textContent.trim()).toBe('LOPEZ');

      expect(cells[4].getAttribute('data-label')).toBe('DNI / Identificación');
      expect(cells[4].textContent.trim()).toContain('12345678');
    });

    it('las acciones tienen aria-label descriptivo identificando al registro y título', () => {
      const btnEditar = fixture.nativeElement.querySelector('button[data-accion="editar-trabajador"]');
      expect(btnEditar).toBeTruthy();
      expect(btnEditar.getAttribute('aria-label')).toBe('Editar trabajador JUAN PEREZ');
      expect(btnEditar.getAttribute('title')).toBe('Editar');

      const btnEliminar = fixture.nativeElement.querySelector('button[data-accion="eliminar-trabajador"]');
      expect(btnEliminar).toBeTruthy();
      expect(btnEliminar.getAttribute('aria-label')).toBe('Eliminar trabajador JUAN PEREZ');
      expect(btnEliminar.getAttribute('title')).toBe('Eliminar');
      expect(btnEliminar.classList.contains('es-icon-btn--peligro')).toBeTrue();
    });

    it('respeta la matriz de roles: admin ve Eliminar y usuario normal no lo ve', () => {
      expect(fixture.nativeElement.querySelector('button[data-accion="eliminar-trabajador"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('button[data-accion="editar-trabajador"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('button[data-accion="agregar-trabajador"]')).not.toBeNull();

      authServiceStub.isAdmin.and.returnValue(false);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('button[data-accion="eliminar-trabajador"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('button[data-accion="editar-trabajador"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('button[data-accion="agregar-trabajador"]')).not.toBeNull();
    });

    it('muestra estado vacío con botón cuando no hay trabajadores y no se ha buscado', () => {
      component.trabajadores = [];
      component.searchText = '';
      component.selectedCategory = '';
      fixture.detectChanges();

      const estado = fixture.nativeElement.querySelector('.es-state');
      expect(estado).toBeTruthy();
      expect(estado.textContent).toContain('Aún no hay trabajadores registrados');
      expect(estado.querySelector('button')).not.toBeNull();
    });

    it('muestra estado sin coincidencias con botón Limpiar búsqueda cuando hay filtro aplicado', () => {
      component.trabajadores = [];
      component.searchText = 'NOEXISTE';
      fixture.detectChanges();

      const estado = fixture.nativeElement.querySelector('.es-state');
      expect(estado).toBeTruthy();
      expect(estado.textContent).toContain('Ningún trabajador coincide');
      expect(estado.textContent).toContain('NOEXISTE');

      const btnLimpiar = estado.querySelector('button');
      expect(btnLimpiar).toBeTruthy();
      expect(btnLimpiar.textContent.trim()).toBe('Limpiar búsqueda');
    });

    it('renderiza paginación con resumen y botones accesibles cuando hay registros', () => {
      component.totalItems = 15;
      component.currentPage = 1;
      component.totalPages = 2;
      component.currentStartIndex = 1;
      component.currentEndIndex = 10;
      fixture.detectChanges();

      const nav = fixture.nativeElement.querySelector('nav.es-paginacion');
      expect(nav).toBeTruthy();
      expect(nav.getAttribute('aria-label')).toBe('Paginación de trabajadores');

      const resumen = nav.querySelector('.es-paginacion__resumen');
      expect(resumen.textContent).toContain('Mostrando 1–10 de 15 trabajadores');
    });
  });
});
