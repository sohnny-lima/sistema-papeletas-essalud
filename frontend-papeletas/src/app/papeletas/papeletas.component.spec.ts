import { AuthService } from '../services/auth.service';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PapeletasComponent } from './papeletas.component';
import { BackendService } from '../services/backend.service';

const MOCK_PAPELETA_ROW = {
  id_papeleta: 1,
  numero_papeleta: 'PA-0001',
  fecha: '2026-10-27',
  id_tipo_formulario: 3,
  tipo_formulario_nombre: 'DESPLAZAMIENTO',
  id_trabajador_origen: 1,
  trabajador_origen_nombre: 'ANA PRUEBA UNO',
  id_trabajador_destino: 2,
  trabajador_destino_nombre: 'LUIS PRUEBA DOS',
  id_lugar_origen: 1,
  lugar_origen_nombre: 'OFICINA 101 (ADMINISTRACION)',
  id_lugar_destino: 2,
  lugar_destino_nombre: 'ALMACEN CENTRAL (LOGISTICA)',
  equipos_patrimoniales: [
    {
      id_equipo: 1,
      cod_patrimonial: '74080001',
      descripcion: 'CPU DE PRUEBA',
      marca: 'MARCA A',
      modelo: 'MODELO-A',
      serie: 'SERIE-A1',
      estado: 'OPERATIVO',
      displayName: '74080001 - CPU DE PRUEBA - MARCA A - SERIE-A1',
    },
  ],
};

class MockBackendService {
  getPapeletas() {
    return of({
      success: true,
      message: 'Papeletas obtenidas exitosamente',
      data: {
        data: [MOCK_PAPELETA_ROW],
        totalItems: 1,
        totalPages: 1,
        currentPage: 1,
      },
    });
  }

  getTiposFormulario() {
    return of({
      success: true,
      data: [
        { id_tipo_formulario: 1, nombre: 'TOMA DE INVENTARIO' },
        { id_tipo_formulario: 3, nombre: 'DESPLAZAMIENTO' },
      ],
    });
  }

  getUltimoNumeroPapeleta() {
    return of({
      success: true,
      data: { last_number: 1 },
    });
  }

  createPapeleta(_body: any) {
    return of({
      success: true,
      message: 'Papeleta creada exitosamente',
      data: { id_papeleta: 2, numero_papeleta: 'PA-0002' },
    });
  }

  updatePapeleta(_id: number, _body: any) {
    return of({
      success: true,
      message: 'Papeleta actualizada exitosamente',
      data: { id_papeleta: 1, numero_papeleta: 'PA-0001' },
    });
  }
}

