import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { BackendService } from '../../services/backend.service';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
  selector: 'app-detalle-papeleta',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detalle-papeleta.component.html',
  styleUrls: ['./detalle-papeleta.component.css'] // ✅ Asegúrate de que esta línea está presente
})

export class DetallePapeletaComponent implements OnInit {
  @ViewChild('pdfContent', { static: false }) pdfContent!: ElementRef;
  papeleta: any = {};

  constructor(private route: ActivatedRoute, private backendService: BackendService) {}

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.cargarDetalles(+id);
    }
  }

  cargarDetalles(id: number): void {
    this.backendService.getPapeletaById(id).subscribe({
      next: (response) => {
        this.papeleta = response.data;
      },
      error: () => {
        alert('Error al cargar los detalles de la papeleta');
      },
    });
  }


  imprimir(): void {
    const printContents = document.querySelector('.pdf-container')?.outerHTML || '';
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(`
        <html>
          <head>
            <title>Detalles de la Papeleta</title>
            <style>
              @media print {
                body {
                  font-family: Arial, sans-serif;
                  margin: 20px;
                  color: #333;
                }
                .card {
                  border: none;
                  box-shadow: none;
                }
                .card-header {
                  text-align: center;
                  font-size: 1.5rem;
                  font-weight: bold;
                }
                .card-body p {
                  margin: 10px 0;
                  font-size: 1rem;
                }
              }
            </style>
          </head>
          <body>${printContents}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }
}
