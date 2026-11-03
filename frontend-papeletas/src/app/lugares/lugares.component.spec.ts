import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { LugaresComponent } from './lugares.component';
import { BackendService } from '../services/backend.service';
import { AuthService } from '../services/auth.service';

class MockBackendService {
  getCentros() {
    return of({
      success: true,
      data: [{ id_centro: 1, nombre_centro: 'HOSPITAL DE PRUEBA NORTE' }],
    });
  }

  getLugares() {
    return of({
      success: true,
      data: {
        data: [
          {
            id_lugar: 1,
            nombre_ambiente: 'OFICINA 101',
            dependencia: 'ADMINISTRACION',
            id_centro: 1,
            centro: 'HOSPITAL DE PRUEBA NORTE',
          },
        ],
        totalItems: 1,
      },
    });
  }

  createLugar(lugar: any) {
    return of({
      success: true,
      message: 'Lugar creado exitosamente',
      data: { id_lugar: 2, ...lugar },
    });
  }

  updateLugar(id: number, lugar: any) {
    return of({
      success: true,
      message: 'Lugar actualizado exitosamente',
      data: { id_lugar: id, ...lugar },
    });
  }

  createCentro(payload: { nombre_centro: string }) {
    return of({
      success: true,
      message: 'Centro asistencial creado exitosamente',
      data: { id_centro: 5, nombre_centro: payload.nombre_centro },
    });
  }
}

class MockAuthService {
  admin = true;
  isAdmin(): boolean {
    return this.admin;
  }
}

describe('LugaresComponent', () => {
  let component: LugaresComponent;
  let fixture: ComponentFixture<LugaresComponent>;
  let backendService: BackendService;
  let authService: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LugaresComponent],
      providers: [
        { provide: BackendService, useClass: MockBackendService },
        { provide: AuthService, useClass: MockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LugaresComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    authService = TestBed.inject(AuthService) as unknown as MockAuthService;
    fixture.detectChanges();
  });

  it('should create and load centros and lugares on init', () => {
    expect(component).toBeTruthy();
    expect(component.centros.length).toBe(1);
    expect(component.lugares.length).toBe(1);
    expect(component.totalItems).toBe(1);
  });

  it('should handle error when loading lugares', () => {
    spyOn(component, 'showErrorAlert');
    spyOn(backendService, 'getLugares').and.returnValue(
      throwError(() => new Error('Error'))
    );

    component.getLugares();

    expect(component.isLoading).toBeFalse();
    expect(component.showErrorAlert).toHaveBeenCalledWith(
      'Error de conexión con el servidor'
    );
  });

  it('muestra el botón "+ Nuevo centro" en el modal solo si el usuario es admin', () => {
    expect(
      fixture.nativeElement.querySelector('#lugarModal button[data-accion="nuevo-centro-lugar"]')
    ).not.toBeNull();

    authService.admin = false;
    const userFixture = TestBed.createComponent(LugaresComponent);
    userFixture.detectChanges();

    expect(
      userFixture.nativeElement.querySelector('#lugarModal button[data-accion="nuevo-centro-lugar"]')
    ).toBeNull();
  });

  it('crea un centro desde el formulario de lugar sin perder nombre_ambiente ni dependencia y lo selecciona', () => {
    component.lugar.nombre_ambiente = 'TOMOGRAFIA 1';
    component.lugar.dependencia = 'IMAGENOLOGIA';
    component.lugar.id_centro = 0;

    component.abrirNuevoCentro();
    expect(component.mostrarNuevoCentro).toBeTrue();

    const nuevoCentro = { id_centro: 9, nombre_centro: 'CLINICA GERIATRICA ANCON' };
    component.onCentroCreado(nuevoCentro);

    expect(component.mostrarNuevoCentro).toBeFalse();
    expect(component.lugar.nombre_ambiente).toBe('TOMOGRAFIA 1');
    expect(component.lugar.dependencia).toBe('IMAGENOLOGIA');
    expect(component.lugar.id_centro).toBe(9);
    expect(component.centros.map((c) => c.nombre_centro)).toEqual([
      'CLINICA GERIATRICA ANCON',
      'HOSPITAL DE PRUEBA NORTE',
    ]);
  });

  it('valida el formulario de lugar en línea y muestra errores del servidor en errorFormulario sin showErrorAlert', () => {
    const alertSpy = spyOn(component, 'showErrorAlert');
    component.resetForm();
    component.onSubmit();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(component.errores.nombre_ambiente).toBeTruthy();
    expect(component.errores.dependencia).toBeTruthy();
    expect(component.errores.id_centro).toBeTruthy();

    spyOn(backendService, 'createLugar').and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: { message: 'El centro asistencial indicado no existe.' },
          })
      )
    );

    component.lugar = {
      nombre_ambiente: 'LABORATORIO CENTRAL',
      dependencia: 'PATOLOGIA CLINICA',
      id_centro: 1,
    };
    component.onSubmit();

    expect(alertSpy).not.toHaveBeenCalled();
    expect(component.errorFormulario).toBe('El centro asistencial indicado no existe.');
  });
});
