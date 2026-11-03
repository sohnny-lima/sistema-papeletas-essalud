import { finalize } from 'rxjs';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { BackendService } from '../services/backend.service';
import { AuthService } from '../services/auth.service';
import Swal from 'sweetalert2';

import { FormsModule } from '@angular/forms';
import { CentroFormComponent } from '../centros/centro-form/centro-form.component';
import { Centro, ordenarCentros } from '../centros/centro-nombre';

interface Lugar {
  id_lugar?: number;
  nombre_ambiente: string;
  dependencia: string;
  centro?: string;       // nombre del centro (lo envía el backend en el listado)
  id_centro: number;     // FK
}

type CampoLugar = 'nombre_ambiente' | 'dependencia' | 'id_centro';

@Component({
    selector: 'app-lugares',
    templateUrl: './lugares.component.html',
    styleUrls: ['./lugares.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, CentroFormComponent]
})
export class LugaresComponent implements OnInit, OnDestroy {
  lugares: Lugar[] = [];
  centros: Centro[] = [];

  currentPage = 1;
  itemsPerPage = 10;
  totalItems = 0;
  totalPages = 0;
  currentStartIndex = 0;
  currentEndIndex = 0;

  // Filtros
  searchText = '';
  selectedCategory = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Modelo para crear/editar un lugar
  lugar: Lugar = this.createEmptyLugar();

  // Indicador de carga
  isLoading = false;

  // Formulario: errores en línea, error del servidor y envío en curso
  errores: Partial<Record<CampoLugar, string>> = {};
  errorFormulario = '';
  guardando = false;

  // Crear, editar y eliminar lugares (y crear centros) es solo de administradores (A8).
  // La interfaz lo refleja; quien protege es la API (verifyAdmin responde 403).
  isAdmin = false;
  mostrarNuevoCentro = false;

  // Para poder usar Math.min en la vista
  Math = Math;

  @ViewChild('lugarModalRef', { static: true }) lugarModalRef?: ElementRef<HTMLElement>;
  @ViewChild('botonNuevoCentro') botonNuevoCentro?: ElementRef<HTMLButtonElement>;
  @ViewChild(CentroFormComponent) formularioCentro?: CentroFormComponent;

  /** Mientras se guarda el lugar o un centro nuevo, el modal no se cierra: así llega la respuesta. */
  private readonly alIntentarCerrar = (evento: Event) => {
    if (this.guardando || this.formularioCentro?.guardando) {
      evento.preventDefault();
    }
  };

  // Foco: al abrir, al primer campo; al cerrar, de vuelta al botón que abrió el modal.
  private disparador: HTMLElement | null = null;
  private readonly alMostrarModal = () => document.getElementById('nombreAmbiente')?.focus();

  private readonly alOcultarModal = () => {
    this.mostrarNuevoCentro = false;
    this.errores = {};
    this.errorFormulario = '';
    if (this.disparador?.isConnected) this.disparador.focus();
    this.disparador = null;
  };

  constructor(private backendService: BackendService, private authService: AuthService) {}

  ngOnInit(): void {
    this.isAdmin = this.authService.isAdmin();
    this.getCentros();
    this.getLugares();
    const modal = this.lugarModalRef?.nativeElement;
    modal?.addEventListener('shown.bs.modal', this.alMostrarModal);
    modal?.addEventListener('hide.bs.modal', this.alIntentarCerrar);
    modal?.addEventListener('hidden.bs.modal', this.alOcultarModal);
  }

  ngOnDestroy(): void {
    const modal = this.lugarModalRef?.nativeElement;
    modal?.removeEventListener('shown.bs.modal', this.alMostrarModal);
    modal?.removeEventListener('hide.bs.modal', this.alIntentarCerrar);
    modal?.removeEventListener('hidden.bs.modal', this.alOcultarModal);
    const bootstrap = (window as any).bootstrap;
    if (modal && bootstrap?.Modal) {
      bootstrap.Modal.getInstance(modal)?.dispose();
    }
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
  }

  // Crea un objeto vacío de Lugar
  private createEmptyLugar(): Lugar {
    return {
      nombre_ambiente: '',
      dependencia: '',
      id_centro: 0
    };
  }

  /** Texto de búsqueda con el que se pidió la lista actual (no el que se está escribiendo). */
  filtroAplicado = '';

  get hayFiltro(): boolean {
    return !!this.filtroAplicado;
  }

  // Aplicar el filtro reiniciando la paginación
  applyFilter(): void {
    this.currentPage = 1;
    this.getLugares();
  }

  onSearchInput(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.applyFilter(), 300);
  }

  clearSearch(): void {
    this.searchText = '';
    this.selectedCategory = '';
    this.applyFilter();
  }

  // Llamada al back-end con paginación y filtros
  getLugares(): void {
    this.isLoading = true;
    this.filtroAplicado = this.searchText.trim();
    this.backendService.getLugares(
      this.currentPage,
      this.itemsPerPage,
      this.selectedCategory,
      this.searchText
    )
    .pipe(finalize(() => { this.isLoading = false; })).subscribe({
      next: (response: any) => {
        this.isLoading = false;
        this.lugares = response.data.data;
        this.totalItems = response.data.totalItems;
        this.updatePagination();
      },
      error: () => {
        this.isLoading = false;
        this.showErrorAlert('Error de conexión con el servidor');
      }
    });
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
    this.currentStartIndex = this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
    this.currentEndIndex = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
  }

  // Obtener centros asistenciales (para el selector del formulario)
  getCentros(): void {
    this.backendService.getCentros().subscribe({
      next: (res: any) => {
        const lista = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        this.centros = ordenarCentros(lista);
      },
      error: () => this.showErrorAlert('Error al cargar centros asistenciales')
    });
  }

  // Calcular el número total de páginas
  getTotalPages(): number {
    return this.totalPages;
  }

  nextPage(): void {
    if (this.currentPage < this.getTotalPages()) {
      this.currentPage++;
      this.getLugares();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getLugares();
    }
  }

  goToFirstPage(): void {
    if (this.currentPage !== 1) {
      this.currentPage = 1;
      this.getLugares();
    }
  }

  goToLastPage(): void {
    const lastPage = this.getTotalPages();
    if (this.currentPage !== lastPage) {
      this.currentPage = lastPage;
      this.getLugares();
    }
  }

  // Resetear el formulario (crear nuevo lugar)
  resetForm(): void {
    this.lugar = this.createEmptyLugar();
    this.errores = {};
    this.errorFormulario = '';
    this.mostrarNuevoCentro = false;
  }

  nuevoLugar(): void {
    if (!this.isAdmin) return;
    this.resetForm();
    this.openModal();
  }

  // Editar un lugar (abre el modal con datos cargados)
  editLugar(lugar: Lugar): void {
    if (!this.isAdmin) return;
    this.lugar = { ...lugar, id_centro: Number(lugar.id_centro) || 0 };
    this.errores = {};
    this.errorFormulario = '';
    this.mostrarNuevoCentro = false;
    this.openModal();
  }

  // Eliminar un lugar
  deleteLugar(id_lugar: number, nombre = ''): void {
    if (!this.isAdmin) return;
    Swal.fire({
      title: nombre ? `¿Eliminar el lugar «${nombre}»?` : '¿Eliminar este lugar?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar lugar',
      cancelButtonText: 'Cancelar',
      focusCancel: true,
      customClass: { popup: 'es-alert' }
    }).then((result) => {
      if (result.isConfirmed) {
        this.backendService.deleteLugar(id_lugar).subscribe({
          next: () => {
            this.getLugares();
            this.showSuccessAlert('Lugar eliminado.');
          },
          error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'No se pudo eliminar el lugar.'))
        });
      }
    });
  }

  // Abrir el modal (Bootstrap JS)
  openModal(): void {
    this.disparador = document.activeElement as HTMLElement | null;
    const modalElement = this.lugarModalRef?.nativeElement;
    const bootstrap = (window as any).bootstrap;
    if (modalElement && bootstrap?.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalElement, {
        backdrop: 'static',
        keyboard: true
      }).show();
    }
  }

  // ---- Alta de centro desde el formulario ----

  abrirNuevoCentro(): void {
    if (!this.isAdmin) return;
    this.mostrarNuevoCentro = true;
  }

  cerrarNuevoCentro(): void {
    this.mostrarNuevoCentro = false;
    setTimeout(() => this.botonNuevoCentro?.nativeElement.focus());
  }

  /** Añade el centro creado, lo selecciona y conserva el resto de datos del lugar. */
  onCentroCreado(centro: Centro): void {
    this.centros = ordenarCentros([
      ...this.centros.filter((c) => c.id_centro !== centro.id_centro),
      centro
    ]);
    this.lugar = { ...this.lugar, id_centro: centro.id_centro };
    this.limpiarError('id_centro');
    this.mostrarNuevoCentro = false;
    this.showSuccessAlert(`Centro «${centro.nombre_centro}» creado y seleccionado.`);
    setTimeout(() => document.getElementById('centro')?.focus());
  }

  limpiarError(campo: CampoLugar): void {
    if (this.errores[campo]) {
      this.errores = { ...this.errores, [campo]: '' };
    }
  }

  // Guardar (crear/editar) un lugar
  onSubmit(): void {
    if (this.guardando || !this.isAdmin) {
      return;
    }
    this.errorFormulario = '';
    this.normalizeLugar();
    if (!this.validateLugar()) {
      return;
    }

    const esEdicion = !!this.lugar.id_lugar;
    const nombre = this.lugar.nombre_ambiente;
    const peticion = esEdicion
      ? this.backendService.updateLugar(this.lugar.id_lugar as number, this.lugar)
      : this.backendService.createLugar(this.lugar);

    this.guardando = true;
    peticion.pipe(finalize(() => { this.guardando = false; })).subscribe({
      next: () => {
        this.guardando = false;
        this.getLugares();
        this.closeModal();
        this.showSuccessAlert(esEdicion ? `Lugar «${nombre}» actualizado.` : `Lugar «${nombre}» creado.`);
        this.resetForm();
      },
      error: (error) => {
        this.guardando = false;
        this.errorFormulario = this.getErrorMessage(
          error,
          esEdicion ? 'No se pudo actualizar el lugar.' : 'No se pudo crear el lugar.'
        );
      }
    });
  }

  private normalizeLugar(): void {
    this.lugar = {
      ...this.lugar,
      nombre_ambiente: this.normalizeText(this.lugar.nombre_ambiente),
      dependencia: this.normalizeText(this.lugar.dependencia),
      id_centro: Number(this.lugar.id_centro) || 0
    };
  }

  private validateLugar(): boolean {
    const errores: Partial<Record<CampoLugar, string>> = {};
    const { nombre_ambiente, dependencia, id_centro } = this.lugar;

    if (!nombre_ambiente) {
      errores.nombre_ambiente = 'Escriba el nombre del ambiente.';
    } else if (nombre_ambiente.length < 3) {
      errores.nombre_ambiente = 'El nombre del ambiente debe tener al menos 3 caracteres.';
    }

    if (!dependencia) {
      errores.dependencia = 'Escriba la dependencia.';
    } else if (dependencia.length < 3) {
      errores.dependencia = 'La dependencia debe tener al menos 3 caracteres.';
    }

    if (!id_centro) {
      errores.id_centro = this.isAdmin
        ? 'Seleccione un centro asistencial o cree uno con «Nuevo centro».'
        : 'Seleccione un centro asistencial.';
    }

    this.errores = errores;
    const primero = (['nombre_ambiente', 'dependencia', 'id_centro'] as CampoLugar[]).find((c) => errores[c]);
    if (primero) {
      const ids: Record<CampoLugar, string> = { nombre_ambiente: 'nombreAmbiente', dependencia: 'dependencia', id_centro: 'centro' };
      setTimeout(() => document.getElementById(ids[primero])?.focus());
      return false;
    }
    return true;
  }

  private normalizeText(value: string | null | undefined): string {
    return (value || '').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  // Método auxiliar para obtener el nombre del centro por id
  getCentroNombre(id_centro: number): string {
    const centro = this.centros.find(c => c.id_centro === id_centro);
    return centro ? centro.nombre_centro : 'Desconocido';
  }

  // Alertas de éxito
  showSuccessAlert(message: string): void {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: message,
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      customClass: { popup: 'es-toast' }
    });
  }

  // Alertas de error (carga de la lista y eliminación)
  showErrorAlert(message: string): void {
    Swal.fire({
      icon: 'error',
      title: 'No se pudo completar la operación',
      text: message,
      confirmButtonText: 'Entendido',
      customClass: { popup: 'es-alert' }
    });
  }

  private closeModal(): void {
    const modalElement = this.lugarModalRef?.nativeElement;
    const bootstrap = (window as any).bootstrap;
    const modal = modalElement && bootstrap?.Modal ? bootstrap.Modal.getInstance(modalElement) : null;
    modal?.hide();
  }

  private getErrorMessage(error: any, fallback: string): string {
    if (error?.status === 0) {
      return 'No se pudo conectar con el servidor. Compruebe la conexión e inténtelo de nuevo.';
    }
    if (error?.status === 403) {
      // Por ejemplo, si el rol cambió durante la sesión
      return 'No tiene permisos para modificar lugares. Solo un administrador puede hacerlo.';
    }
    return error?.error?.message || error?.error?.detail || fallback;
  }
}
