import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BackendService } from '../services/backend.service';
import Swal from 'sweetalert2';

import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

(jsPDF as any).autoTable = autoTable;

// 1) Interfaz con IDs y nombres “auxiliares”
interface Papeleta {
  id_papeleta?: number;
  numero_papeleta: string;
  fecha: string;

  id_tipo_formulario: number;
  tipo_formulario_nombre?: string;

  id_trabajador_origen: number;
  trabajador_origen_nombre?: string;

  id_trabajador_destino: number;
  trabajador_destino_nombre?: string;

  id_lugar_origen: number;
  lugar_origen_nombre?: string;

  id_lugar_destino: number;
  lugar_destino_nombre?: string;

  // Ahora es un array de objetos Equipo, no de IDs
  equipos_patrimoniales: Equipo[];
}






interface Equipo {
  id_equipo: number;
  cod_patrimonial: string;
  descripcion: string;
  marca: string;
  modelo: string;
  serie: string;
  estado: string;
  displayName: string;
  selected?: boolean;
}

@Component({
  selector: 'app-papeletas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './papeletas.component.html',
  styleUrls: ['./papeletas.component.css'],
})
export class PapeletasComponent implements OnInit {
  public isLoading: boolean = false;

  // Para búsqueda del listado y de equipos
  tableSearchText: string = '';
  equipoSearchText: string = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  // Para autocompletar Lugar Origen y Lugar Destino
  lugarOrigenSearch: string = '';
  lugarDestinoSearch: string = '';

  filteredEquipos: Equipo[] = [];

  // Para búsqueda de Trabajadores y Lugares
  filteredTrabajadoresOrigen: any[] = [];
  filteredTrabajadoresDestino: any[] = [];
  filteredLugaresOrigen: any[] = [];
  filteredLugaresDestino: any[] = [];

  // Listado de Papeletas a mostrar en la tabla
  papeletas: Papeleta[] = [];
  papeleta: Papeleta = this.createEmptyPapeleta();

  // Tipos de formulario
  tiposFormulario: Array<{ id_tipo_formulario: number; nombre: string }> = [];

  // Para el paginado
  selectedCategory: string = '';
  currentPage: number = 1;
  itemsPerPage: number = 10;
  totalItems: number = 0;

  dropdownOpen: boolean = false;

  // Propiedades de paginación calculadas
  totalPages: number = 0;
  currentStartIndex: number = 0;
  currentEndIndex: number = 0;

  constructor(private backendService: BackendService) {}

  ngOnInit(): void {
    this.getPapeletas();
    this.getTiposFormulario();
  }

  private createEmptyPapeleta(): Papeleta {
    return {
      numero_papeleta: '',
      fecha: new Date().toISOString().split('T')[0],
      id_tipo_formulario: 0,
      id_trabajador_origen: 0,
      id_trabajador_destino: 0,
      id_lugar_origen: 0,
      id_lugar_destino: 0,
      equipos_patrimoniales: []
    };
  }

