import { TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import Swal from 'sweetalert2';
import { EquiposComponent } from './equipos/equipos.component';
import { TrabajadoresComponent } from './trabajadores/trabajadores.component';
import { PapeletasComponent } from './papeletas/papeletas.component';
import { BackendService } from './services/backend.service';
import { AuthService } from './services/auth.service';

const equipo = { id_equipo: 1, cod_patrimonial: '74080001', descripcion: 'CPU', marca: 'MARCA', serie: 'SERIE', modelo: 'MODELO' };
const trabajador = { id_trabajador: 1, nombres: 'ANA', apellido_paterno: 'PRUEBA', apellido_materno: 'UNO', numero_identificacion: '10000001' };
const papeleta = { id_papeleta: 1, numero_papeleta: 'PA-0001', fecha: '2026-10-28', id_tipo_formulario: 3,
  id_trabajador_origen: 1, id_trabajador_destino: 2, trabajador_origen_nombre: 'ANA', trabajador_destino_nombre: 'LUIS',
  id_lugar_origen: 1, id_lugar_destino: 2, lugar_origen_nombre: 'OFICINA', lugar_destino_nombre: 'ALMACEN', equipos_patrimoniales: [equipo] };

for (const [Componente, plural, singular, fila, campo] of [
  [EquiposComponent, 'Equipos', 'Equipo', equipo, 'equipo'],
  [TrabajadoresComponent, 'Trabajadores', 'Trabajador', trabajador, 'trabajador'],
  [PapeletasComponent, 'Papeletas', 'Papeleta', papeleta, 'papeleta']
] as const) {
  describe(`A8 permisos y mensajes en ${plural}`, () => {
    let backend: any, auth: { isAdmin: jasmine.Spy };
    beforeEach(async () => {
      backend = {};
      for (const metodo of [`get${plural}`, `create${singular}`, `update${singular}`, `delete${singular}`]) {
        backend[metodo] = jasmine.createSpy(metodo).and.returnValue(of({ success: true, message: 'OK', data: { data: [fila], totalItems: 1 } }));
      }
      backend.getTiposFormulario = () => of({ success: true, message: 'OK', data: [] });
      auth = { isAdmin: jasmine.createSpy('isAdmin').and.returnValue(false) };
      await TestBed.configureTestingModule({ imports: [Componente], providers: [
        { provide: BackendService, useValue: backend }, { provide: AuthService, useValue: auth }
      ] }).compileComponents();
    });
    const crear = () => { const f = TestBed.createComponent<any>(Componente); f.detectChanges(); return f; };
    for (const admin of [false, true]) {
      it(`rol ${admin ? 'admin' : 'user'} conserva alta y edición; Eliminar solo admin`, () => {
        auth.isAdmin.and.returnValue(admin); const f = crear();
        expect(f.nativeElement.querySelectorAll('button[title="Editar"]').length).toBeGreaterThan(0);
        // 01/11/2026 (g026): Papeletas ya no duplica cada fila (tabla de escritorio + tarjeta móvil); una sola tabla apilada.
        expect(f.nativeElement.querySelectorAll('button[title="Eliminar"]').length).toBe(admin ? 1 : 0);
        expect(f.nativeElement.textContent).toMatch(/Agregar|Nueva/);
      });
    }
    it('usuario normal puede crear y editar pero no invocar eliminar', () => {
      const c = crear().componentInstance;
      spyOn(c, 'closeModal'); spyOn(c, 'showSuccessAlert');
      const alerta = spyOn(Swal, 'fire');
      c[`delete${singular}`](1); expect(alerta).not.toHaveBeenCalled();
      expect(backend[`delete${singular}`]).not.toHaveBeenCalled();
      c[campo] = { ...fila, [`id_${campo}`]: undefined }; c.onSubmit();
      expect(backend[`create${singular}`]).toHaveBeenCalledTimes(1);
      c[campo] = { ...fila }; c.onSubmit();
      expect(backend[`update${singular}`]).toHaveBeenCalledTimes(1);
    });
    for (const [status, mensaje] of [[403, 'No tiene permisos para realizar esta acción.'], [409, 'El registro está en uso por una papeleta.']] as const) {
      it(`eliminar con ${status} muestra ${status === 403 ? 'permisos' : 'el mensaje del servidor'}`, fakeAsync(() => {
        auth.isAdmin.and.returnValue(true); const c = crear().componentInstance;
        spyOn(c, 'showErrorAlert');
        spyOn(Swal, 'fire').and.returnValue(Promise.resolve({ isConfirmed: true } as any));
        backend[`delete${singular}`].and.returnValue(throwError(() => ({ status, error: { message: status === 403 ? 'Acceso denegado' : mensaje } })));
        c[`delete${singular}`](1); flushMicrotasks();
        expect(c.showErrorAlert).toHaveBeenCalledWith(mensaje);
      }));
    }
  });
}
