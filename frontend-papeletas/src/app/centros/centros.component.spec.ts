import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CentrosComponent } from './centros.component';
import { BackendService } from '../services/backend.service';

class MockBackendService {
  getCentros() {
    return of({
      success: true,
      message: 'Centros asistenciales obtenidos exitosamente',
      data: [
        { id_centro: 1, nombre_centro: 'HOSPITAL DE PRUEBA NORTE', total_lugares: 2 },
        { id_centro: 2, nombre_centro: 'POLICLINICO SUR', total_lugares: 0 },
      ],
    });
  }
}

describe('CentrosComponent', () => {
  let component: CentrosComponent;
  let fixture: ComponentFixture<CentrosComponent>;
  let backendService: BackendService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CentrosComponent],
      providers: [{ provide: BackendService, useClass: MockBackendService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CentrosComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    fixture.detectChanges();
  });

  it('carga los centros al iniciar y renderiza la tabla con botones de edición accesibles', () => {
    expect(component).toBeTruthy();
    expect(component.centros.length).toBe(2);

    const btnNuevo = fixture.nativeElement.querySelector('button[data-accion="nuevo-centro"]');
    expect(btnNuevo).not.toBeNull();

    const filas = fixture.nativeElement.querySelectorAll('table.es-table tbody tr');
    expect(filas.length).toBe(2);

    const btnEditar = fixture.nativeElement.querySelector(
      'button[data-accion="editar-centro"][aria-label="Editar centro HOSPITAL DE PRUEBA NORTE"]'
    );
    expect(btnEditar).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#centroModal')).not.toBeNull();
  });

  it('filtra centrosFiltrados usando normalizarNombreCentro y muestra estado sin resultados', () => {
    component.filtro = '   prueba   norte  ';
    fixture.detectChanges();

    expect(component.centrosFiltrados.length).toBe(1);
    expect(component.centrosFiltrados[0].nombre_centro).toBe('HOSPITAL DE PRUEBA NORTE');

    component.filtro = 'INEXISTENTE XYZ';
    fixture.detectChanges();

    expect(component.centrosFiltrados.length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('table.es-table tbody tr').length).toBe(0);
  });

  it('muestra estado vacío cuando no hay centros registrados', () => {
    spyOn(backendService, 'getCentros').and.returnValue(
      of({ success: true, message: 'OK', data: [] })
    );
    component.filtro = '';
    component.ngOnInit();
    fixture.detectChanges();

    expect(component.centros.length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('table.es-table tbody tr').length).toBe(0);
  });

  it('onGuardado recarga la lista de centros y muestra alerta de éxito', () => {
    const getCentrosSpy = spyOn(backendService, 'getCentros').and.callThrough();
    const alertSpy = spyOn(component, 'showSuccessAlert');

    component.onGuardado({ id_centro: 3, nombre_centro: 'CENTRO NUEVO' });

    expect(getCentrosSpy).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
  });
});
