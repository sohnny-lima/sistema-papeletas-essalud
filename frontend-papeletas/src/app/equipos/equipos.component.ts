import { Component, OnInit } from '@angular/core';
import { BackendService } from '../services/backend.service';
import Swal from 'sweetalert2';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Equipo {
  id_equipo?: number;
  cod_patrimonial: string;
  descripcion: string;
  marca: string;
  serie: string;
  modelo: string;
}

@Component({
  selector: 'app-equipos',
  standalone: true,
  templateUrl: './equipos.component.html',
  styleUrls: ['./equipos.component.css'],
  imports: [CommonModule, FormsModule]
})
export class EquiposComponent implements OnInit {
  
  // Listado de equipos, paginación, etc.
  equipos: Equipo[] = [];
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

  // Modelo para crear/editar un equipo
  equipo: Equipo = this.createEmptyEquipo();

  // Indicador de carga
  isLoading = false;

  // Para poder usar Math.min en la vista
  Math = Math;

  constructor(private backendService: BackendService) {}

  ngOnInit(): void {
    this.getEquipos();
  }

  // Crea un objeto vacío de Equipo
  private createEmptyEquipo(): Equipo {
    return {
      cod_patrimonial: '',
      descripcion: '',
      marca: '',
      serie: '',
      modelo: ''
    };
  }

  // Aplicar el filtro reiniciando la paginación
  applyFilter(): void {
    this.currentPage = 1;
    this.getEquipos();
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

  // Llamar al back-end para obtener la lista de equipos
  getEquipos(): void {
    this.isLoading = true;
    this.backendService
      .getEquipos(
        this.currentPage,
        this.itemsPerPage,
        this.selectedCategory,
        this.searchText
      )
      .subscribe({
        next: (response) => {
          this.isLoading = false;

          // Ajustar según cómo venga la data. Ej:
          // successResponse(res, {
          //   data: result.rows,
          //   totalItems,
          //   ...
          // }, 'Equipos obtenidos...');

          // Normalmente:
          // response.data = {
          //   data: [...],
          //   totalItems: number,
          //   currentPage: number,
          //   ...
          // }
          // Dependiendo de tu back, podrías necesitar:
          // this.equipos = response.data.data || [];
          // this.totalItems = response.data.totalItems || 0;
          // Revisa la consola para confirmarlo.

          this.equipos = response.data.data || response.data; 
          this.totalItems = response.data.totalItems || 0;
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

  // Calcular el número total de páginas
  getTotalPages(): number {
    return this.totalPages;
  }

  // Botón “Siguiente página”
  nextPage(): void {
    if (this.currentPage < this.getTotalPages()) {
      this.currentPage++;
      this.getEquipos();
    }
  }

  // Botón “Página anterior”
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getEquipos();
    }
  }

  // Botón “Ir a la primera página”
  goToFirstPage(): void {
    if (this.currentPage !== 1) {
      this.currentPage = 1;
      this.getEquipos();
    }
  }

  // Botón “Ir a la última página”
  goToLastPage(): void {
    const lastPage = this.getTotalPages();
    if (this.currentPage !== lastPage) {
      this.currentPage = lastPage;
      this.getEquipos();
    }
  }

  // Resetear el formulario (crear nuevo equipo)
  resetForm(): void {
    this.equipo = this.createEmptyEquipo();
  }

  // Editar un equipo (abre el modal con datos cargados)
  editEquipo(equipo: Equipo): void {
    this.equipo = { ...equipo };
    this.openModal();
  }

  // Eliminar un equipo
  deleteEquipo(id_equipo: number): void {
    Swal.fire({
      title: '¿Está seguro?',
      text: '¿Desea eliminar este equipo?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.backendService.deleteEquipo(id_equipo).subscribe({
          next: () => {
            this.getEquipos();
            this.showSuccessAlert('Equipo eliminado exitosamente');
          },
          error: () => this.showErrorAlert('Error al eliminar equipo')
        });
      }
    });
  }

  // Abrir el modal (Bootstrap JS)
  openModal(): void {
    const modalElement = document.getElementById('equipoModal');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
      });
      modal.show();
    }
  }

  // Guardar (crear/editar) un equipo
  onSubmit(): void {
    this.normalizeEquipo();
    if (!this.validateEquipo()) {
      return;
    }

    if (this.equipo.id_equipo) {
      // Editar equipo
      this.backendService.updateEquipo(this.equipo.id_equipo, this.equipo).subscribe({
        next: () => {
          this.getEquipos();
          this.closeModal();
          this.showSuccessAlert('Equipo actualizado exitosamente');
          this.resetForm();
        },
        error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'Error al actualizar equipo'))
      });
    } else {
      // Agregar nuevo equipo
      this.backendService.createEquipo(this.equipo).subscribe({
        next: () => {
          this.getEquipos();
          this.closeModal();
          this.showSuccessAlert('Equipo agregado exitosamente');
          this.resetForm();
        },
        error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'Error al agregar equipo'))
      });
    }
  }

  private normalizeEquipo(): void {
    this.equipo = {
      ...this.equipo,
      cod_patrimonial: this.normalizeText(this.equipo.cod_patrimonial),
      descripcion: this.normalizeText(this.equipo.descripcion),
      marca: this.normalizeText(this.equipo.marca),
      modelo: this.normalizeText(this.equipo.modelo),
      serie: this.normalizeText(this.equipo.serie)
    };
  }

  private validateEquipo(): boolean {
    const requiredFields = [
      { label: 'Código patrimonial', value: this.equipo.cod_patrimonial },
      { label: 'Descripción', value: this.equipo.descripcion },
      { label: 'Marca', value: this.equipo.marca },
      { label: 'Modelo', value: this.equipo.modelo },
      { label: 'Serie', value: this.equipo.serie }
    ];
    const missing = requiredFields.filter(field => !field.value);

    if (missing.length > 0) {
      this.showErrorAlert(`Complete los campos obligatorios: ${missing.map(field => field.label).join(', ')}.`);
      return false;
    }

    if (!/^\d{4,20}$/.test(this.equipo.cod_patrimonial)) {
      this.showErrorAlert('El código patrimonial debe contener solo números y tener entre 4 y 20 dígitos.');
      return false;
    }

    if (this.equipo.descripcion.length < 3) {
      this.showErrorAlert('La descripción debe tener al menos 3 caracteres.');
      return false;
    }

    if (this.equipo.marca.length < 2 || this.equipo.modelo.length < 2 || this.equipo.serie.length < 2) {
      this.showErrorAlert('Marca, modelo y serie deben tener al menos 2 caracteres.');
      return false;
    }

    return true;
  }

  private normalizeText(value: string | null | undefined): string {
    return (value || '').trim().toUpperCase();
  }

  // Alertas de éxito
  showSuccessAlert(message: string): void {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: message,
      showConfirmButton: false,
      timer: 2200,
      timerProgressBar: true,
      customClass: { popup: 'es-toast' }
    });
  }

  // Alertas de error
  showErrorAlert(message: string): void {
    Swal.fire({
      icon: 'error',
      title: 'Revise los datos',
      text: message,
      confirmButtonText: 'Entendido',
      customClass: { popup: 'es-alert' }
    });
  }

  private closeModal(): void {
    const modalElement = document.getElementById('equipoModal');
    const modal = modalElement ? (window as any).bootstrap.Modal.getInstance(modalElement) : null;
    modal?.hide();
  }

  private getErrorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.error?.detail || fallback;
  }
}