  // ===========================
  // ========== PDF ============
  // ===========================
  generarPDF(id_papeleta: number): void {
    this.backendService.getPapeletaById(id_papeleta).subscribe({
      next: (response) => {
        const papeleta = response.data;
        if (!papeleta) return;
  
        const pdf = new jsPDF('landscape');
        const marginLeft = 20;
        const marginRight = 20;
        const marginTop = 8;
        const pageWidth = pdf.internal.pageSize.getWidth();
        const contentWidth = pageWidth - marginLeft - marginRight;
        let y = marginTop;
  
        const drawMixedFichaBlock = (
          yStart: number,
          rows: Array<[string, string] | [string, string, string, string]>,
          options = { colWidths: [60, 90, 30, contentWidth - 60 - 90 - 30] }
        ) => {
          const rowHeight = 7;
          const widths = options.colWidths;
          const x = [marginLeft];
          for (let i = 0; i < widths.length - 1; i++) {
            x.push(x[i] + widths[i]);
          }
  
          const blockHeight = rows.length * rowHeight;
          pdf.rect(marginLeft, yStart, contentWidth, blockHeight);
  
          for (let i = 1; i < rows.length; i++) {
            const yRow = yStart + i * rowHeight;
            pdf.line(marginLeft, yRow, marginLeft + contentWidth, yRow);
          }
  
          rows.forEach((row, i) => {
            const yRow = yStart + i * rowHeight + 5;
            pdf.setFontSize(8);
  
            if (row.length === 2) {
              pdf.line(x[1], yStart + i * rowHeight, x[1], yStart + (i + 1) * rowHeight);
              pdf.setFont('helvetica', 'bold');
              pdf.text(row[0].toUpperCase() + ':', x[0] + 2, yRow);
              pdf.setFont('helvetica', 'normal');
              pdf.text(row[1], x[1] + 2, yRow);
            } else if (row.length === 4) {
              pdf.line(x[1], yStart + i * rowHeight, x[1], yStart + (i + 1) * rowHeight);
              pdf.line(x[2], yStart + i * rowHeight, x[2], yStart + (i + 1) * rowHeight);
              pdf.line(x[3], yStart + i * rowHeight, x[3], yStart + (i + 1) * rowHeight);
              pdf.setFont('helvetica', 'bold');
              pdf.text(row[0].toUpperCase() + ':', x[0] + 2, yRow);
              pdf.setFont('helvetica', 'normal');
              pdf.text(row[1], x[1] + 2, yRow);
              pdf.setFont('helvetica', 'bold');
              pdf.text(row[2].toUpperCase() + ':', x[2] + 2, yRow);
              pdf.setFont('helvetica', 'normal');
              pdf.text(row[3], x[3] + 2, yRow);
            }
          });
  
          return yStart + blockHeight;
        };
  
        const logo = new Image();
        logo.src = 'assets/logo4.png';
  
        logo.onload = () => {
          const logoWidth = 58;
          const logoHeight = 38;
          const logoX = marginLeft;
          const desplazamientoVerticalLogo = -15;
          const logoY = y + desplazamientoVerticalLogo;
          pdf.addImage(logo, 'PNG', logoX, logoY, logoWidth, logoHeight);
  
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(14);
          pdf.text('FORMULARIO UNICO PATRIMONIAL', pageWidth / 2, y + 6, { align: 'center' });
  
          const cellWidth1 = 20;
          const cellWidth2 = 30;
          const cellHeight = 6;
          const x = pageWidth - marginRight - (cellWidth1 + cellWidth2);
          let yFecha = y;
  
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'bold');
  
          pdf.rect(x, yFecha, cellWidth1, cellHeight);
          pdf.text('N°:', x + 2, yFecha + 4);
          pdf.rect(x + cellWidth1, yFecha, cellWidth2, cellHeight);
          pdf.setFont('helvetica', 'normal');
          pdf.text(papeleta.numero_papeleta, x + cellWidth1 + 2, yFecha + 4);
  
          yFecha += cellHeight;
          pdf.setFont('helvetica', 'bold');
          pdf.rect(x, yFecha, cellWidth1, cellHeight);
          pdf.text('FECHA:', x + 2, yFecha + 4);
          pdf.rect(x + cellWidth1, yFecha, cellWidth2, cellHeight);
          pdf.setFont('helvetica', 'normal');
          pdf.text(new Date(papeleta.fecha).toLocaleDateString('es-PE'), x + cellWidth1 + 2, yFecha + 4);
  
          y = marginTop + 18;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.text('I. FORMATO', marginLeft, y);
          y += 2;
          y = drawMixedFichaBlock(y, [
            ['TIPO DE FORMULARIO', papeleta.tipo_formulario_nombre?.toUpperCase() || 'N/A']
          ]);
          y += 6;
  
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.text('II. DATOS DEL ORIGEN / ASIGNACIÓN', marginLeft, y);
          y += 2;
          const [depOrigen, ambOrigen] = (papeleta.lugar_origen_nombre || '').split('(');
y = drawMixedFichaBlock(y, [
  ['TRABAJADOR', papeleta.trabajador_origen_nombre || '', 'CÓDIGO', papeleta.trabajador_origen_codigo || ''],
  ['DEPENDENCIA', depOrigen?.trim() || ''],
  ['AMBIENTE', ambOrigen?.replace(')', '').trim() || '[completar]'],
  ['CENTRO', papeleta.origen_centro || '']
]);
          
          y += 6;
  
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.text('III. DATOS DE LOS BIENES', marginLeft, y);
          y += 2;
          (pdf as any).autoTable({
            startY: y,
            head: [['ITEM', 'CÓDIGO PATRIMONIAL', 'DESCRIPCIÓN Y ESPECIFICACIONES DEL BIEN', 'MARCA', 'SERIE', 'MODELO']],
            body: papeleta.equipos_patrimoniales.map((e: any, i: number) => [
              i + 1,
              e.cod_patrimonial,
              e.descripcion,
              e.marca,
              e.serie || '',
              e.modelo,
              ''
            ]),
            styles: {
              fontSize: 7.8,
              cellPadding: 1.5,
              font: 'helvetica',
              halign: 'center'
            },
            headStyles: {
              fillColor: [0, 0, 0],
              textColor: 255,
              fontStyle: 'bold'
            },
            theme: 'grid',
            margin: { left: marginLeft, right: marginRight },
            tableWidth: 'auto'
          });
          y = (pdf as any).lastAutoTable.finalY + 6;
  
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.text('IV. DATOS DEL DESTINO (Solo utilizar en caso de Desplazamiento / Mantenimiento / Devolución)', marginLeft, y);
          y += 2;
          const [depDestino, ambDestino] = (papeleta.lugar_destino_nombre || '').split('(');
y = drawMixedFichaBlock(y, [
  ['TRABAJADOR', papeleta.trabajador_destino_nombre || '', 'CÓDIGO', papeleta.trabajador_destino_codigo || ''],
  ['DEPENDENCIA', depDestino?.trim() || ''],
  ['AMBIENTE', ambDestino?.replace(')', '').trim() || '[completar]'],
  ['CENTRO', papeleta.destino_centro || '']
]);
          y += 6;
  
          pdf.setFont('helvetica', 'bold');
          pdf.text('V. FIRMA DE CONFORMIDAD', marginLeft, y);
          y += 2;
  
          const recHeight = 50;
          pdf.rect(marginLeft, y, contentWidth, recHeight);
  
          const cuadroFirmaWidth = 54;
          const cuadroFirmaHeight = 35;
          const espacioFirma = 10;
  
          const xStart = marginLeft + 5;
          const yStart = y + 5;
  
          for (let i = 0; i < 4; i++) {
            const x = xStart + i * (cuadroFirmaWidth + espacioFirma);
            pdf.rect(x, yStart, cuadroFirmaWidth, cuadroFirmaHeight);
          }
  
          y += cuadroFirmaHeight + 10;
          const labels = [
            'FIRMA DEL TRABAJADOR (ENTREGA)',
            'V°B° DEL JEFE DE DEPENDENCIA',
            'FIRMA DEL TRABAJADOR (RECIBE)',
            'V°B° ÁREA DE PATRIMONIO'
          ];
  
          pdf.setFontSize(7);
          labels.forEach((text, i) => {
            const x = xStart + i * (cuadroFirmaWidth + espacioFirma) + cuadroFirmaWidth / 2;
            pdf.text(text, x, y, { align: 'center' });
          });
  
          y += 8;
  
          pdf.save(`Papeleta_${papeleta.numero_papeleta}.pdf`);
        };
      },
      error: (err) => console.error('Error al generar PDF:', err)
    });
  }
  
  
  
  
  
  // ===========================
  // ========== CRUD ===========
  // ===========================
  // Variable para mantener la página actual de papeletas
  allPapeletas: Papeleta[] = [];

  getPapeletas(): void {
    this.isLoading = true;
    this.backendService.getPapeletas(
      this.currentPage,
      this.itemsPerPage,
      this.selectedCategory,
      this.tableSearchText
    ).subscribe({
      next: (response) => {
        this.isLoading = false;
        console.log('▶ Respuesta de getPapeletas:', response);
        if (response.success) {
          this.papeletas = response.data?.data || [];
          this.allPapeletas = this.papeletas;
          this.totalItems = response.data?.totalItems || 0;
          this.updatePagination();
        } else {
          this.showErrorAlert('Error al cargar las papeletas.');
        }
      },
      error: () => {
        this.isLoading = false;
        this.showErrorAlert('Error de conexión con el servidor.');
      },
    });
  }

  // Se llama desde el input de búsqueda en el HTML
  applyFilter(): void {
    this.currentPage = 1;
    this.getPapeletas();
  }

  onSearchInput(): void {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }
    this.searchTimer = setTimeout(() => this.applyFilter(), 300);
  }

  clearSearch(): void {
    this.tableSearchText = '';
    this.selectedCategory = '';
    this.applyFilter();
  }

  updatePagination(): void {
    this.totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
    this.currentStartIndex = this.totalItems === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
    this.currentEndIndex = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
  }
  

  openModal(isNew: boolean = false): void {
    const modalElement = document.getElementById('papeletaModal');
    if (!modalElement) return;

    const modal = new (window as any).bootstrap.Modal(modalElement, {
      backdrop: 'static',
      keyboard: false,
    });

    if (isNew) {
      this.resetForm();
      this.backendService.getUltimoNumeroPapeleta().subscribe({
        next: (response) => {
          const lastNumber = response.data?.last_number ?? 0;
          this.papeleta.numero_papeleta =
            'PA-' + String(lastNumber + 1).padStart(4, '0');
        },
        error: () => {
          this.showErrorAlert('Error al obtener el número de papeleta.');
          this.papeleta.numero_papeleta = '';
        },
      });
      this.papeleta.fecha = new Date().toISOString().split('T')[0];
    }

    this.getTiposFormulario();
    modal.show();
  }

  onSubmit(): void {
    this.normalizePapeletaTextFields();
    if (!this.validatePapeleta()) {
      return;
    }

    // Se construye el objeto a enviar, extrayendo los IDs de los equipos
    const body = {
      id_papeleta: this.papeleta.id_papeleta,
      numero_papeleta: this.papeleta.numero_papeleta,
      fecha: this.papeleta.fecha,
      id_tipo_formulario: this.papeleta.id_tipo_formulario,
      id_trabajador_origen: this.papeleta.id_trabajador_origen,
      id_trabajador_destino: this.papeleta.id_trabajador_destino,
      id_lugar_origen: this.papeleta.id_lugar_origen,
      id_lugar_destino: this.papeleta.id_lugar_destino,
      // Se envía un array de IDs extraídos de los objetos equipos
      equipmentIds: this.papeleta.equipos_patrimoniales.map((eq: Equipo) => eq.id_equipo)
    };
  
    if (!this.papeleta.id_papeleta) {
      // Crear
      this.backendService.createPapeleta(body).subscribe({
        next: () => {
          this.closeModal();
          this.showSuccessAlert('Papeleta creada exitosamente');
          this.getPapeletas();
          this.resetForm();
        },
        error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'Error al crear la papeleta')),
      });
    } else {
      // Actualizar
      this.backendService.updatePapeleta(this.papeleta.id_papeleta, body).subscribe({
        next: () => {
          this.closeModal();
          this.showSuccessAlert('Papeleta actualizada exitosamente');
          this.getPapeletas();
          this.resetForm();
        },
        error: (error) => this.showErrorAlert(this.getErrorMessage(error, 'Error al actualizar la papeleta')),
      });
    }
  }
  

  editPapeleta(p: Papeleta): void {
    // Ya se reciben objetos completos en equipos_patrimoniales, no se requiere mapear a IDs
    this.papeleta = { ...p, equipos_patrimoniales: p.equipos_patrimoniales || [] };
    this.normalizePapeletaTextFields();
    this.lugarOrigenSearch = this.papeleta.lugar_origen_nombre || '';
    this.lugarDestinoSearch = this.papeleta.lugar_destino_nombre || '';
    this.equipoSearchText = '';
    this.filteredEquipos = [];
    this.openModal(false);
  }
  

  deletePapeleta(id: number): void {
    Swal.fire({
      title: '¿Está seguro?',
      text: '¿Desea eliminar esta papeleta?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
    }).then((result) => {
      if (result.isConfirmed) {
        this.isLoading = true;
        this.backendService.deletePapeleta(id).subscribe({
          next: () => {
            this.isLoading = false;
            this.showSuccessAlert('Papeleta eliminada exitosamente');
            this.getPapeletas();
          },
          error: () => {
            this.isLoading = false;
            this.showErrorAlert('Error al eliminar papeleta');
          },
        });
      }
    });
  }

  // ===========================
  // ==== Búsquedas y otros ====
  // ===========================

  onSearchTrabajadorOrigen(searchText: string): void {
    const text = this.normalizeText(searchText);
    this.papeleta.id_trabajador_origen = 0;
    this.papeleta.trabajador_origen_nombre = text;

    if (text.length < 3) {
      this.filteredTrabajadoresOrigen = [];
      return;
    }
    this.backendService.searchTrabajadores(text).subscribe({
      next: (resp) => {
        this.filteredTrabajadoresOrigen = resp.success ? resp.data : [];
      },
      error: () => {
        this.filteredTrabajadoresOrigen = [];
      },
    });
  }

  selectTrabajadorOrigen(trab: any): void {
    this.papeleta.id_trabajador_origen = trab.id_trabajador;
    this.papeleta.trabajador_origen_nombre = this.normalizeText(`${trab.nombres} ${trab.apellido_paterno} ${trab.apellido_materno}`);
    this.filteredTrabajadoresOrigen = [];
  }

  onBlurTrabajadorOrigen(): void {
    setTimeout(() => {
      this.filteredTrabajadoresOrigen = [];
    }, 200);
  }

  // Métodos para Trabajador Destino
