import { Component, OnInit } from '@angular/core';
import { BackendService } from '../services/backend.service';
import Swal from 'sweetalert2';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Lugar {
  id_lugar?: number;
  nombre_ambiente: string;
  dependencia: string;
  centro?: string;       // opcional: si el backend ya envía el nombre del centro
  id_centro: number;     // FK
}

interface Centro {
  id_centro: number;
  nombre_centro: string;
}

@Component({
  selector: 'app-lugares',
  standalone: true,
  templateUrl: './lugares.component.html',
  styleUrls: ['./lugares.component.css'],
  imports: [CommonModule, FormsModule]
})
export class LugaresComponent implements OnInit {
  lugares: Lugar[] = [];
  centros: Centro[] = [];   // <-- Agrega esta propiedad

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

  // Para poder usar Math.min en la vista
  Math = Math;

  constructor(private backendService: BackendService) {}

  ngOnInit(): void {
    this.getCentros();  // Llama al método para obtener centros
    this.getLugares();
  }

  // Crea un objeto vacío de Lugar
  private createEmptyLugar(): Lugar {
    return {
      nombre_ambiente: '',
      dependencia: '',
      id_centro: 0
    };
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

  // Llamar al back-end para obtener la lista de lugares con paginación y filtros
  // Llamada al back-end con paginación y filtros
  getLugares(): void {
    this.isLoading = true;
    this.backendService.getLugares(
      this.currentPage,
      this.itemsPerPage,
      this.selectedCategory,
      this.searchText
    )
    .subscribe({
      next: (response: any) => {
        console.log('RESPONSE LUGARES: ', response);
        this.isLoading = false;
  
        // Ajustar acceso al array y total:
        this.lugares = response.data.data;          // <-- array con los lugares
        this.totalItems = response.data.totalItems; // <-- total de registros
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
  


  // Obtener centros asistenciales
  getCentros(): void {
    this.backendService.getCentros().subscribe({
      next: (res: any) => {
        this.centros = res.data || res;
      },
      error: () => this.showErrorAlert('Error al cargar centros asistenciales')
    });
  }

  // Calcular el número total de páginas
  getTotalPages(): number {
    return this.totalPages;
  }

  // Botón “Siguiente página”
  nextPage(): void {
    if (this.currentPage < this.getTotalPages()) {
      this.currentPage++;
      this.getLugares();
    }
  }

  // Botón “Página anterior”
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getLugares();
    }
  }

  // Botón “Ir a la primera página”
  goToFirstPage(): void {
    if (this.currentPage !== 1) {
      this.currentPage = 1;
      this.getLugares();
    }
  }

  // Botón “Ir a la última página”
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
  }

  // Editar un lugar (abre el modal con datos cargados)
  editLugar(lugar: Lugar): void {
    this.lugar = { ...lugar };
    this.openModal();
  }

  // Eliminar un lugar
  deleteLugar(id_lugar: number): void {
    Swal.fire({
      title: '¿Está seguro?',
      text: '¿Desea eliminar este lugar?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.backendService.deleteLugar(id_lugar).subscribe({
          next: () => {
            this.getLugares();
            this.showSuccessAlert('Lugar eliminado exitosamente');
          },
          error: () => this.showErrorAlert('Error al eliminar lugar')
        });
      }
    });
  }

  // Abrir el modal (Bootstrap JS)
  openModal(): void {
    const modalElement = document.getElementById('lugarModal');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement, {
        backdrop: 'static',
        keyboard: false
      });
      modal.show();
    }
  }

  // Guardar (crear/editar) un lugar
  onSubmit(): void {
    this.normalizeLugar();
    if (!this.validateLugar()) {
      return;
    }

    if (this.lugar.id_lugar) {
      // Editar lugar
      this.backendService.updateLugar(this.lugar.id_lugar, this.lugar).subscribe({
        next: () => {
          this.getLugares();
          this.closeModal();
          this.showSuccessAlert('Lugar actualizado exitosamente');
          this.resetForm();
        },
        error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'Error al actualizar lugar'))
      });
    } else {
      // Agregar nuevo lugar
      this.backendService.createLugar(this.lugar).subscribe({
        next: () => {
          this.getLugares();
          this.closeModal();
          this.showSuccessAlert('Lugar agregado exitosamente');
          this.resetForm();
        },
        error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'Error al agregar lugar'))
      });
    }
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
    const missing: string[] = [];

    if (!this.lugar.nombre_ambiente) missing.push('Nombre del ambiente');
    if (!this.lugar.dependencia) missing.push('Dependencia');
    if (!this.lugar.id_centro) missing.push('Centro asistencial');

    if (missing.length > 0) {
      this.showErrorAlert(`Complete los campos obligatorios: ${missing.join(', ')}.`);
      return false;
    }

    if (this.lugar.nombre_ambiente.length < 3) {
      this.showErrorAlert('El nombre del ambiente debe tener al menos 3 caracteres.');
      return false;
    }

    if (this.lugar.dependencia.length < 3) {
      this.showErrorAlert('La dependencia debe tener al menos 3 caracteres.');
      return false;
    }

    return true;
  }

  private normalizeText(value: string | null | undefined): string {
    return (value || '').trim().toUpperCase();
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
    const modalElement = document.getElementById('lugarModal');
    const modal = modalElement ? (window as any).bootstrap.Modal.getInstance(modalElement) : null;
    modal?.hide();
  }

  private getErrorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.error?.detail || fallback;
  }
}
