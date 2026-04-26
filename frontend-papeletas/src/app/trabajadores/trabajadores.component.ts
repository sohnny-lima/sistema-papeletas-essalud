import { Component, OnInit } from '@angular/core';
import { BackendService } from '../services/backend.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';

interface Trabajador {
  id_trabajador?: number;
  nombres: string;
  apellido_paterno: string;
  apellido_materno: string;
  numero_identificacion: string;
}

@Component({
  selector: 'app-trabajadores',
  standalone: true,
  templateUrl: './trabajadores.component.html',
  styleUrls: ['./trabajadores.component.css'],
  imports: [CommonModule, FormsModule]
})
export class TrabajadoresComponent implements OnInit {
  trabajadores: Trabajador[] = [];
  currentPage: number = 1;
  itemsPerPage: number = 10;
  totalItems: number = 0;
  totalPages: number = 0;
  currentStartIndex: number = 0;
  currentEndIndex: number = 0;

  searchText: string = '';
  selectedCategory: string = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  trabajador: Trabajador = this.createEmptyTrabajador();
  isLoading: boolean = false;

  // Para usar Math.min en la vista
  Math = Math;

  constructor(private backendService: BackendService) {}

  ngOnInit(): void {
    this.getTrabajadores();
  }

  private createEmptyTrabajador(): Trabajador {
    return {
      nombres: '',
      apellido_paterno: '',
      apellido_materno: '',
      numero_identificacion: ''
    };
  }

  applyFilter(): void {
    this.currentPage = 1;
    this.getTrabajadores();
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

  getTrabajadores(): void {
    console.log('Current Page:', this.currentPage);
    this.isLoading = true;

    this.backendService
      .getTrabajadores(this.currentPage, this.itemsPerPage, this.selectedCategory, this.searchText)
      .subscribe({
        next: (response) => {
          this.isLoading = false;

          // Observa que en tu back-end la info se encapsula como:
          // {
          //   "success": true,
          //   "message": "...",
          //   "data": {
          //     "data": [...],
          //     "totalItems": number,
          //     "totalPages": number,
          //     "currentPage": number
          //   }
          // }
          // => Por tanto, la lista real está en response.data.data
          // y la cantidad total en response.data.totalItems.

          if (response.success) {
            // Ajustar a la estructura: response.data (obj) => data: [...], totalItems, ...
            this.trabajadores = response.data.data || [];      // array de trabajadores
            this.totalItems   = response.data.totalItems || 0; // conteo total
            this.updatePagination();
          } else {
            this.showErrorAlert('Error al cargar los trabajadores, por favor intente nuevamente.');
          }
        },
        error: () => {
          this.isLoading = false;
          this.showErrorAlert('Error de conexión con el servidor. Por favor, inténtelo nuevamente.');
        }
      });
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
    this.currentStartIndex = this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
    this.currentEndIndex = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
  }

  nextPage(): void {
    if (this.currentPage < this.getTotalPages()) {
      this.currentPage++;
      this.getTrabajadores();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getTrabajadores();
    }
  }

  goToFirstPage(): void {
    if (this.currentPage !== 1) {
      this.currentPage = 1;
      this.getTrabajadores();
    }
  }

  goToLastPage(): void {
    const lastPage = this.getTotalPages();
    if (this.currentPage !== lastPage) {
      this.currentPage = lastPage;
      this.getTrabajadores();
    }
  }

  getTotalPages(): number {
    return this.totalPages;
  }

  resetForm(): void {
    this.trabajador = this.createEmptyTrabajador();
  }

  editTrabajador(trabajador: Trabajador): void {
    this.trabajador = { ...trabajador };
    this.openModal();
  }

  deleteTrabajador(id: number): void {
    Swal.fire({
      title: '¿Está seguro?',
      text: '¿Desea eliminar este trabajador?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, eliminar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.backendService.deleteTrabajador(id).subscribe({
          next: () => {
            this.getTrabajadores();
            this.showSuccessAlert('Trabajador eliminado exitosamente');
          },
          error: () => this.showErrorAlert('Error al eliminar trabajador')
        });
      }
    });
  }

  openModal(): void {
    const modalElement = document.getElementById('trabajadorModal');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
      });
      modal.show();
    }
  }

  onSubmit(): void {
    this.normalizeTrabajador();
    if (!this.validateTrabajador()) {
      return;
    }

    if (this.trabajador.id_trabajador) {
      // Editar trabajador
      this.backendService.updateTrabajador(this.trabajador.id_trabajador, this.trabajador).subscribe({
        next: () => {
          this.getTrabajadores();
          this.closeModal();
          this.showSuccessAlert('Trabajador actualizado exitosamente');
          this.resetForm();
        },
        error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'Error al actualizar trabajador'))
      });
    } else {
      // Agregar nuevo trabajador
      this.backendService.createTrabajador(this.trabajador).subscribe({
        next: () => {
          this.getTrabajadores();
          this.closeModal();
          this.showSuccessAlert('Trabajador agregado exitosamente');
          this.resetForm();
        },
        error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'Error al agregar trabajador'))
      });
    }
  }

  private normalizeTrabajador(): void {
    this.trabajador = {
      ...this.trabajador,
      nombres: this.normalizeText(this.trabajador.nombres),
      apellido_paterno: this.normalizeText(this.trabajador.apellido_paterno),
      apellido_materno: this.normalizeText(this.trabajador.apellido_materno),
      numero_identificacion: this.normalizeText(this.trabajador.numero_identificacion)
    };
  }

  private validateTrabajador(): boolean {
    const requiredFields = [
      { label: 'Nombres', value: this.trabajador.nombres },
      { label: 'Apellido paterno', value: this.trabajador.apellido_paterno },
      { label: 'Apellido materno', value: this.trabajador.apellido_materno },
      { label: 'DNI / Nº identificación', value: this.trabajador.numero_identificacion }
    ];
    const missing = requiredFields.filter(field => !field.value);

    if (missing.length > 0) {
      this.showErrorAlert(`Complete los campos obligatorios: ${missing.map(field => field.label).join(', ')}.`);
      return false;
    }

    if (!/^[A-ZÁÉÍÓÚÑ\s]+$/.test(this.trabajador.nombres)) {
      this.showErrorAlert('Los nombres solo deben contener letras y espacios.');
      return false;
    }

    if (!/^[A-ZÁÉÍÓÚÑ\s]+$/.test(`${this.trabajador.apellido_paterno} ${this.trabajador.apellido_materno}`)) {
      this.showErrorAlert('Los apellidos solo deben contener letras y espacios.');
      return false;
    }

    if (!/^\d{8,12}$/.test(this.trabajador.numero_identificacion)) {
      this.showErrorAlert('El DNI / Nº identificación debe contener solo números y tener entre 8 y 12 dígitos.');
      return false;
    }

    return true;
  }

  private normalizeText(value: string | null | undefined): string {
    return (value || '').trim().toUpperCase();
  }

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
    const modalElement = document.getElementById('trabajadorModal');
    const modal = modalElement ? (window as any).bootstrap.Modal.getInstance(modalElement) : null;
    modal?.hide();
  }

  private getErrorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.error?.detail || fallback;
  }
}
