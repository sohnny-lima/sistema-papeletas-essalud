import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { BackendService } from '../services/backend.service';
import { of, throwError } from 'rxjs';

class MockBackendService {
  getEstadisticas() {
    return of({
      success: true,
      message: 'Estadísticas obtenidas exitosamente',
      data: {
        trabajadores: 10,
        equipos: 5,
        papeletas: 20,
      },
    });
  }
}

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let backendService: BackendService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [{ provide: BackendService, useClass: MockBackendService }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    spyOn(component, 'renderChart');
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load statistics on init', () => {
    spyOn(backendService, 'getEstadisticas').and.callThrough();
    component.ngOnInit();
    expect(backendService.getEstadisticas).toHaveBeenCalled();
    expect(component.estadisticas).toEqual({
      totalTrabajadores: 10,
      totalEquipos: 5,
      totalPapeletas: 20,
    });
    expect(component.cargando).toBeFalse();
  });

  it('should handle error when loading statistics', () => {
    spyOn(backendService, 'getEstadisticas').and.returnValue(
      throwError(() => new Error('Error'))
    );
    component.estadisticas = null;
    component.cargarEstadisticas();
    expect(component.cargando).toBeFalse();
    expect(component.errorMessage).toContain('No se pudieron cargar las estadísticas');
  });
});
