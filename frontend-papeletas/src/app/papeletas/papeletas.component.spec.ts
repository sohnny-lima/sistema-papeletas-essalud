import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PapeletasComponent } from './papeletas.component';
import { BackendService } from '../services/backend.service';
import { of, throwError } from 'rxjs';

class MockBackendService {
  getPapeletas() {
    return of([
      {
        numero: '001',
        datosOrigen: { trabajador: 'Juan Pérez', dependencia: 'Almacén' },
        datosDestino: { trabajador: 'María López', dependencia: 'Oficina 2' },
      },
    ]);
  }
}

describe('PapeletasComponent', () => {
  let component: PapeletasComponent;
  let fixture: ComponentFixture<PapeletasComponent>;
  let backendService: BackendService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PapeletasComponent],
      providers: [{ provide: BackendService, useClass: MockBackendService }]
    }).compileComponents();

    fixture = TestBed.createComponent(PapeletasComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load papeletas on init', () => {
    spyOn(backendService, 'getPapeletas').and.callThrough();
    component.ngOnInit();
    expect(backendService.getPapeletas).toHaveBeenCalled();
    expect(component.papeletas.length).toBeGreaterThan(0);
  });

  it('should handle error when loading papeletas', () => {
    spyOn(backendService, 'getPapeletas').and.returnValue(throwError('Error'));
    component.getPapeletas();
    expect(component.papeletas).toEqual([]);
  });
});
