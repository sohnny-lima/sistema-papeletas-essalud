import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MenuPrincipalComponent } from './menu-principal.component';
import { AuthService, SesionUsuario } from '../services/auth.service';
import { RouterTestingModule } from '@angular/router/testing';
import { VERSION_APLICACION } from '../version';

class MockAuthService {
  // Bloque U (U3): sesión mostrada en el indicador del encabezado. El menú toma el rol de esta sesión.
  readonly estado = signal<SesionUsuario | null>({ idUsuario: 1, nombreUsuario: 'admin_prueba', rol: 'admin', rolNombre: 'Administrador' });
  private esAdministrador = true;
  get admin(): boolean { return this.esAdministrador; }
  set admin(valor: boolean) {
    this.esAdministrador = valor;
    this.estado.set(valor
      ? { idUsuario: 1, nombreUsuario: 'admin_prueba', rol: 'admin', rolNombre: 'Administrador' }
      : { idUsuario: 2, nombreUsuario: 'usuario_prueba', rol: 'user', rolNombre: 'Usuario' });
  }
  sesion = this.estado.asReadonly();
  refrescarSesion = jasmine.createSpy('refrescarSesion');
  logout() {}
  isAdmin(): boolean {
    return this.admin;
  }
  getRol(): 'admin' | 'user' | null {
    return this.admin ? 'admin' : 'user';
  }
}

describe('MenuPrincipalComponent', () => {
  let component: MenuPrincipalComponent;
  let fixture: ComponentFixture<MenuPrincipalComponent>;
  let authService: MockAuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuPrincipalComponent, RouterTestingModule],
      providers: [{ provide: AuthService, useClass: MockAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(MenuPrincipalComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService) as unknown as MockAuthService;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should call logout method when logout button is clicked', () => {
    spyOn(authService, 'logout');
    component.logout();
    expect(authService.logout).toHaveBeenCalled();
  });

  it('muestra el enlace «Centros asistenciales» solo cuando el usuario es administrador', () => {
    const textoAdmin = fixture.nativeElement.textContent;
    expect(textoAdmin).toContain('Centros asistenciales');

    authService.admin = false;
    const userFixture = TestBed.createComponent(MenuPrincipalComponent);
    userFixture.detectChanges();

    const textoUser = userFixture.nativeElement.textContent;
    expect(textoUser).not.toContain('Centros asistenciales');
  });

  describe('U3 indicador de sesión y menú «Usuarios»', () => {
    function crear() { const f = TestBed.createComponent(MenuPrincipalComponent); f.detectChanges(); return f; }
    const indicador = (f: ComponentFixture<MenuPrincipalComponent>) => f.nativeElement.querySelector('[data-sesion="indicador"]') as HTMLElement | null;

    it('muestra «admin_prueba · Administrador» con nombre accesible y confirma la sesión con el servidor', () => {
      const ind = indicador(fixture)!;
      expect(ind).toBeTruthy();
      expect(ind.querySelector('[data-sesion="usuario"]')!.textContent!.trim()).toBe('admin_prueba');
      expect(ind.querySelector('[data-sesion="rol"]')!.textContent!.trim()).toBe('Administrador');
      expect(ind.getAttribute('role')).toBe('status');
      expect(ind.getAttribute('aria-label')).toBe('Sesión iniciada como admin_prueba, Administrador');
      expect(ind.querySelector('.es-sesion__rol--admin')).toBeTruthy();
      expect(authService.refrescarSesion).toHaveBeenCalled();
    });

    it('muestra «usuario_prueba · Usuario» sin el distintivo de administrador', () => {
      authService.admin = false;
      authService.estado.set({ idUsuario: 2, nombreUsuario: 'usuario_prueba', rol: 'user', rolNombre: 'Usuario' });
      const ind = indicador(crear())!;
      expect(ind.querySelector('[data-sesion="usuario"]')!.textContent!.trim()).toBe('usuario_prueba');
      expect(ind.querySelector('[data-sesion="rol"]')!.textContent!.trim()).toBe('Usuario');
      expect(ind.querySelector('.es-sesion__rol--admin')).toBeNull();
    });

    it('se actualiza cuando el servidor confirma otro nombre (p. ej., tras renombrar la propia cuenta)', () => {
      authService.estado.set({ idUsuario: 1, nombreUsuario: 'admin_renombrado', rol: 'admin', rolNombre: 'Administrador' });
      fixture.detectChanges();
      expect(indicador(fixture)!.textContent).toContain('admin_renombrado');
    });

    it('sin sesión no muestra el indicador', () => {
      authService.estado.set(null);
      expect(indicador(crear())).toBeNull();
    });

    it('el enlace «Usuarios» solo aparece para administradores', () => {
      expect(fixture.nativeElement.querySelector('[data-menu="usuarios"]')).toBeTruthy();
      authService.admin = false;
      expect(crear().nativeElement.querySelector('[data-menu="usuarios"]')).toBeNull();
    });
  });

  describe('RC2 pie neutral', () => {
    it('el pie contiene «versión 1.0.0-rc.2» y no contiene «©», «Derechos» ni «SliSoft»', () => {
      const footer = fixture.nativeElement.querySelector('footer.footer') as HTMLElement | null;
      expect(footer).toBeTruthy();
      const texto = footer?.textContent ?? '';

      // Verifica la versión en el pie y su correspondencia con la constante
      expect(texto).toContain('versión 1.0.0-rc.2');
      expect(texto).toContain(`versión ${VERSION_APLICACION}`);
      // 03/11/2026: pie más sobrio; los créditos están en «Acerca del sistema», enlazado desde aquí.
      expect(texto).toContain('Formulario Único Patrimonial · versión');
      const enlace = footer?.querySelector('a[data-accion="acerca"]');
      expect(enlace?.getAttribute('href')).toBe('/menu-principal/acerca');
      expect(enlace?.textContent?.trim()).toBe('Acerca del sistema');

      // Verifica la eliminación de titulares no acreditados y reservas de derechos
      expect(texto).not.toContain('©');
      expect(texto).not.toContain('Derechos');
      expect(texto).not.toContain('SliSoft');
    });
  });
});
