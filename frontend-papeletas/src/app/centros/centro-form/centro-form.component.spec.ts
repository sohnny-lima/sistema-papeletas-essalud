import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
import { CentroFormComponent } from './centro-form.component';
import { BackendService } from '../../services/backend.service';

class MockBackendService {
  createCentro(payload: { nombre_centro: string }) {
    return of({
      success: true,
      message: 'Centro asistencial creado exitosamente',
      data: { id_centro: 10, nombre_centro: payload.nombre_centro.trim().toUpperCase() },
    });
  }

  updateCentro(id: number, payload: { nombre_centro: string }) {
    return of({
      success: true,
      message: 'Centro asistencial actualizado exitosamente',
      data: { id_centro: id, nombre_centro: payload.nombre_centro.trim().toUpperCase() },
    });
  }
}

describe('CentroFormComponent', () => {
  let component: CentroFormComponent;
  let fixture: ComponentFixture<CentroFormComponent>;
  let backendService: BackendService;

  const centrosExistentes = [
    { id_centro: 1, nombre_centro: 'HOSPITAL DE PRUEBA NORTE' },
    { id_centro: 2, nombre_centro: 'POLICLINICO CENTRAL' },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CentroFormComponent],
      providers: [{ provide: BackendService, useClass: MockBackendService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CentroFormComponent);
    component = fixture.componentInstance;
    backendService = TestBed.inject(BackendService);
    component.existentes = centrosExistentes;
    fixture.detectChanges();
  });

  it('no utiliza etiqueta <form> para poder incrustarse dentro del formulario de Lugares', () => {
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[name="nombre_centro"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button[data-accion="guardar-centro"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('button[data-accion="cancelar-centro"]')).not.toBeNull();
  });

  it('muestra error si el nombre está vacío o solo tiene espacios sin llamar al backend', () => {
    const createSpy = spyOn(backendService, 'createCentro');
    component.nombre = '   \t  ';
    component.guardar();
    fixture.detectChanges();

    expect(component.error).toBe('Escriba el nombre del centro asistencial.');
    expect(createSpy).not.toHaveBeenCalled();

    const alertEl: HTMLElement | null = fixture.nativeElement.querySelector('.es-field-error[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain('Escriba el nombre del centro asistencial.');
  });

  it('detecta duplicado en existentes (normalizado) y muestra error que empieza por «Ya existe» sin llamar al backend', () => {
    const createSpy = spyOn(backendService, 'createCentro');
    component.centro = null;
    component.nombre = '  hospital   de  prueba   norte ';
    component.guardar();
    fixture.detectChanges();

    expect(component.error).toMatch(/^Ya existe/);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('en edición excluye su propio id_centro de la comprobación de duplicados y llama a updateCentro', () => {
    const updateSpy = spyOn(backendService, 'updateCentro').and.callThrough();
    const guardadoSpy = spyOn(component.guardado, 'emit');

    component.centro = { id_centro: 1, nombre_centro: 'HOSPITAL DE PRUEBA NORTE' };
    component.nombre = '  hospital de   prueba norte ';
    component.guardar();

    expect(component.error).toBeFalsy();
    expect(updateSpy).toHaveBeenCalledWith(1, { nombre_centro: 'HOSPITAL DE PRUEBA NORTE' });
    expect(guardadoSpy).toHaveBeenCalledWith({
      id_centro: 1,
      nombre_centro: 'HOSPITAL DE PRUEBA NORTE',
    });
  });

  it('en creación válida llama a createCentro y emite guardado con data de la respuesta', () => {
    const createSpy = spyOn(backendService, 'createCentro').and.callThrough();
    const guardadoSpy = spyOn(component.guardado, 'emit');

    component.centro = null;
    component.nombre = '  centro   medico   del   valle ';
    component.guardar();

    expect(createSpy).toHaveBeenCalled();
    expect(guardadoSpy).toHaveBeenCalledWith({
      id_centro: 10,
      nombre_centro: 'CENTRO MEDICO DEL VALLE',
    });
  });

  it('muestra el message del servidor en errores 400 y 409', () => {
    spyOn(backendService, 'createCentro').and.returnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 409,
            error: {
              success: false,
              message: 'Ya existe un centro asistencial llamado «CENTRO DUPLICADO».',
            },
          })
      )
    );

    component.nombre = 'CENTRO DUPLICADO';
    component.guardar();
    fixture.detectChanges();

    expect(component.error).toBe('Ya existe un centro asistencial llamado «CENTRO DUPLICADO».');
  });

  it('muestra mensaje de permisos en error HTTP 403 y mensaje de conexión en estado 0 o 503', () => {
    const createSpy = spyOn(backendService, 'createCentro').and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 403, error: { message: 'Forbidden' } }))
    );

    component.nombre = 'CENTRO NUEVO';
    component.guardar();
    expect(component.error).toBe('No tiene permisos para administrar centros asistenciales.');

    createSpy.and.returnValue(
      throwError(() => new HttpErrorResponse({ status: 503, error: { message: 'Unavailable' } }))
    );
    component.guardar();
    expect(component.error).toContain('No se pudo conectar');

    createSpy.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
    component.guardar();
    expect(component.error).toContain('No se pudo conectar');
  });

  it('impide el doble envío mientras guardando es true', () => {
    const subject = new Subject<any>();
    const createSpy = spyOn(backendService, 'createCentro').and.returnValue(subject.asObservable());

    component.nombre = 'CENTRO UNICO EN VUELO';
    component.guardar();
    expect(component.guardando).toBeTrue();

    component.guardar();
    expect(createSpy).toHaveBeenCalledTimes(1);

    subject.next({
      success: true,
      data: { id_centro: 25, nombre_centro: 'CENTRO UNICO EN VUELO' },
    });
    subject.complete();
    expect(component.guardando).toBeFalse();
  });

  it('Enter en el input guarda y Escape emite cancelado deteniendo la propagación', () => {
    const guardarSpy = spyOn(component, 'guardar');
    const canceladoSpy = spyOn(component.cancelado, 'emit');
    const inputEl: HTMLInputElement = fixture.nativeElement.querySelector('input[name="nombre_centro"]');

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    spyOn(enterEvent, 'stopPropagation');
    inputEl.dispatchEvent(enterEvent);
    expect(guardarSpy).toHaveBeenCalled();
    expect(enterEvent.stopPropagation).toHaveBeenCalled();

    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    spyOn(escEvent, 'stopPropagation');
    inputEl.dispatchEvent(escEvent);
    expect(canceladoSpy).toHaveBeenCalled();
    expect(escEvent.stopPropagation).toHaveBeenCalled();
  });
});
