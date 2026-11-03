import { Component, HostListener, OnInit, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { VERSION_APLICACION } from '../version';

@Component({
    selector: 'app-menu-principal',
    templateUrl: './menu-principal.component.html',
    styleUrls: ['./menu-principal.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [CommonModule, RouterModule]
})
export class MenuPrincipalComponent implements OnInit {
  isCollapsed = false; // Controla el estado del sidebar
  /** Versión mostrada en el pie (misma que APP_VERSION de las imágenes). */
  readonly version = VERSION_APLICACION;

  /** U3: usuario y rol de la sesión para el indicador del encabezado (informativo). */
  readonly sesion = computed(() => this.authService.sesion());
  /** Menú e indicador usan la misma fuente (la sesión confirmada); la API comprueba el rol. */
  private readonly esAdminSesion = computed(() => this.sesion()?.rol === 'admin');
  get esAdmin(): boolean { return this.esAdminSesion(); }
  readonly descripcionSesion = computed(() => {
    const s = this.sesion();
    return s ? `Sesión iniciada como ${s.nombreUsuario}, ${s.rolNombre}` : '';
  });

  constructor(private authService: AuthService) {}

  ngOnInit() {
    // Confirma usuario y rol con el servidor; el token ya da un valor inicial.
    this.authService.refrescarSesion();
    this.syncSidebarWithViewport();
  }

  @HostListener('window:resize')
  onResize() {
    this.syncSidebarWithViewport();
  }

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
  }

  closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      this.isCollapsed = true;
    }
  }

  private syncSidebarWithViewport() {
    this.isCollapsed = window.innerWidth <= 768;
  }

  logout() {
    this.authService.logout();
  }
}
