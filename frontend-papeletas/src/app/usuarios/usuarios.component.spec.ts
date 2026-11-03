import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import Swal from 'sweetalert2';
import { UsuariosComponent } from './usuarios.component';
import { UsuariosService, UsuarioItem, ApiResponse, ListaUsuariosData } from '../services/usuarios.service';
import { AuthService, SesionUsuario } from '../services/auth.service';

class MockAuthService {
  idActual: number | null = 1;
  tokenActual: string | null = 'token-admin-1';
  readonly sesion = signal<SesionUsuario | null>({
    idUsuario: 1,
    nombreUsuario: 'admin_prueba',
    rol: 'admin',
    rolNombre: 'Administrador',
  }).asReadonly();

  getIdUsuario(): number | null {
    return this.idActual;
  }

  getToken(): string | null {
    return this.tokenActual;
  }

  refrescarSesion = jasmine.createSpy('refrescarSesion');
  cerrarSesionPorCambioDeClave = jasmine.createSpy('cerrarSesionPorCambioDeClave');
}

const USUARIOS_BASE: UsuarioItem[] = [
  {
    id_usuario: 1,
    nombre_usuario: 'admin_prueba',
    id_rol: 1,
    rol: 'admin',
    rolNombre: 'Administrador',
    activo: true,
    fecha_creacion: '2026-10-28T10:00:00.000Z',
  },
  {
    id_usuario: 2,
    nombre_usuario: 'usuario_prueba',
    id_rol: 2,
    rol: 'user',
    rolNombre: 'Usuario',
    activo: true,
    fecha_creacion: '2026-10-28T11:00:00.000Z',
  },
];

