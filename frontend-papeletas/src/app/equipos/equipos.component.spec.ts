import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EquiposComponent } from './equipos.component';
import { BackendService } from '../services/backend.service';
import { of, throwError } from 'rxjs';

class MockBackendService {
  getEquipos() {
    return of([
      { nombre: 'Equipo A', tipo: 'Tipo 1', estado: 'Operativo' },
      { nombre: 'Equipo B', tipo: 'Tipo 2', estado: 'En reparación' }
    ]);
  }
}

describe('EquiposComponent', () => {
  let component: EquiposComponent;
  let fixture: ComponentFixture<EquiposComponent>;
  let backendService: BackendService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [EquiposComponent],
      providers: [{ provide: BackendService, useClass: MockBackendService }]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(EquiposComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load equipment on init', () => {
    spyOn(backendService, 'getEquipos').and.callThrough();
    component.ngOnInit();
    expect(backendService.getEquipos).toHaveBeenCalled();
    expect(component.equipos.length).toBeGreaterThan(0);
  });

  it('should handle error when loading equipment', () => {
    spyOn(backendService, 'getEquipos').and.returnValue(throwError('Error'));
    component.getEquipos();
    expect(component.equipos.length).toBe(0);
  });
});
