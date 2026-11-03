import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, finalize, takeUntil } from 'rxjs';
import Swal from 'sweetalert2';
import { AuthService } from '../services/auth.service';
import {
  ActualizarUsuarioPayload,
  CrearUsuarioPayload,
  EstadoFiltroUsuario,
  RolItem,
  UsuarioItem,
  UsuariosService,
  formatearNombreRol,
} from '../services/usuarios.service';

export type CampoUsuario = 'nombre_usuario' | 'id_rol' | 'contrasena' | 'confirmarContrasena';

interface FormularioUsuario {
  nombre_usuario: string;
  id_rol: number;
  contrasena: string;
  confirmarContrasena: string;
}

const ROLES_POR_DEFECTO: RolItem[] = [
  { id_rol: 1, nombre_rol: 'ADMINISTRADOR' },
  { id_rol: 2, nombre_rol: 'USUARIO' },
];

/** Administración de cuentas de usuario (solo administradores: AdminGuard y API). */
@Component({
  selector: 'app-usuarios',
  templateUrl: './usuarios.component.html',
  styleUrls: ['./usuarios.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [FormsModule],
})
export class UsuariosComponent implements OnInit, OnDestroy {
  usuarios: UsuarioItem[] = [];
  roles: RolItem[] = [...ROLES_POR_DEFECTO];

  longitudMinimaClave = 10;
  longitudMaximaBytesClave = 72;

  cargando = false;
  errorCarga = '';

  searchText = '';
  estadoFiltro: EstadoFiltroUsuario = 'todos';
  filtroAplicado = '';
  estadoAplicado: EstadoFiltroUsuario = 'todos';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly destruido$ = new Subject<void>();
  private suscripcionListado: Subscription | null = null;
  private secuenciaCarga = 0;

  currentPage = 1;
  pageSize = 10;
  totalItems = 0;
  totalPages = 0;
  currentStartIndex = 0;
  currentEndIndex = 0;

  usuarioEnEdicion: UsuarioItem | null = null;
  formulario: FormularioUsuario = this.crearFormularioVacio();
  mostrarContrasena = false;
  mostrarConfirmacion = false;

  errores: Partial<Record<CampoUsuario, string>> = {};
  errorFormulario = '';
  guardando = false;

  @ViewChild('usuarioModalRef', { static: true }) usuarioModalRef?: ElementRef<HTMLElement>;

  private disparador: HTMLElement | null = null;

  private readonly alMostrarModal = () => {
    document.getElementById('nombreUsuarioModal')?.focus();
  };

  /** Mientras se guarda, el modal no se cierra (X, Escape o Cancelar). */
  private readonly alIntentarCerrar = (evento: Event) => {
    if (this.guardando) {
      evento.preventDefault();
    }
  };

  private readonly alOcultarModal = () => {
    this.limpiarCamposContrasena();
    this.errores = {};
    this.errorFormulario = '';
    if (this.disparador?.isConnected) {
      this.disparador.focus();
    }
    this.disparador = null;
  };

  constructor(
    private readonly usuariosService: UsuariosService,
    private readonly authService: AuthService
  ) {}

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarUsuarios();
    const modal = this.elementoModal();
    modal?.addEventListener('shown.bs.modal', this.alMostrarModal);
    modal?.addEventListener('hide.bs.modal', this.alIntentarCerrar);
    modal?.addEventListener('hidden.bs.modal', this.alOcultarModal);
  }

  ngOnDestroy(): void {
    this.guardando = false;
    this.limpiarCamposContrasena();
    this.suscripcionListado?.unsubscribe();
    this.suscripcionListado = null;
    this.destruido$.next();
    this.destruido$.complete();

    const modal = this.elementoModal();
    if (modal) {
      modal.removeEventListener('shown.bs.modal', this.alMostrarModal);
      modal.removeEventListener('hide.bs.modal', this.alIntentarCerrar);
      modal.removeEventListener('hidden.bs.modal', this.alOcultarModal);
      const bootstrap = (window as any).bootstrap;
      if (bootstrap?.Modal) {
        try {
          const instancia = bootstrap.Modal.getInstance(modal);
          if (instancia) {
            if (instancia._isTransitioning) {
              this.completarTransicionesModal(modal, instancia);
            }
            if (instancia._isShown) {
              instancia.hide?.();
            }
            if (instancia._isTransitioning) {
              this.completarTransicionesModal(modal, instancia);
            }
            instancia.dispose?.();
          }
        } catch {
          // Ignorar si el DOM ya fue desmontado
        }
      }
    }
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    if (this.focusTimer) {
      clearTimeout(this.focusTimer);
      this.focusTimer = null;
    }
  }

  get esEdicion(): boolean {
    return this.usuarioEnEdicion !== null;
  }

  get editandoCuentaPropia(): boolean {
    return this.esCuentaPropia(this.usuarioEnEdicion);
  }

  get tieneNuevaContrasena(): boolean {
    return this.formulario.contrasena.length > 0;
  }

  get hayFiltroActivo(): boolean {
    return this.filtroAplicado.trim() !== '' || this.estadoAplicado !== 'todos';
  }

  get hayControlesFiltro(): boolean {
    return (
      this.searchText.trim() !== '' ||
      this.estadoFiltro !== 'todos' ||
      this.hayFiltroActivo
    );
  }

  get resumenTotal(): string {
    if (this.hayFiltroActivo) {
      return `${this.totalItems} ${this.totalItems === 1 ? 'resultado' : 'resultados'}`;
    }
    return `${this.totalItems} ${this.totalItems === 1 ? 'cuenta registrada' : 'cuentas registradas'}`;
  }

  esCuentaPropia(usuario: UsuarioItem | null | undefined): boolean {
    if (!usuario) return false;
    const idActual = this.authService.getIdUsuario();
    return idActual !== null && Number(usuario.id_usuario) === idActual;
  }

  etiquetaRol(usuario: UsuarioItem): string {
    return formatearNombreRol(usuario.id_rol, usuario.rol, usuario.rolNombre);
  }

  etiquetaOpcionRol(rol: RolItem): string {
    return formatearNombreRol(rol.id_rol, rol.nombre_rol);
  }

  esRolAdmin(usuario: UsuarioItem): boolean {
    return Number(usuario.id_rol) === 1 || usuario.rol === 'admin';
  }

  formatearFechaAlta(fecha?: string | null): string {
    if (!fecha) return '—';
    const texto = String(fecha).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      const [anio, mes, dia] = texto.split('-');
      return `${dia}/${mes}/${anio}`;
    }
    const d = new Date(texto);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  }

  describedBy(...ids: Array<string | null | undefined | false>): string | null {
    const validos = ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
    return validos.length > 0 ? validos.join(' ') : null;
  }

  cargarCatalogos(): void {
    this.usuariosService
      .roles()
      .pipe(takeUntil(this.destruido$))
      .subscribe({
        next: (res) => {
          if (Array.isArray(res?.data) && res.data.length > 0) {
            this.roles = [...res.data].sort((a, b) => Number(a.id_rol) - Number(b.id_rol));
          }
        },
        error: () => {
          // Conserva ROLES_POR_DEFECTO (1: Administrador, 2: Usuario)
        },
      });

    this.usuariosService
      .politicaContrasena()
      .pipe(takeUntil(this.destruido$))
      .subscribe({
        next: (res) => {
          const min = Number(res?.data?.longitudMinima);
          const max = Number(res?.data?.longitudMaximaBytes);
          if (Number.isInteger(min) && min > 0) this.longitudMinimaClave = min;
          if (Number.isInteger(max) && max > 0) this.longitudMaximaBytesClave = max;
        },
        error: () => {
          // Conserva valores por defecto (10 caracteres, 72 bytes)
        },
      });
  }

  cargarUsuarios(): void {
    this.suscripcionListado?.unsubscribe();
    const secuencia = ++this.secuenciaCarga;
    this.cargando = true;
    this.errorCarga = '';
    this.filtroAplicado = this.searchText.trim();
    this.estadoAplicado = this.estadoFiltro;

    this.suscripcionListado = this.usuariosService
      .listar({
        search: this.filtroAplicado,
        estado: this.estadoAplicado,
        page: this.currentPage,
        pageSize: this.pageSize,
      })
      .pipe(
        takeUntil(this.destruido$),
        finalize(() => {
          if (secuencia === this.secuenciaCarga) {
            this.cargando = false;
          }
        })
      )
      .subscribe({
        next: (res) => {
          if (secuencia !== this.secuenciaCarga) return;
          this.cargando = false;
          const payload = res?.data;
          const lista = Array.isArray(payload?.data) ? payload.data : [];
          const total = Number(payload?.totalItems) || 0;
          const paginas =
            Number(payload?.totalPages) || (total > 0 ? Math.ceil(total / this.pageSize) : 0);

          // Contrato §7.15: si la página actual queda vacía tras desactivar/filtrar, retrocede a la última válida.
          if (lista.length === 0 && total > 0 && this.currentPage > 1) {
            this.currentPage = Math.max(1, paginas || this.currentPage - 1);
            this.cargarUsuarios();
            return;
          }

          this.usuarios = lista;
          this.totalItems = total;
          this.totalPages = paginas;
          this.actualizarPaginacion();
        },
        error: (err) => {
          if (secuencia !== this.secuenciaCarga) return;
          this.cargando = false;
          if (err?.status === 403) {
            this.errorCarga = 'No tiene permisos para administrar usuarios.';
          } else {
            this.errorCarga =
              err?.error?.message || 'No se pudo cargar la lista de usuarios.';
          }
        },
      });
  }

  private actualizarPaginacion(): void {
    this.totalPages =
      this.totalItems === 0 ? 0 : Math.ceil(this.totalItems / this.pageSize);
    this.currentStartIndex =
      this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
    this.currentEndIndex = Math.min(this.currentPage * this.pageSize, this.totalItems);
  }

  onSearchInput(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => {
      this.aplicarFiltros();
    }, 300);
  }

  aplicarFiltros(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.currentPage = 1;
    this.cargarUsuarios();
  }

  restablecerFiltros(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.searchText = '';
    this.estadoFiltro = 'todos';
    this.currentPage = 1;
    this.cargarUsuarios();
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.cargarUsuarios();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.cargarUsuarios();
    }
  }

  goToFirstPage(): void {
    if (this.currentPage !== 1) {
      this.currentPage = 1;
      this.cargarUsuarios();
    }
  }

  goToLastPage(): void {
    if (this.totalPages > 0 && this.currentPage !== this.totalPages) {
      this.currentPage = this.totalPages;
      this.cargarUsuarios();
    }
  }

  nuevoUsuario(): void {
    this.usuarioEnEdicion = null;
    this.formulario = this.crearFormularioVacio();
    this.errores = {};
    this.errorFormulario = '';
    this.mostrarContrasena = false;
    this.mostrarConfirmacion = false;
    this.abrirModal();
  }

  editarUsuario(usuario: UsuarioItem): void {
    this.usuarioEnEdicion = { ...usuario };
    this.formulario = {
      nombre_usuario: usuario.nombre_usuario,
      id_rol: Number(usuario.id_rol) || 2,
      contrasena: '',
      confirmarContrasena: '',
    };
    this.errores = {};
    this.errorFormulario = '';
    this.mostrarContrasena = false;
    this.mostrarConfirmacion = false;
    this.abrirModal();
  }

  limpiarError(campo: CampoUsuario): void {
    if (this.errores[campo]) {
      this.errores = { ...this.errores, [campo]: '' };
    }
  }

  onCambioContrasena(): void {
    this.limpiarError('contrasena');
    if (this.errores.confirmarContrasena) {
      this.limpiarError('confirmarContrasena');
    }
  }

  validarFormulario(): boolean {
    const errores: Partial<Record<CampoUsuario, string>> = {};
    const nombre = this.formulario.nombre_usuario ?? '';
    const idRol = Number(this.formulario.id_rol);
    const clave = this.formulario.contrasena ?? '';
    const confirmacion = this.formulario.confirmarContrasena ?? '';

    const esRenombrado =
      !this.esEdicion || nombre !== this.usuarioEnEdicion?.nombre_usuario;

    if (!nombre || !nombre.trim()) {
      errores.nombre_usuario = 'Escriba el nombre de usuario.';
    } else if (esRenombrado) {
      if (nombre !== nombre.trim()) {
        errores.nombre_usuario =
          'El nombre de usuario no puede tener espacios al principio ni al final.';
      } else if (nombre.length < 3 || nombre.length > 50) {
        errores.nombre_usuario =
          'El nombre de usuario debe tener entre 3 y 50 caracteres.';
      } else if (!/^[A-Za-z0-9._-]+$/.test(nombre)) {
        errores.nombre_usuario =
          'Use solo letras sin tildes, números, punto (.), guion (-) o guion bajo (_).';
      }
    }

    if (!Number.isInteger(idRol) || idRol <= 0) {
      errores.id_rol = 'Seleccione un rol válido.';
    }

    const requiereClave =
      !this.esEdicion || clave.length > 0 || confirmacion.length > 0;

    if (requiereClave) {
      if (!clave) {
        errores.contrasena = 'Escriba una contraseña.';
      } else if (clave.length < this.longitudMinimaClave) {
        errores.contrasena = `La contraseña debe tener al menos ${this.longitudMinimaClave} caracteres.`;
      } else if (
        new TextEncoder().encode(clave).length > this.longitudMaximaBytesClave
      ) {
        errores.contrasena = `La contraseña no puede superar ${this.longitudMaximaBytesClave} bytes UTF-8.`;
      } else if (!/\p{L}/u.test(clave) || !/[0-9]/.test(clave)) {
        errores.contrasena =
          'La contraseña debe incluir al menos una letra y un número.';
      } else if (
        nombre.trim() &&
        clave.toLocaleLowerCase() === nombre.trim().toLocaleLowerCase()
      ) {
        errores.contrasena =
          'La contraseña debe ser distinta del nombre de usuario.';
      }

      if (!confirmacion) {
        errores.confirmarContrasena = 'Confirme la contraseña.';
      } else if (clave !== confirmacion) {
        errores.confirmarContrasena = 'Las contraseñas no coinciden.';
      }
    }

    this.errores = errores;
    const orden: CampoUsuario[] = [
      'nombre_usuario',
      'id_rol',
      'contrasena',
      'confirmarContrasena',
    ];
    const primero = orden.find((c) => errores[c]);
    if (primero) {
      const ids: Record<CampoUsuario, string> = {
        nombre_usuario: 'nombreUsuarioModal',
        id_rol: 'rolUsuarioModal',
        contrasena: 'contrasenaUsuarioModal',
        confirmarContrasena: 'confirmarContrasenaModal',
      };
      this.enfocarDiferido(ids[primero]);
      return false;
    }
    return true;
  }

  onSubmit(): void {
    if (this.guardando) return;
    this.errorFormulario = '';
    if (!this.validarFormulario()) return;

    const esEdicion = this.esEdicion;
    const cuentaPropia = this.editandoCuentaPropia;
    const cambiaClave = this.formulario.contrasena.length > 0;
    const nombre = this.formulario.nombre_usuario;
    const idRol = Number(this.formulario.id_rol);
    const idUsuarioInicial = this.authService.getIdUsuario();
    const tokenInicial =
      typeof this.authService.getToken === 'function' ? this.authService.getToken() : null;

    this.guardando = true;

    const peticion = esEdicion
      ? this.usuariosService.actualizar(
          this.usuarioEnEdicion!.id_usuario,
          this.construirPayloadActualizacion(nombre, idRol, cambiaClave)
        )
      : this.usuariosService.crear(
          this.construirPayloadCreacion(nombre, idRol, this.formulario.contrasena)
        );

    peticion
      .pipe(
        takeUntil(this.destruido$),
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: () => {
          this.guardando = false;
          this.limpiarCamposContrasena();
          // Contrato §7.13 y R001-02/R001-04: al cambiar la propia contraseña se cierra el modal
          // y solo se cierra la sesión si sigue vigente la que inició el cambio.
          if (esEdicion && cuentaPropia && cambiaClave) {
            this.cerrarModal(true, () => {
              if (this.sigueMismaSesion(idUsuarioInicial, tokenInicial)) {
                this.authService.cerrarSesionPorCambioDeClave();
              }
            });
            return;
          }

          this.cerrarModal();

          if (esEdicion && cuentaPropia && this.sigueMismaSesion(idUsuarioInicial, tokenInicial)) {
            this.authService.refrescarSesion();
          }

          this.cargarUsuarios();
          this.showSuccessAlert(
            esEdicion
              ? `Usuario «${nombre}» actualizado.`
              : `Usuario «${nombre}» creado.`
          );
        },
        error: (err) => {
          this.guardando = false;
          this.procesarErrorGuardado(err, esEdicion);
        },
      });
  }

  private sigueMismaSesion(
    idUsuarioInicial: number | null,
    tokenInicial: string | null
  ): boolean {
    const idActual = this.authService.getIdUsuario();
    if (idUsuarioInicial === null || idActual !== idUsuarioInicial) {
      return false;
    }
    if (typeof this.authService.getToken === 'function') {
      const tokenActual = this.authService.getToken();
      if (tokenInicial !== null && tokenActual !== tokenInicial) {
        return false;
      }
    }
    return true;
  }

  private construirPayloadCreacion(
    nombre: string,
    idRol: number,
    contrasena: string
  ): CrearUsuarioPayload {
    return {
      nombre_usuario: nombre,
      id_rol: idRol,
      contrasena,
    };
  }

  private construirPayloadActualizacion(
    nombre: string,
    idRol: number,
    cambiaClave: boolean
  ): ActualizarUsuarioPayload {
    const payload: ActualizarUsuarioPayload = {
      nombre_usuario: nombre,
      id_rol: idRol,
    };
    if (cambiaClave) {
      payload.contrasena = this.formulario.contrasena;
    }
    return payload;
  }

  private procesarErrorGuardado(err: any, esEdicion: boolean): void {
    const status = err?.status;
    const mensajeServidor: string = err?.error?.message || '';

    if (status === 409) {
      const textoMin = mensajeServidor.toLowerCase();
      if (textoMin.includes('nombre') || textoMin.includes('existe')) {
        this.errores = {
          ...this.errores,
          nombre_usuario: mensajeServidor || 'Ya existe un usuario con ese nombre.',
        };
        this.enfocarDiferido('nombreUsuarioModal');
        return;
      }
      this.errorFormulario =
        mensajeServidor || 'No se pudo completar la operación por un conflicto.';
      return;
    }

    if (status === 403) {
      this.errorFormulario = 'No tiene permisos para administrar usuarios.';
      return;
    }

    if (status === 0) {
      this.errorFormulario =
        'No se pudo conectar con el servidor. Compruebe la conexión e inténtelo de nuevo.';
      return;
    }

    this.errorFormulario =
      mensajeServidor ||
      (esEdicion
        ? 'No se pudo actualizar el usuario.'
        : 'No se pudo crear el usuario.');
  }

  confirmarCambioEstado(usuario: UsuarioItem): void {
    if (this.esCuentaPropia(usuario)) return;
    const nuevoEstado = !usuario.activo;
    const titulo = nuevoEstado
      ? `¿Reactivar la cuenta «${usuario.nombre_usuario}»?`
      : `¿Desactivar la cuenta «${usuario.nombre_usuario}»?`;
    const texto = nuevoEstado
      ? 'El usuario podrá volver a iniciar sesión en el sistema con su rol asignado.'
      : 'Se cerrarán sus sesiones activas y no podrá iniciar sesión, pero se conservará su historial.';

    Swal.fire({
      titleText: titulo,
      text: texto,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: nuevoEstado ? 'Reactivar cuenta' : 'Desactivar cuenta',
      cancelButtonText: 'Cancelar',
      focusCancel: true,
      customClass: { popup: 'es-alert' },
    }).then((resultado) => {
      if (resultado.isConfirmed) {
        this.ejecutarCambioEstado(usuario, nuevoEstado);
      }
    });
  }

  ejecutarCambioEstado(usuario: UsuarioItem, nuevoEstado: boolean): void {
    this.usuariosService
      .cambiarEstado(usuario.id_usuario, nuevoEstado)
      .pipe(takeUntil(this.destruido$))
      .subscribe({
        next: () => {
          this.cargarUsuarios();
          this.showSuccessAlert(
            nuevoEstado
              ? `Cuenta «${usuario.nombre_usuario}» reactivada.`
              : `Cuenta «${usuario.nombre_usuario}» desactivada.`
          );
        },
        error: (err) => {
          const mensaje =
            err?.status === 403
              ? 'No tiene permisos para administrar usuarios.'
              : err?.error?.message || 'No se pudo cambiar el estado de la cuenta.';
          this.showErrorAlert(mensaje);
        },
      });
  }

  showSuccessAlert(mensaje: string): void {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      titleText: mensaje,
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      customClass: { popup: 'es-toast' },
    });
  }

  showErrorAlert(mensaje: string): void {
    Swal.fire({
      icon: 'error',
      titleText: 'No se pudo completar la operación',
      text: mensaje,
      confirmButtonText: 'Entendido',
      customClass: { popup: 'es-alert' },
    });
  }

  private crearFormularioVacio(): FormularioUsuario {
    return {
      nombre_usuario: '',
      id_rol: 2,
      contrasena: '',
      confirmarContrasena: '',
    };
  }

  private limpiarCamposContrasena(): void {
    this.formulario.contrasena = '';
    this.formulario.confirmarContrasena = '';
    this.mostrarContrasena = false;
    this.mostrarConfirmacion = false;
    const modal = this.elementoModal();
    if (modal) {
      const inputClave = modal.querySelector<HTMLInputElement>('#contrasenaUsuarioModal');
      const inputConfirmar = modal.querySelector<HTMLInputElement>('#confirmarContrasenaModal');
      if (inputClave) {
        inputClave.value = '';
        inputClave.type = 'password';
      }
      if (inputConfirmar) {
        inputConfirmar.value = '';
        inputConfirmar.type = 'password';
      }
    }
  }

  private enfocarDiferido(idElemento: string): void {
    if (this.focusTimer) {
      clearTimeout(this.focusTimer);
    }
    this.focusTimer = setTimeout(() => {
      this.focusTimer = null;
      document.getElementById(idElemento)?.focus();
    });
  }

  private abrirModal(): void {
    this.disparador = document.activeElement as HTMLElement | null;
    const elemento = this.elementoModal();
    const bootstrap = (window as any).bootstrap;
    if (elemento && bootstrap?.Modal) {
      bootstrap.Modal.getOrCreateInstance(elemento, {
        backdrop: 'static',
        keyboard: true,
      }).show();
    }
  }

  cerrarModal(inmediato = false, alOcultar?: () => void): void {
    this.limpiarCamposContrasena();
    const elemento = this.elementoModal();
    const bootstrap = (window as any).bootstrap;
    if (!elemento || !bootstrap?.Modal) {
      alOcultar?.();
      return;
    }

    const instancia = bootstrap.Modal.getInstance(elemento);
    if (!instancia) {
      alOcultar?.();
      return;
    }

    let notificado = false;
    const finalizar = () => {
      if (notificado) return;
      notificado = true;
      elemento.removeEventListener('hidden.bs.modal', finalizar);
      alOcultar?.();
    };

    if (alOcultar) {
      elemento.addEventListener('hidden.bs.modal', finalizar, { once: true });
    }

    if (instancia._isShown && instancia._isTransitioning) {
      this.completarTransicionesModal(elemento, instancia);
    }

    instancia.hide?.();

    if (inmediato) {
      this.completarTransicionesModal(elemento, instancia);
      finalizar();
    }
  }

  /**
   * Completa de forma síncrona las transiciones pendientes de Bootstrap Modal y su backdrop
   * para evitar callbacks diferidos sobre elementos nulos tras navegar o destruir la vista.
   */
  private completarTransicionesModal(elemento: HTMLElement, instancia: any): void {
    const dialogo = elemento.querySelector('.modal-dialog');
    const backdropEl = instancia?._backdrop?._element as HTMLElement | null | undefined;
    if (backdropEl) {
      backdropEl.dispatchEvent(new Event('transitionend'));
    }
    if (dialogo) {
      dialogo.dispatchEvent(new Event('transitionend'));
    }
    elemento.dispatchEvent(new Event('transitionend'));
    const backdropActual =
      (instancia?._backdrop?._element as HTMLElement | null | undefined) ?? backdropEl;
    if (backdropActual) {
      backdropActual.dispatchEvent(new Event('transitionend'));
    }
  }

  private elementoModal(): HTMLElement | null {
    return this.usuarioModalRef?.nativeElement ?? null;
  }
}