onSearchTrabajadorDestino(searchText: string): void {
  const text = this.normalizeText(searchText);
  this.papeleta.id_trabajador_destino = 0;
  this.papeleta.trabajador_destino_nombre = text;

  if (text.length < 3) {
    this.filteredTrabajadoresDestino = [];
    return;
  }
  this.backendService.searchTrabajadores(text).subscribe({
    next: (resp) => {
      this.filteredTrabajadoresDestino = resp.success ? resp.data : [];
    },
    error: () => {
      this.filteredTrabajadoresDestino = [];
    },
  });
}

selectTrabajadorDestino(trab: any): void {
  this.papeleta.id_trabajador_destino = trab.id_trabajador;
  this.papeleta.trabajador_destino_nombre = this.normalizeText(`${trab.nombres} ${trab.apellido_paterno} ${trab.apellido_materno}`);
  this.filteredTrabajadoresDestino = [];
}

onBlurTrabajadorDestino(): void {
  setTimeout(() => {
    this.filteredTrabajadoresDestino = [];
  }, 200);
}

// Métodos para Lugar Origen
onSearchLugarOrigen(searchText: string): void {
  const text = this.normalizeText(searchText);
  this.papeleta.id_lugar_origen = 0;
  this.papeleta.lugar_origen_nombre = text;
  this.lugarOrigenSearch = text;

  if (text.length < 3) {
    this.filteredLugaresOrigen = [];
    return;
  }
  this.backendService.searchLugares(text).subscribe({
    next: (resp) => {
      this.filteredLugaresOrigen = resp.success ? resp.data : [];
    },
    error: () => {
      this.filteredLugaresOrigen = [];
    },
  });
}

