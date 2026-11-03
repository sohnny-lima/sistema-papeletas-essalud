import { finalize } from 'rxjs';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, ChangeDetectionStrategy } from '@angular/core';

import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { BackendService } from '../services/backend.service';
import { CentroFormComponent } from './centro-form/centro-form.component';
import { Centro, normalizarNombreCentro, ordenarCentros } from './centro-nombre';

/** Administración de centros asistenciales (solo administradores: AdminGuard y API). */
@Component({
    selector: 'app-centros',
    imports: [FormsModule, CentroFormComponent],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './centros.component.html'
})
export class CentrosComponent implements OnInit, OnDestroy {
  centros: Centro[] = [];
  cargando = false;
  errorCarga = '';
  filtro = '';

  /** Centro abierto en el modal (null = alta). */
  centroEnEdicion: Centro | null = null;
  /** El formulario se crea al abrir el modal y se destruye al cerrarlo (estado limpio). */
  formularioAbierto = false;

  @ViewChild(CentroFormComponent) formulario?: CentroFormComponent;
  @ViewChild('modalCentro', { static: true }) modalRef?: ElementRef<HTMLElement>;

  private disparador: HTMLElement | null = null;
  private readonly alMostrarModal = () => this.formulario?.enfocar();
  /** Mientras se guarda, el modal no se cierra (X, Escape o Cancelar): así llega la respuesta. */
  private readonly alIntentarCerrar = (evento: Event) => {
    if (this.formulario?.guardando) evento.preventDefault();
  };
  private readonly alOcultarModal = () => {
    this.formularioAbierto = false;
    this.disparador?.focus();
    this.disparador = null;
  };

  constructor(private backendService: BackendService) {}

  ngOnInit(): void {
    this.cargarCentros();
    const modal = this.elementoModal();
    modal?.addEventListener('shown.bs.modal', this.alMostrarModal);
    modal?.addEventListener('hide.bs.modal', this.alIntentarCerrar);
    modal?.addEventListener('hidden.bs.modal', this.alOcultarModal);
  }

  ngOnDestroy(): void {
    const modal = this.elementoModal();
    modal?.removeEventListener('shown.bs.modal', this.alMostrarModal);
    modal?.removeEventListener('hide.bs.modal', this.alIntentarCerrar);
    modal?.removeEventListener('hidden.bs.modal', this.alOcultarModal);
    this.instanciaModal()?.dispose?.();
  }

  get centrosFiltrados(): Centro[] {
    const texto = normalizarNombreCentro(this.filtro);
    if (!texto) return this.centros;
    return this.centros.filter((c) => normalizarNombreCentro(c.nombre_centro).includes(texto));
  }

  get resumen(): string {
    const total = this.centros.length;
    if (this.filtro.trim()) {
      const n = this.centrosFiltrados.length;
      return `${n} de ${total} ${total === 1 ? 'centro' : 'centros'}`;
    }
    return `${total} ${total === 1 ? 'centro registrado' : 'centros registrados'}`;
  }

  cargarCentros(): void {
    this.cargando = true;
    this.errorCarga = '';
    this.backendService.getCentros().pipe(finalize(() => { this.cargando = false; })).subscribe({
      next: (res: any) => {
        this.centros = ordenarCentros(Array.isArray(res?.data) ? res.data : []);
        this.cargando = false;
      },
      error: (err: any) => {
        this.cargando = false;
        this.errorCarga =
          err?.status === 403
            ? 'No tiene permisos para administrar centros asistenciales.'
            : 'No se pudo cargar la lista de centros asistenciales.';
      },
    });
  }

  limpiarFiltro(): void {
    this.filtro = '';
  }

  nuevoCentro(): void {
    this.centroEnEdicion = null;
    this.abrirModal();
  }

  editarCentro(centro: Centro): void {
    this.centroEnEdicion = { ...centro };
    this.abrirModal();
  }

  onGuardado(centro: Centro): void {
    const eraEdicion = !!this.centroEnEdicion;
    this.cerrarModal();
    this.cargarCentros();
    this.showSuccessAlert(
      eraEdicion
        ? `Centro «${centro.nombre_centro}» actualizado.`
        : `Centro «${centro.nombre_centro}» creado.`
    );
  }

  onCancelado(): void {
    this.cerrarModal();
  }

  showSuccessAlert(mensaje: string): void {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: mensaje,
      showConfirmButton: false,
      timer: 3500,
      timerProgressBar: true,
      customClass: { popup: 'es-toast' },
    });
  }

  private abrirModal(): void {
    this.disparador = document.activeElement as HTMLElement | null;
    this.formularioAbierto = true;
    const elemento = this.elementoModal();
    const bootstrap = (window as any).bootstrap;
    if (elemento && bootstrap?.Modal) {
      bootstrap.Modal.getOrCreateInstance(elemento, { backdrop: 'static', keyboard: true }).show();
    }
  }

  private cerrarModal(): void {
    this.instanciaModal()?.hide();
  }

  private elementoModal(): HTMLElement | null {
    return this.modalRef?.nativeElement ?? null;
  }

  private instanciaModal(): any {
    const elemento = this.elementoModal();
    const bootstrap = (window as any).bootstrap;
    return elemento && bootstrap?.Modal ? bootstrap.Modal.getInstance(elemento) : null;
  }
}
