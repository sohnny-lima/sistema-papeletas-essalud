import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { DetallePapeletaComponent } from './detalle-papeleta.component';
import { BackendService } from '../../services/backend.service';

class MockBackendService {
  getPapeletaById(id: number) {
    return of({
      success: true,
      message: 'Papeleta obtenida exitosamente',
      data: {
        id_papeleta: id,
        numero_papeleta: 'PA-0001',
        fecha: '2026-10-27',
        tipo_formulario_nombre: 'DESPLAZAMIENTO',
      },
    });
  }
}

describe('DetallePapeletaComponent', () => {
  let component: DetallePapeletaComponent;
  let fixture: ComponentFixture<DetallePapeletaComponent>;
  let backendService: BackendService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetallePapeletaComponent],
      providers: [
        { provide: BackendService, useClass: MockBackendService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ id: '1' }),
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DetallePapeletaComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    fixture.detectChanges();
  });

  it('should create and load papeleta detail for route id', () => {
    expect(component).toBeTruthy();
    expect(component.papeleta.id_papeleta).toBe(1);
    expect(component.papeleta.numero_papeleta).toBe('PA-0001');
  });
});
