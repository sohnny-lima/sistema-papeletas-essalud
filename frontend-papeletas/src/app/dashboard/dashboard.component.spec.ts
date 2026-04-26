import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardComponent } from './dashboard.component';
import { BackendService } from '../services/backend.service';
import { of, throwError } from 'rxjs';

class MockBackendService {
  getEstadisticas() {
    return of({ totalTrabajadores: 10, totalEquipos: 5, totalPapeletas: 20 });
  }
}

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let backendService: BackendService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DashboardComponent],
      providers: [{ provide: BackendService, useClass: MockBackendService }]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load statistics on init', () => {
    spyOn(backendService, 'getEstadisticas').and.callThrough();
    component.ngOnInit();
    expect(backendService.getEstadisticas).toHaveBeenCalled();
    expect(component.estadisticas.totalTrabajadores).toBe(10);
  });

  it('should handle error when loading statistics', () => {
    spyOn(backendService, 'getEstadisticas').and.returnValue(throwError('Error'));
    component.cargarEstadisticas();
    expect(component.estadisticas).toEqual({ totalTrabajadores: 0, totalEquipos: 0, totalPapeletas: 0 });
  });
});