selectLugarOrigen(lugar: any): void {
  this.papeleta.id_lugar_origen = lugar.id_lugar;
  this.papeleta.lugar_origen_nombre = this.normalizeText(`${lugar.nombre_ambiente} (${lugar.dependencia} - ${lugar.centro})`);
  this.lugarOrigenSearch = this.papeleta.lugar_origen_nombre; // ✅ importante para el input
  this.filteredLugaresOrigen = [];
}

onBlurLugarOrigen(): void {
  setTimeout(() => {
    this.filteredLugaresOrigen = [];
  }, 200);
}

// Métodos para Lugar Destino
onSearchLugarDestino(searchText: string): void {
  const text = this.normalizeText(searchText);
  this.papeleta.id_lugar_destino = 0;
  this.papeleta.lugar_destino_nombre = text;
  this.lugarDestinoSearch = text;

  if (text.length < 3) {
    this.filteredLugaresDestino = [];
    return;
  }
  this.backendService.searchLugares(text).subscribe({
    next: (resp) => {
      this.filteredLugaresDestino = resp.success ? resp.data : [];
    },
    error: () => {
      this.filteredLugaresDestino = [];
    },
  });
}

selectLugarDestino(lugar: any): void {
  this.papeleta.id_lugar_destino = lugar.id_lugar;
  this.papeleta.lugar_destino_nombre = this.normalizeText(`${lugar.nombre_ambiente} (${lugar.dependencia} - ${lugar.centro})`);
  this.lugarDestinoSearch = this.papeleta.lugar_destino_nombre; // ✅ importante para el input
  this.filteredLugaresDestino = [];
}

