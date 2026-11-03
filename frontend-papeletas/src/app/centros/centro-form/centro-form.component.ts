import { finalize } from 'rxjs';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { BackendService } from '../../services/backend.service';
import { Centro, MAX_NOMBRE_CENTRO, normalizarNombreCentro } from '../centro-nombre';

/**
 * Formulario de un centro asistencial (crear o renombrar). Se usa en la página
 * «Centros asistenciales» y dentro del formulario de Lugares; por eso no usa <form>
 * (no se pueden anidar) y gestiona Enter y Escape sin que lleguen al formulario o al modal padre.
 */
@Component({
    selector: 'app-centro-form',
    imports: [FormsModule],
    changeDetection: ChangeDetectionStrategy.Eager,
    templateUrl: './centro-form.component.html'
})
export class CentroFormComponent implements OnChanges, AfterViewInit {
  /** Centro a editar; null o sin id = alta. */
  @Input() centro: Centro | null = null;
  /** Centros ya cargados, para avisar del duplicado sin esperar al servidor. */
  @Input() existentes: Centro[] = [];
  /** Versión reducida (dentro del formulario de Lugares). */
  @Input() compacto = false;
  @Input() campoId = 'nombreCentro';
  @Input() enfocarAlIniciar = true;

  @Output() guardado = new EventEmitter<Centro>();
  @Output() cancelado = new EventEmitter<void>();

  @ViewChild('campoNombre') campoNombre?: ElementRef<HTMLInputElement>;

  nombre = '';
  error = '';
  guardando = false;
  readonly maxLength = MAX_NOMBRE_CENTRO;

  constructor(private backendService: BackendService) {}

  get esEdicion(): boolean {
    return !!this.centro?.id_centro;
  }

  get textoGuardar(): string {
    if (this.guardando) return 'Guardando…';
    if (this.esEdicion) return 'Guardar cambios';
    return this.compacto ? 'Crear y seleccionar' : 'Crear centro';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['centro']) {
      this.nombre = this.centro?.nombre_centro ?? '';
      this.error = '';
      this.guardando = false;
    }
  }

  ngAfterViewInit(): void {
    if (this.enfocarAlIniciar) this.enfocar();
  }

  enfocar(): void {
    setTimeout(() => this.campoNombre?.nativeElement.focus());
  }

  onNombreCambiado(): void {
    if (this.error) this.error = '';
  }

  onEnter(evento: Event): void {
    evento.preventDefault();
    evento.stopPropagation();
    this.guardar();
  }

  onEscape(evento: Event): void {
    evento.preventDefault();
    evento.stopPropagation();
    this.cancelar();
  }

  cancelar(): void {
    if (this.guardando) return;
    this.cancelado.emit();
  }

  guardar(): void {
    if (this.guardando) return;

    const nombre = normalizarNombreCentro(this.nombre);
    if (!nombre) {
      this.mostrarError('Escriba el nombre del centro asistencial.');
      return;
    }
    if (nombre.length > MAX_NOMBRE_CENTRO) {
      this.mostrarError(`El nombre admite como máximo ${MAX_NOMBRE_CENTRO} caracteres.`);
      return;
    }

    const idPropio = this.centro?.id_centro ?? null;
    const duplicado = (this.existentes || []).find(
      (c) => c.id_centro !== idPropio && normalizarNombreCentro(c.nombre_centro) === nombre
    );
    if (duplicado) {
      this.mostrarError(
        `Ya existe el centro «${normalizarNombreCentro(duplicado.nombre_centro)}». ` +
          (this.compacto ? 'Elíjalo en la lista o escriba otro nombre.' : 'Escriba otro nombre.')
      );
      return;
    }

    this.guardando = true;
    this.error = '';
    const datos = { nombre_centro: nombre };
    const peticion = idPropio
      ? this.backendService.updateCentro(idPropio, datos)
      : this.backendService.createCentro(datos);

    peticion.pipe(finalize(() => { this.guardando = false; })).subscribe({
      next: (res: any) => {
        this.guardando = false;
        const centro: Centro = res?.data ?? { id_centro: idPropio as number, nombre_centro: nombre };
        this.guardado.emit(centro);
      },
      error: (err: any) => {
        this.guardando = false;
        this.mostrarError(this.mensajeError(err));
      },
    });
  }

  private mostrarError(mensaje: string): void {
    this.error = mensaje;
    this.enfocar();
  }

  private mensajeError(err: any): string {
    const estado = err?.status;
    if (estado === 403) return 'No tiene permisos para administrar centros asistenciales.';
    if (estado === 401) return 'Su sesión ha caducado. Vuelva a iniciar sesión para continuar.';
    if (!estado || estado === 503) {
      return 'No se pudo conectar con el servidor. Compruebe la conexión e inténtelo de nuevo.';
    }
    return err?.error?.message || 'No se pudo guardar el centro asistencial. Inténtelo de nuevo.';
  }
}
