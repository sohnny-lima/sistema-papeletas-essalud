import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrabajadoresComponent } from './trabajadores.component';
import { BackendService } from '../services/backend.service';
import { of, throwError } from 'rxjs';

describe('TrabajadoresComponent', () => {
  let component: TrabajadoresComponent;
  let fixture: ComponentFixture<TrabajadoresComponent>;
  let backendService: jasmine.SpyObj<BackendService>;

  beforeEach(async () => {
    const backendSpy = jasmine.createSpyObj('BackendService', ['getTrabajadores']);

    await TestBed.configureTestingModule({
      imports: [TrabajadoresComponent],
      providers: [
        { provide: BackendService, useValue: backendSpy }
      ]
    }).compileComponents();

    backendService = TestBed.inject(BackendService) as jasmine.SpyObj<BackendService>;
    fixture = TestBed.createComponent(TrabajadoresComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch trabajadores on init', () => {
    const mockTrabajadores = [
      {
        nombres: 'Juan',
        apellido_paterno: 'Perez',
        apellido_materno: 'Lopez',
        numero_identificacion: '12345678'
      }
    ];
    backendService.getTrabajadores.and.returnValue(of(mockTrabajadores));

    component.ngOnInit();

    expect(backendService.getTrabajadores).toHaveBeenCalled();
    expect(component.trabajadores).toEqual(mockTrabajadores);
  });

  it('should handle error if getTrabajadores fails', () => {
    backendService.getTrabajadores.and.returnValue(throwError('Error'));

    component.getTrabajadores();

    expect(component.trabajadores).toEqual([]);
  });
});