onBlurLugarDestino(): void {
  setTimeout(() => {
    this.filteredLugaresDestino = [];
  }, 200);
}

  // ===========================
  // ==== Equipos Patrimonial ==
  // ===========================
  onSearch(searchText: string): void {
    const text = this.normalizeText(searchText);
    this.equipoSearchText = text;

    if (text.length < 3) {
      this.filteredEquipos = [];
      return;
    }
    
    this.backendService.searchEquipos(text).subscribe({
      next: (response: any) => {
        if (response.success && response.data) {
          this.filteredEquipos = response.data.map((equipo: any) => ({
            id_equipo: equipo.id_equipo,
            cod_patrimonial: this.normalizeText(String(equipo.cod_patrimonial)),
            descripcion: this.normalizeText(equipo.descripcion),
            marca: this.normalizeText(equipo.marca),
            modelo: this.normalizeText(equipo.modelo),
            serie: this.normalizeText(equipo.serie),
            estado: this.normalizeText(equipo.estado),
            displayName: this.normalizeText(`${equipo.cod_patrimonial} - ${equipo.descripcion} - ${equipo.marca}${equipo.serie ? ' - ' + equipo.serie : ''}`),
            selected: false,
          }));
        } else {
          this.filteredEquipos = [];
        }
      },
      error: () => {
        this.filteredEquipos = [];
      }
    });
  }

  addEquipo(equipo: Equipo): void {
    // Se guarda el objeto completo, evitando duplicados
    if (!this.papeleta.equipos_patrimoniales.some(e => e.id_equipo === equipo.id_equipo)) {
      this.papeleta.equipos_patrimoniales.push(equipo);
    }
    // Limpieza
    this.equipoSearchText = '';
    this.filteredEquipos = [];
  }
  
  removeEquipo(equipoId: number): void {
    this.papeleta.equipos_patrimoniales = this.papeleta.equipos_patrimoniales.filter(
      (eq: Equipo) => eq.id_equipo !== equipoId
    );
  }

  private normalizePapeletaTextFields(): void {
    this.papeleta.numero_papeleta = this.normalizeText(this.papeleta.numero_papeleta);
    this.papeleta.trabajador_origen_nombre = this.normalizeText(this.papeleta.trabajador_origen_nombre);
    this.papeleta.trabajador_destino_nombre = this.normalizeText(this.papeleta.trabajador_destino_nombre);
    this.papeleta.lugar_origen_nombre = this.normalizeText(this.papeleta.lugar_origen_nombre);
    this.papeleta.lugar_destino_nombre = this.normalizeText(this.papeleta.lugar_destino_nombre);
    this.lugarOrigenSearch = this.normalizeText(this.lugarOrigenSearch);
    this.lugarDestinoSearch = this.normalizeText(this.lugarDestinoSearch);
    this.equipoSearchText = this.normalizeText(this.equipoSearchText);
  }

  private validatePapeleta(): boolean {
    const missing: string[] = [];

    if (!this.papeleta.fecha) missing.push('Fecha');
    if (!this.papeleta.id_tipo_formulario) missing.push('Tipo de formulario');
    if (!this.papeleta.id_trabajador_origen) missing.push('Seleccione un trabajador origen válido');
    if (!this.papeleta.id_trabajador_destino) missing.push('Seleccione un trabajador destino válido');
    if (!this.papeleta.id_lugar_origen) missing.push('Seleccione un lugar origen válido');
    if (!this.papeleta.id_lugar_destino) missing.push('Seleccione un lugar destino válido');
    if (!this.papeleta.equipos_patrimoniales?.length) missing.push('Equipos asociados');

    if (missing.length > 0) {
      this.showErrorAlert(`Complete los campos obligatorios: ${missing.join(', ')}.`);
      return false;
    }

    if (Number(this.papeleta.id_trabajador_origen) === Number(this.papeleta.id_trabajador_destino)) {
      this.showErrorAlert('El trabajador origen y el trabajador destino no pueden ser el mismo.');
      return false;
    }

    if (Number(this.papeleta.id_lugar_origen) === Number(this.papeleta.id_lugar_destino)) {
      this.showErrorAlert('El lugar origen y el lugar destino no pueden ser el mismo.');
      return false;
    }

    if (this.papeleta.equipos_patrimoniales.some((eq, index, arr) => arr.findIndex(item => item.id_equipo === eq.id_equipo) !== index)) {
      this.showErrorAlert('Hay equipos duplicados en la papeleta.');
      return false;
    }

    return true;
  }

  private normalizeText(value: string | null | undefined): string {
    return (value || '').trim().toUpperCase();
  }
  

  
  

  // ===========================
  // ==== Catálogos y combos ===
  // ===========================


  getTiposFormulario(): void {
    this.backendService.getTiposFormulario().subscribe({
      next: (resp) => {
        if (resp.success) {
          this.tiposFormulario = resp.data;
        }
      },
      error: () => {}
    });
  }

  // ===========================
  // ==== Manejo de Paginación =
  // ===========================
  goToFirstPage(): void {
    if (this.currentPage !== 1) {
      this.currentPage = 1;
      this.getPapeletas();
    }
  }
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.getPapeletas();
    }
  }
  nextPage(): void {
    if (this.currentPage < this.getTotalPages()) {
      this.currentPage++;
      this.getPapeletas();
    }
  }
  goToLastPage(): void {
    const totalPages = this.getTotalPages();
    if (this.currentPage !== totalPages) {
      this.currentPage = totalPages;
      this.getPapeletas();
    }
  }
  getTotalPages(): number {
    return this.totalPages;
  }

  // ===========================
  // ==== Utilidades varias ====
  // ===========================
  resetForm(): void {
    this.papeleta = this.createEmptyPapeleta();
    this.lugarOrigenSearch = '';
    this.lugarDestinoSearch = '';
    this.equipoSearchText = '';
    this.filteredEquipos = [];
    this.dropdownOpen = false;
  }

  toggleDropdown(open: boolean): void {
    this.dropdownOpen = open;
  }
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.toggleDropdown(false);
    }
  }
  showSuccessAlert(msg: string): void {
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: msg,
      showConfirmButton: false,
      timer: 2200,
      timerProgressBar: true,
      customClass: { popup: 'es-toast' }
    });
  }
  showErrorAlert(msg: string): void {
    Swal.fire({
      icon: 'error',
      title: 'Revise los datos',
      text: msg,
      confirmButtonText: 'Entendido',
      customClass: { popup: 'es-alert' }
    });
  }

  private closeModal(): void {
    const modalElement = document.getElementById('papeletaModal');
    const modal = modalElement ? (window as any).bootstrap.Modal.getInstance(modalElement) : null;
    modal?.hide();
  }

  private getErrorMessage(error: any, fallback: string): string {
    return error?.error?.message || error?.error?.detail || fallback;
  }
}