describe('PapeletasComponent', () => {
  let component: PapeletasComponent;
  let fixture: ComponentFixture<PapeletasComponent>;
  let backendService: BackendService;
  let esAdmin = true;

  beforeEach(async () => {
    esAdmin = true;
    (window as any).bootstrap = (window as any).bootstrap || {
      Modal: class {
        show() {}
        hide() {}
        static getInstance() {
          return { hide() {} };
        }
      },
    };

    await TestBed.configureTestingModule({
      imports: [PapeletasComponent],
      providers: [
        { provide: AuthService, useValue: { isAdmin: () => esAdmin } },
        { provide: BackendService, useClass: MockBackendService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PapeletasComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load papeletas and tiposFormulario on init', () => {
    spyOn(backendService, 'getPapeletas').and.callThrough();
    spyOn(backendService, 'getTiposFormulario').and.callThrough();

    component.ngOnInit();

    expect(backendService.getPapeletas).toHaveBeenCalled();
    expect(backendService.getTiposFormulario).toHaveBeenCalled();
    expect(component.papeletas.length).toBe(1);
    expect(component.tiposFormulario.length).toBe(2);
  });

  it('should handle error when loading papeletas', () => {
    spyOn(component, 'showErrorAlert');
    spyOn(backendService, 'getPapeletas').and.returnValue(
      throwError(() => new Error('Error'))
    );
    component.papeletas = [];

    component.getPapeletas();

    expect(component.isLoading).toBeFalse();
    expect(component.showErrorAlert).toHaveBeenCalledWith(
      'Error de conexión con el servidor.'
    );
    expect(component.papeletas).toEqual([]);
  });

  it('(a) editPapeleta con una fila que trae los IDs y fecha YYYY-MM-DD deja el formulario válido y onSubmit llama a updatePapeleta', () => {
    spyOn(backendService, 'updatePapeleta').and.callThrough();
    spyOn(component, 'showSuccessAlert');
    spyOn(component, 'showErrorAlert');

    component.editPapeleta({ ...MOCK_PAPELETA_ROW });
    component.onSubmit();

    expect(component.showErrorAlert).not.toHaveBeenCalled();
    expect(backendService.updatePapeleta).toHaveBeenCalledWith(
      1,
      jasmine.objectContaining({
        id_papeleta: 1,
        fecha: '2026-10-27',
        id_tipo_formulario: 3,
        id_trabajador_origen: 1,
        id_trabajador_destino: 2,
        id_lugar_origen: 1,
        id_lugar_destino: 2,
        equipmentIds: [1],
      })
    );
  });

  it('(b) tras crear una papeleta, el mensaje de éxito incluye el numero_papeleta devuelto por el backend', () => {
    spyOn(backendService, 'createPapeleta').and.returnValue(
      of({
        success: true,
        message: 'Papeleta creada exitosamente',
        data: { id_papeleta: 2, numero_papeleta: 'PA-0002' },
      })
    );
    spyOn(component, 'showSuccessAlert');

    component.papeleta = {
      numero_papeleta: 'PA-0002',
      fecha: '2026-10-27',
      id_tipo_formulario: 3,
      id_trabajador_origen: 1,
      id_trabajador_destino: 2,
      id_lugar_origen: 1,
      id_lugar_destino: 2,
      equipos_patrimoniales: [...MOCK_PAPELETA_ROW.equipos_patrimoniales],
    };

    component.onSubmit();

    expect(backendService.createPapeleta).toHaveBeenCalled();
    expect(component.showSuccessAlert).toHaveBeenCalledWith(
      jasmine.stringMatching(/PA-0002/)
    );
  });

  it('(c) la fecha por defecto de una papeleta nueva usa la fecha local (2026-10-27 a las 23:30 local, no UTC)', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 9, 27, 23, 30));

      component.resetForm();

      expect(component.papeleta.fecha).toBe('2026-10-27');
    } finally {
      jasmine.clock().uninstall();
    }
  });

  describe('LV Papeletas listado unificado', () => {
    it('renderiza tabla es-table--apilada con data-label en todas las celdas de datos de una fila', () => {
      const host: HTMLElement = fixture.nativeElement;
      const tabla = host.querySelector('table.es-table.es-table--compacta.es-table--apilada');
      expect(tabla).not.toBeNull();
      expect(tabla?.querySelector('caption.visually-hidden')).not.toBeNull();

      const fila = tabla?.querySelector('tbody tr');
      expect(fila).not.toBeNull();

      const celdasDatos = Array.from(
        fila!.querySelectorAll<HTMLTableCellElement>('td:not(.es-col-acciones)')
      );
      expect(celdasDatos.length).toBe(6);
      for (const td of celdasDatos) {
        const label = td.getAttribute('data-label');
        expect(label && label.trim().length > 0).toBeTrue();
      }
      expect(celdasDatos.map((td) => td.getAttribute('data-label'))).toEqual([
        'N° Papeleta',
        'Fecha',
        'Tipo',
        'Origen',
        'Destino',
        'Equipos',
      ]);
      expect(celdasDatos[0].classList.contains('es-celda-principal')).toBeTrue();
    });

    it('incluye aria-label con el número de papeleta en las acciones y respeta la visibilidad por rol', () => {
      const host: HTMLElement = fixture.nativeElement;
      const btnEditar = host.querySelector<HTMLButtonElement>('td.es-col-acciones button[title="Editar"]');
      const btnEliminar = host.querySelector<HTMLButtonElement>('td.es-col-acciones button[title="Eliminar"]');
      const btnPdf = host.querySelector<HTMLButtonElement>('td.es-col-acciones button[title="Imprimir PDF"]');

      expect(btnEditar?.getAttribute('aria-label')).toBe('Editar papeleta PA-0001');
      expect(btnEliminar?.getAttribute('aria-label')).toBe('Eliminar papeleta PA-0001');
      expect(btnEliminar?.classList.contains('es-icon-btn--peligro')).toBeTrue();
      expect(btnPdf?.getAttribute('aria-label')).toBe('Imprimir PDF de papeleta PA-0001');

      // Como usuario no administrador: conserva Nueva Papeleta, Editar e Imprimir PDF; oculta Eliminar
      esAdmin = false;
      const userFixture = TestBed.createComponent(PapeletasComponent);
      userFixture.detectChanges();
      const userHost: HTMLElement = userFixture.nativeElement;

      expect(userHost.querySelector('button[data-accion="nueva-papeleta"]')?.textContent).toContain('Nueva Papeleta');
      expect(userHost.querySelector('td.es-col-acciones button[title="Editar"]')).not.toBeNull();
      expect(userHost.querySelector('td.es-col-acciones button[title="Imprimir PDF"]')).not.toBeNull();
      expect(userHost.querySelector('td.es-col-acciones button[title="Eliminar"]')).toBeNull();
    });

    it('muestra es-state vacío y con «Limpiar búsqueda» cuando no hay coincidencias', () => {
      component.papeletas = [];
      component.totalItems = 0;
      component.tableSearchText = '';
      component.selectedCategory = '';
      fixture.detectChanges();

      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.es-state .es-state__titulo')?.textContent).toContain(
        'Aún no hay papeletas registradas'
      );

      component.tableSearchText = 'PA-9999';
      fixture.detectChanges();

      expect(host.querySelector('.es-state .es-state__titulo')?.textContent).toContain('PA-9999');
      expect(host.querySelector('.es-state button')?.textContent).toContain('Limpiar búsqueda');
    });
  });
});
