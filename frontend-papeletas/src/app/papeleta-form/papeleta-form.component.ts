import { Component } from '@angular/core';
import { BackendService } from '../services/backend.service'; // Importa el servicio para el CRUD
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms'; // Importa FormsModule

@Component({
  selector: 'app-papeleta-form',
  standalone: true,
  templateUrl: './papeleta-form.component.html',
  styleUrls: ['./papeleta-form.component.css'],
  imports: [CommonModule, FormsModule] // Asegúrate de agregar FormsModule aquí
})
export class PapeletaFormComponent {
  // Propiedad para almacenar los datos del formulario
  formularioPapeleta = {
    formato: {
      tomaInventario: false,
      cuadroAsignacion: false,
      desplazamiento: false,
    },
    datosOrigen: {
      trabajador: '',
      dependencia: '',
      ambiente: '',
    },
    datosDestino: {
      trabajador: '',
      dependencia: '',
      ambiente: '',
    },
    datosBienes: [
      {
        codigoPatrimonial: '',
        descripcion: '',
        marca: '',
        serie: '',
        modelo: '',
        estado: '',
      }
    ]
  };

  constructor(private backendService: BackendService) {}

  // Método para agregar un nuevo bien al formulario
  agregarBien() {
    this.formularioPapeleta.datosBienes.push({
      codigoPatrimonial: '',
      descripcion: '',
      marca: '',
      serie: '',
      modelo: '',
      estado: '',
    });
  }

  // Método para guardar los datos en el backend
  guardarDatos() {
    this.backendService.createPapeleta(this.formularioPapeleta).subscribe(
      (response) => {
        console.log('Datos guardados exitosamente:', response);
        alert('Papeleta guardada exitosamente');
      },
      (error) => {
        console.error('Error al guardar los datos:', error);
        alert('Hubo un error al guardar la papeleta');
      }
    );
  }

  // Método para limpiar el formulario
  limpiarFormulario() {
    this.formularioPapeleta = {
      formato: {
        tomaInventario: false,
        cuadroAsignacion: false,
        desplazamiento: false,
      },
      datosOrigen: {
        trabajador: '',
        dependencia: '',
        ambiente: '',
      },
      datosDestino: {
        trabajador: '',
        dependencia: '',
        ambiente: '',
      },
      datosBienes: [
        {
          codigoPatrimonial: '',
          descripcion: '',
          marca: '',
          serie: '',
          modelo: '',
          estado: '',
        }
      ]
    };
  }
}