describe('U4 UsuariosComponent (F-04, F-05, F-06)', () => {
  let component: UsuariosComponent;
  let fixture: ComponentFixture<UsuariosComponent>;
  let usuariosService: UsuariosService;
  let authService: MockAuthService;
  let bootstrapOriginal: any;
  let modalMockInstance: {
    show: jasmine.Spy;
    hide: jasmine.Spy;
    dispose: jasmine.Spy;
  };
  let modalMockApi: {
    getOrCreateInstance: jasmine.Spy;
    getInstance: jasmine.Spy;
  };

  beforeEach(async () => {
    bootstrapOriginal = (window as any).bootstrap;
    modalMockInstance = {
      show: jasmine.createSpy('show'),
      hide: jasmine.createSpy('hide'),
      dispose: jasmine.createSpy('dispose'),
    };
    modalMockApi = {
      getOrCreateInstance: jasmine
        .createSpy('getOrCreateInstance')
        .and.returnValue(modalMockInstance),
      getInstance: jasmine
        .createSpy('getInstance')
        .and.returnValue(modalMockInstance),
    };
    (window as any).bootstrap = {
      ...(bootstrapOriginal || {}),
      Modal: modalMockApi,
    };

    await TestBed.configureTestingModule({
      imports: [UsuariosComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useClass: MockAuthService },
      ],
    }).compileComponents();

    usuariosService = TestBed.inject(UsuariosService);
    authService = TestBed.inject(AuthService) as unknown as MockAuthService;

    spyOn(usuariosService, 'roles').and.returnValue(
      of({
        success: true,
        data: [
          { id_rol: 1, nombre_rol: 'ADMINISTRADOR' },
          { id_rol: 2, nombre_rol: 'USUARIO' },
        ],
      })
    );
    spyOn(usuariosService, 'politicaContrasena').and.returnValue(
      of({
        success: true,
        data: { longitudMinima: 10, longitudMaximaBytes: 72 },
      })
    );
    spyOn(usuariosService, 'listar').and.returnValue(
      of({
        success: true,
        data: {
          data: USUARIOS_BASE.map((u) => ({ ...u })),
          totalItems: 2,
          totalPages: 1,
          currentPage: 1,
        },
      })
    );

    fixture = TestBed.createComponent(UsuariosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    (window as any).bootstrap = bootstrapOriginal;
  });

  describe('U4 F-04 listado, estados, búsqueda con debounce y paginación', () => {
    it('renderiza la nota diferencial con Trabajadores, la tabla y los distintivos de rol y estado', () => {
      const nota = fixture.nativeElement.querySelector('[data-nota="distincion-trabajadores"]');
      expect(nota).not.toBeNull();
      expect(nota.textContent).toContain('Trabajadores');

      const filas = fixture.nativeElement.querySelectorAll('table.es-table tbody tr');
      expect(filas.length).toBe(2);
      expect(filas[0].textContent).toContain('admin_prueba');
      expect(filas[0].textContent).toContain('Administrador');
      expect(filas[0].textContent).toContain('Activa');
    });

    it('distingue el estado vacío sin filtros del estado sin resultados con filtros y permite restablecerlos', () => {
      (usuariosService.listar as jasmine.Spy).and.returnValue(
        of({
          success: true,
          data: { data: [], totalItems: 0, totalPages: 0, currentPage: 1 },
        })
      );

      // 1. Con filtro de estado = inactivos -> estado "sin-resultados" y botón "Restablecer filtros"
      component.estadoFiltro = 'inactivos';
      component.aplicarFiltros();
      fixture.detectChanges();

      const estadoSinRes = fixture.nativeElement.querySelector('[data-estado="sin-resultados"]');
      expect(estadoSinRes).not.toBeNull();
      const btnRestablecer = estadoSinRes.querySelector(
        'button[data-accion="restablecer-filtros"]'
      );
      expect(btnRestablecer).not.toBeNull();

      // 2. Al pulsar Restablecer filtros vuelve a estado=todos y search='' -> estado "vacio"
      btnRestablecer.click();
      fixture.detectChanges();

      expect(component.estadoFiltro).toBe('todos');
      expect(component.searchText).toBe('');
      expect(fixture.nativeElement.querySelector('[data-estado="vacio"]')).not.toBeNull();
    });

    it('muestra error de carga (incluido 403 específico) y permite reintentar', () => {
      (usuariosService.listar as jasmine.Spy).and.returnValue(
        throwError(() => new HttpErrorResponse({ status: 403 }))
      );

      component.cargarUsuarios();
      fixture.detectChanges();

      const alertaError = fixture.nativeElement.querySelector('.es-state--error');
      expect(alertaError).not.toBeNull();
      expect(alertaError.textContent).toContain('No tiene permisos para administrar usuarios.');

      (usuariosService.listar as jasmine.Spy).and.returnValue(
        of({
          success: true,
          data: { data: USUARIOS_BASE, totalItems: 2, totalPages: 1, currentPage: 1 },
        })
      );
      alertaError.querySelector('button[data-accion="reintentar-carga"]').click();
      fixture.detectChanges();

      expect(component.errorCarga).toBe('');
      expect(component.usuarios.length).toBe(2);
    });

    it('aplica búsqueda con espera breve (debounce 300 ms) y reinicia la página a 1', fakeAsync(() => {
      (usuariosService.listar as jasmine.Spy).calls.reset();
      component.currentPage = 2;
      component.searchText = 'usuario';
      component.onSearchInput();

      tick(200);
      expect(usuariosService.listar).not.toHaveBeenCalled();

      tick(100);
      expect(usuariosService.listar).toHaveBeenCalledWith({
        search: 'usuario',
        estado: 'todos',
        page: 1,
        pageSize: 10,
      });
    }));

    it('retrocede automáticamente a la última página válida si la página actual queda vacía (§7.15)', () => {
      component.currentPage = 2;
      let llamada = 0;
      (usuariosService.listar as jasmine.Spy).and.callFake(() => {
        llamada++;
        if (llamada === 1) {
          return of({
            success: true,
            data: { data: [], totalItems: 10, totalPages: 1, currentPage: 2 },
          });
        }
        return of({
          success: true,
          data: { data: USUARIOS_BASE, totalItems: 10, totalPages: 1, currentPage: 1 },
        });
      });

      component.cargarUsuarios();

      expect(llamada).toBe(2);
      expect(component.currentPage).toBe(1);
      expect(component.usuarios.length).toBe(2);
    });
  });

  describe('U4 F-05 validaciones de alta/edición y 409 de nombre duplicado', () => {
    it('valida en cliente formato de nombre, política de contraseña, límite de 72 bytes y confirmación', () => {
      component.nuevoUsuario();
      expect(modalMockApi.getOrCreateInstance).toHaveBeenCalled();
      expect(modalMockInstance.show).toHaveBeenCalled();

      // 1. Nombre con espacios o caracteres no permitidos
      component.formulario.nombre_usuario = ' mal nombre ';
      component.formulario.contrasena = 'corta1';
      component.formulario.confirmarContrasena = 'otra';
      expect(component.validarFormulario()).toBeFalse();
      expect(component.errores.nombre_usuario).toContain('espacios');
      expect(component.errores.contrasena).toContain('al menos 10 caracteres');
      expect(component.errores.confirmarContrasena).toContain('no coinciden');

      // 2. Caracteres inválidos en nombre y contraseña igual al usuario
      component.formulario.nombre_usuario = 'juan@essalud';
      expect(component.validarFormulario()).toBeFalse();
      expect(component.errores.nombre_usuario).toContain('letras sin tildes');

      component.formulario.nombre_usuario = 'Operador.Uno1';
      component.formulario.contrasena = 'operador.uno1';
      component.formulario.confirmarContrasena = 'operador.uno1';
      expect(component.validarFormulario()).toBeFalse();
      expect(component.errores.contrasena).toContain('distinta del nombre de usuario');

      // 3. Más de 72 bytes UTF-8
      const claveLarga = 'A1' + 'é'.repeat(36); // 2 + 72 = 74 bytes UTF-8
      component.formulario.contrasena = claveLarga;
      component.formulario.confirmarContrasena = claveLarga;
      expect(component.validarFormulario()).toBeFalse();
      expect(component.errores.contrasena).toContain('72 bytes UTF-8');

      // 4. Datos válidos pasan la validación
      component.formulario.contrasena = 'Clave.Valida10';
      component.formulario.confirmarContrasena = 'Clave.Valida10';
      expect(component.validarFormulario()).toBeTrue();
    });

    it('permite editar rol o contraseña de una cuenta histórica sin exigir renombrarla (§7.2)', () => {
      const historica: UsuarioItem = {
        id_usuario: 8,
        nombre_usuario: 'ADMIN ANTIGUO CON ESPACIOS',
        id_rol: 2,
        activo: true,
      };
      component.editarUsuario(historica);
      expect(component.validarFormulario()).toBeTrue();
    });

    it('asocia el 409 de nombre duplicado al campo nombre_usuario con aria-invalid="true"', () => {
      spyOn(usuariosService, 'crear').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { message: 'Ya existe un usuario con ese nombre.' },
            })
        )
      );

      component.nuevoUsuario();
      component.formulario = {
        nombre_usuario: 'ADMIN_PRUEBA',
        id_rol: 2,
        contrasena: 'Clave.Segura10',
        confirmarContrasena: 'Clave.Segura10',
      };
      component.onSubmit();
      fixture.detectChanges();

      expect(component.errores.nombre_usuario).toBe('Ya existe un usuario con ese nombre.');
      expect(component.errorFormulario).toBe('');

      const inputNombre = fixture.nativeElement.querySelector('#nombreUsuarioModal');
      expect(inputNombre.getAttribute('aria-invalid')).toBe('true');
      expect(inputNombre.classList.contains('es-texto-literal')).toBeTrue();
    });

    it('alterna Mostrar/Ocultar contraseña con aria-label dinámico', () => {
      component.nuevoUsuario();
      fixture.detectChanges();

      const inputClave = fixture.nativeElement.querySelector('#contrasenaUsuarioModal');
      const btnMostrar = fixture.nativeElement.querySelector(
        'button[data-accion="mostrar-contrasena"]'
      );

      expect(inputClave.getAttribute('type')).toBe('password');
      expect(btnMostrar.getAttribute('aria-label')).toBe('Mostrar contraseña');

      btnMostrar.click();
      fixture.detectChanges();

      expect(inputClave.getAttribute('type')).toBe('text');
      expect(btnMostrar.getAttribute('aria-label')).toBe('Ocultar contraseña');
    });
  });

  describe('U4 F-06 propia cuenta, cierre de sesión por cambio de clave y último administrador', () => {
    it('en la propia cuenta muestra «Sesión actual», oculta Desactivar y deshabilita el rol en el modal con explicación', async () => {
      const filaPropia = fixture.nativeElement.querySelector('tr[data-usuario="admin_prueba"]');
      expect(filaPropia.querySelector('[data-distintivo="sesion-actual"]')).not.toBeNull();
      expect(filaPropia.querySelector('button[data-accion="cambiar-estado"]')).toBeNull();

      const filaAjena = fixture.nativeElement.querySelector('tr[data-usuario="usuario_prueba"]');
      expect(filaAjena.querySelector('[data-distintivo="sesion-actual"]')).toBeNull();
      expect(filaAjena.querySelector('button[data-accion="cambiar-estado"]')).not.toBeNull();

      component.editarUsuario(USUARIOS_BASE[0]);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const selectRol = fixture.nativeElement.querySelector('#rolUsuarioModal') as HTMLSelectElement;
      expect(selectRol.disabled).toBeTrue();
      const notaPropia = fixture.nativeElement.querySelector('[data-nota="cuenta-propia"]');
      expect(notaPropia).not.toBeNull();
      expect(notaPropia.textContent).toContain('no puede cambiar su propio rol');

      const avisoClave = fixture.nativeElement.querySelector('[data-aviso="cambio-clave-propia"]');
      expect(avisoClave).not.toBeNull();
      expect(avisoClave.textContent).toContain('se cerrará su sesión actual');
    });

    it('al cambiar la propia contraseña llama a cerrarSesionPorCambioDeClave() sin recargar la lista (§7.13)', () => {
      spyOn(usuariosService, 'actualizar').and.returnValue(
        of({
          success: true,
          data: { ...USUARIOS_BASE[0] },
        })
      );
      (usuariosService.listar as jasmine.Spy).calls.reset();

      component.editarUsuario(USUARIOS_BASE[0]);
      component.formulario.contrasena = 'Nueva.Clave10';
      component.formulario.confirmarContrasena = 'Nueva.Clave10';
      component.onSubmit();

      expect(modalMockInstance.hide).toHaveBeenCalled();
      expect(authService.cerrarSesionPorCambioDeClave).toHaveBeenCalledTimes(1);
      expect(usuariosService.listar).not.toHaveBeenCalled();
    });

    it('al renombrar la propia cuenta sin cambiar la contraseña llama a refrescarSesion() y recarga la lista', () => {
      spyOn(usuariosService, 'actualizar').and.returnValue(
        of({
          success: true,
          data: { ...USUARIOS_BASE[0], nombre_usuario: 'admin_renombrado' },
        })
      );
      spyOn(component, 'showSuccessAlert');
      (usuariosService.listar as jasmine.Spy).calls.reset();

      component.editarUsuario(USUARIOS_BASE[0]);
      component.formulario.nombre_usuario = 'admin_renombrado';
      component.onSubmit();

      expect(authService.refrescarSesion).toHaveBeenCalledTimes(1);
      expect(authService.cerrarSesionPorCambioDeClave).not.toHaveBeenCalled();
      expect(usuariosService.listar).toHaveBeenCalledTimes(1);
    });

    it('impide cerrar el modal mientras se guarda (§7.16)', () => {
      const modalEl = fixture.nativeElement.querySelector('#usuarioModal') as HTMLElement;

      component.guardando = true;
      const evBloqueado = new Event('hide.bs.modal', { cancelable: true });
      modalEl.dispatchEvent(evBloqueado);
      expect(evBloqueado.defaultPrevented).toBeTrue();

      component.guardando = false;
      const evPermitido = new Event('hide.bs.modal', { cancelable: true });
      modalEl.dispatchEvent(evPermitido);
      expect(evPermitido.defaultPrevented).toBeFalse();
    });

    it('muestra tal cual el 409 del último administrador activo tanto en el modal como al desactivar', () => {
      const otroAdmin: UsuarioItem = {
        id_usuario: 3,
        nombre_usuario: 'admin_secundario',
        id_rol: 1,
        rol: 'admin',
        activo: true,
      };

      // 1. En el modal al intentar degradar al último administrador
      spyOn(usuariosService, 'actualizar').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { message: 'Debe quedar al menos un administrador activo.' },
            })
        )
      );

      component.editarUsuario(otroAdmin);
      component.formulario.id_rol = 2;
      component.onSubmit();
      fixture.detectChanges();

      expect(component.errorFormulario).toBe('Debe quedar al menos un administrador activo.');
      const alertaModal = fixture.nativeElement.querySelector('[data-alerta="error-formulario"]');
      expect(alertaModal.textContent).toContain('Debe quedar al menos un administrador activo.');

      // 2. Al intentar desactivar al último administrador
      const alertSpy = spyOn(component, 'showErrorAlert');
      spyOn(usuariosService, 'cambiarEstado').and.returnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { message: 'Debe quedar al menos un administrador activo.' },
            })
        )
      );

      component.ejecutarCambioEstado(otroAdmin, false);
      expect(alertSpy).toHaveBeenCalledWith('Debe quedar al menos un administrador activo.');
    });
  });

  describe('U4 R001 regresiones (R001-01 a R001-05)', () => {
    it('R001-01 usa titleText en Swal.fire y un nombre histórico con <img src=x onerror=alert(1)> no crea elementos DOM', () => {
      const nombreConHtml = 'HISTORICO <img src=x onerror=alert(1)>';
      const usuarioHistorico: UsuarioItem = {
        id_usuario: 99,
        nombre_usuario: nombreConHtml,
        id_rol: 2,
        rol: 'user',
        activo: true,
      };
      const swalSpy = spyOn(Swal, 'fire').and.callThrough();

      try {
        component.confirmarCambioEstado(usuarioHistorico);

        expect(swalSpy).toHaveBeenCalled();
        const opcionesConfirm = swalSpy.calls.mostRecent().args[0] as any;
        expect(opcionesConfirm.titleText).toBe(`¿Desactivar la cuenta «${nombreConHtml}»?`);
        expect(opcionesConfirm.title).toBeUndefined();
        expect(opcionesConfirm.html).toBeUndefined();

        const tituloConfirmDom = document.querySelector('.swal2-title');
        expect(tituloConfirmDom).not.toBeNull();
        expect(tituloConfirmDom!.textContent).toContain('<img src=x onerror=alert(1)>');
        expect(tituloConfirmDom!.querySelector('img')).toBeNull();
        expect(tituloConfirmDom!.children.length).toBe(0);
        Swal.close();

        component.showSuccessAlert(`Usuario «${nombreConHtml}» actualizado.`);
        const opcionesExito = swalSpy.calls.mostRecent().args[0] as any;
        expect(opcionesExito.titleText).toBe(`Usuario «${nombreConHtml}» actualizado.`);
        expect(opcionesExito.title).toBeUndefined();

        const tituloExitoDom = document.querySelector('.swal2-title');
        expect(tituloExitoDom).not.toBeNull();
        expect(tituloExitoDom!.querySelector('img')).toBeNull();
        expect(tituloExitoDom!.children.length).toBe(0);
      } finally {
        Swal.close();
      }
    });

    it('R001-02 coordina hidden.bs.modal, navegación y dispose con Bootstrap real sin dejar backdrops ni callbacks sobre null', async () => {
      // Aislamiento (Claude): otras specs (Centros, Lugares) abren modales reales en el mismo documento
      // y pueden dejar backdrops; se retiran antes para que la aserción final mida solo este componente.
      document.querySelectorAll('.modal-backdrop').forEach((b) => b.remove());
      document.body.classList.remove('modal-open');
      if (bootstrapOriginal?.Modal) {
        (window as any).bootstrap = bootstrapOriginal;
      }
      spyOn(usuariosService, 'actualizar').and.returnValue(
        of({
          success: true,
          data: { ...USUARIOS_BASE[0] },
        })
      );

      const modalEl = fixture.nativeElement.querySelector('#usuarioModal') as HTMLElement;
      let eventoHiddenDisparado = false;
      modalEl.addEventListener(
        'hidden.bs.modal',
        () => {
          eventoHiddenDisparado = true;
        },
        { once: true }
      );

      component.editarUsuario(USUARIOS_BASE[0]);
      component.formulario.contrasena = 'Nueva.Clave10';
      component.formulario.confirmarContrasena = 'Nueva.Clave10';
      component.onSubmit();

      expect(authService.cerrarSesionPorCambioDeClave).toHaveBeenCalledTimes(1);
      if (bootstrapOriginal?.Modal) {
        expect(eventoHiddenDisparado).toBeTrue();
      }

      fixture.destroy();
      await new Promise((resolve) => setTimeout(resolve, 360));

      expect(document.querySelectorAll('.modal-backdrop').length).toBe(0);
      expect(document.body.classList.contains('modal-open')).toBeFalse();
    });

    it('R001-03 vacía contrasena y confirmarContrasena tanto en el modelo como en los inputs al cerrar el modal, tras guardar y al destruir', () => {
      const inputClave = fixture.nativeElement.querySelector(
        '#contrasenaUsuarioModal'
      ) as HTMLInputElement;
      const inputConfirmar = fixture.nativeElement.querySelector(
        '#confirmarContrasenaModal'
      ) as HTMLInputElement;
      const modalEl = fixture.nativeElement.querySelector('#usuarioModal') as HTMLElement;

      // 1. Al cerrar el modal (evento hidden.bs.modal)
      component.nuevoUsuario();
      component.formulario.contrasena = 'Clave.Temporal1';
      component.formulario.confirmarContrasena = 'Clave.Temporal1';
      component.mostrarContrasena = true;
      component.mostrarConfirmacion = true;
      fixture.detectChanges();
      inputClave.value = 'Clave.Temporal1';
      inputConfirmar.value = 'Clave.Temporal1';

      modalEl.dispatchEvent(new Event('hidden.bs.modal'));

      expect(component.formulario.contrasena).toBe('');
      expect(component.formulario.confirmarContrasena).toBe('');
      expect(component.mostrarContrasena).toBeFalse();
      expect(component.mostrarConfirmacion).toBeFalse();
      expect(inputClave.value).toBe('');
      expect(inputConfirmar.value).toBe('');
      expect(inputClave.type).toBe('password');
      expect(inputConfirmar.type).toBe('password');

      // 2. Tras guardar un usuario
      spyOn(usuariosService, 'crear').and.returnValue(
        of({
          success: true,
          data: {
            id_usuario: 15,
            nombre_usuario: 'operador_limpio',
            id_rol: 2,
            activo: true,
          },
        })
      );
      spyOn(component, 'showSuccessAlert');

      component.nuevoUsuario();
      component.formulario = {
        nombre_usuario: 'operador_limpio',
        id_rol: 2,
        contrasena: 'Clave.Guardar10',
        confirmarContrasena: 'Clave.Guardar10',
      };
      inputClave.value = 'Clave.Guardar10';
      inputConfirmar.value = 'Clave.Guardar10';
      component.onSubmit();

      expect(component.formulario.contrasena).toBe('');
      expect(component.formulario.confirmarContrasena).toBe('');
      expect(inputClave.value).toBe('');
      expect(inputConfirmar.value).toBe('');

      // 3. Al destruir el componente
      component.formulario.contrasena = 'Clave.EnMemoria1';
      component.formulario.confirmarContrasena = 'Clave.EnMemoria1';
      inputClave.value = 'Clave.EnMemoria1';
      inputConfirmar.value = 'Clave.EnMemoria1';

      component.ngOnDestroy();

      expect(component.formulario.contrasena).toBe('');
      expect(component.formulario.confirmarContrasena).toBe('');
      expect(inputClave.value).toBe('');
      expect(inputConfirmar.value).toBe('');
    });

    it('R001-04 cancela las suscripciones de carga y de guardado al destruir el componente', () => {
      const cargaPendiente$ = new Subject<ApiResponse<ListaUsuariosData>>();
      const guardadoPendiente$ = new Subject<ApiResponse<UsuarioItem>>();

      (usuariosService.listar as jasmine.Spy).and.returnValue(cargaPendiente$.asObservable());
      spyOn(usuariosService, 'actualizar').and.returnValue(guardadoPendiente$.asObservable());

      component.cargarUsuarios();
      component.editarUsuario(USUARIOS_BASE[0]);
      component.formulario.contrasena = 'Nueva.Clave10';
      component.formulario.confirmarContrasena = 'Nueva.Clave10';
      component.onSubmit();

      expect(cargaPendiente$.observed).toBeTrue();
      expect(guardadoPendiente$.observed).toBeTrue();

      fixture.destroy();

      expect(cargaPendiente$.observed).toBeFalse();
      expect(guardadoPendiente$.observed).toBeFalse();

      guardadoPendiente$.next({
        success: true,
        data: { ...USUARIOS_BASE[0] },
      });
      expect(authService.cerrarSesionPorCambioDeClave).not.toHaveBeenCalled();
    });

    it('R001-04 no cierra la sesión si la sesión vigente cambió antes de llegar la respuesta del cambio de clave', () => {
      const guardadoPendiente$ = new Subject<ApiResponse<UsuarioItem>>();
      spyOn(usuariosService, 'actualizar').and.returnValue(guardadoPendiente$.asObservable());

      component.editarUsuario(USUARIOS_BASE[0]);
      component.formulario.contrasena = 'Nueva.Clave10';
      component.formulario.confirmarContrasena = 'Nueva.Clave10';
      component.onSubmit();

      // Antes de que responda el servidor, cambia la sesión activa (otro usuario o nuevo token)
      authService.idActual = 2;
      authService.tokenActual = 'token-usuario-2';

      guardadoPendiente$.next({
        success: true,
        data: { ...USUARIOS_BASE[0] },
      });

      expect(authService.cerrarSesionPorCambioDeClave).not.toHaveBeenCalled();
    });

    it('R001-05 descarta respuestas antiguas invertidas en búsqueda, filtro y paginación', () => {
      const respuestaAntigua$ = new Subject<ApiResponse<ListaUsuariosData>>();
      const respuestaNueva$ = new Subject<ApiResponse<ListaUsuariosData>>();

      let llamada = 0;
      (usuariosService.listar as jasmine.Spy).and.callFake(() => {
        llamada++;
        return llamada === 1 ? respuestaAntigua$.asObservable() : respuestaNueva$.asObservable();
      });

      // 1. Primera consulta (antigua)
      component.searchText = 'antigua';
      component.aplicarFiltros();
      expect(respuestaAntigua$.observed).toBeTrue();
      expect(component.cargando).toBeTrue();

      // 2. Segunda consulta (nueva): cancela la anterior y mantiene cargando=true
      component.searchText = 'nueva';
      component.estadoFiltro = 'activos';
      component.aplicarFiltros();
      expect(respuestaAntigua$.observed).toBeFalse();
      expect(respuestaNueva$.observed).toBeTrue();
      expect(component.cargando).toBeTrue();

      // 3. Llega primero la respuesta nueva
      respuestaNueva$.next({
        success: true,
        data: {
          data: [
            {
              id_usuario: 20,
              nombre_usuario: 'usuario_nuevo',
              id_rol: 2,
              activo: true,
            },
          ],
          totalItems: 1,
          totalPages: 1,
          currentPage: 1,
        },
      });
      respuestaNueva$.complete();

      expect(component.cargando).toBeFalse();
      expect(component.totalItems).toBe(1);
      expect(component.usuarios.map((u) => u.nombre_usuario)).toEqual(['usuario_nuevo']);

      // 4. Si se intentara emitir tardíamente en la antigua, no reemplaza los datos nuevos
      respuestaAntigua$.next({
        success: true,
        data: {
          data: [
            {
              id_usuario: 10,
              nombre_usuario: 'usuario_antiguo',
              id_rol: 1,
              activo: true,
            },
          ],
          totalItems: 50,
          totalPages: 5,
          currentPage: 1,
        },
      });
      respuestaAntigua$.complete();

      expect(component.totalItems).toBe(1);
      expect(component.usuarios.map((u) => u.nombre_usuario)).toEqual(['usuario_nuevo']);
    });
  });
});
