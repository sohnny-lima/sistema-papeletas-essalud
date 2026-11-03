import { Component, ChangeDetectionStrategy } from '@angular/core';
import { VERSION_APLICACION } from '../version';

/** «Acerca del sistema»: identificación, versión, tecnologías y créditos. Sin declaraciones de titularidad. */
@Component({
    selector: 'app-acerca',
    templateUrl: './acerca.component.html',
    styleUrls: ['./acerca.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager
})
export class AcercaComponent {
  readonly version = VERSION_APLICACION;
  readonly candidata = VERSION_APLICACION.includes('-rc.');
  readonly anio = 2026;
  readonly desarrollador = 'Sohnny Walter Lima Infanzón';
  readonly tecnologias = [
    { nombre: 'Angular 22', detalle: 'Interfaz web (TypeScript)', icono: 'bi-window' },
    { nombre: 'Node.js 24 y Express', detalle: 'API REST con autenticación JWT', icono: 'bi-hdd-network' },
    { nombre: 'PostgreSQL 17', detalle: 'Base de datos relacional', icono: 'bi-database' },
    { nombre: 'Docker', detalle: 'Instalación con contenedores', icono: 'bi-box-seam' }
  ];
}
