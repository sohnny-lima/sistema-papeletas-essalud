import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AcercaComponent } from './acerca.component';
import { VERSION_APLICACION } from '../version';

describe('RC2 Acerca del sistema', () => {
  let fixture: ComponentFixture<AcercaComponent>;
  let texto: string;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AcercaComponent] }).compileComponents();
    fixture = TestBed.createComponent(AcercaComponent);
    fixture.detectChanges();
    texto = fixture.nativeElement.textContent;
  });

  it('muestra nombre, descripción, versión, tecnologías, desarrollador y año', () => {
    expect(texto).toContain('Sistema de Papeletas de Movimiento de Bienes Patrimoniales');
    expect(texto).toContain('Formulario Único Patrimonial');
    expect(fixture.nativeElement.querySelector('[data-acerca="version"]').textContent.trim()).toBe(VERSION_APLICACION);
    expect(texto).toContain('Versión candidata');
    for (const t of ['Angular 22', 'Node.js 24', 'PostgreSQL 17', 'Docker']) expect(texto).toContain(t);
    expect(fixture.nativeElement.querySelector('[data-acerca="desarrollador"]').textContent.trim()).toBe('Sohnny Walter Lima Infanzón');
    expect(fixture.nativeElement.querySelector('[data-acerca="anio"]').textContent.trim()).toBe('2026');
  });

  it('no declara titularidad ni derechos reservados', () => {
    expect(texto).not.toMatch(/©|derechos reservados|todos los derechos/i);
  });

  it('usa el encabezado común de las pantallas', () => {
    expect(fixture.nativeElement.querySelector('.es-page-head h2').textContent).toContain('Acerca del sistema');
  });
});
