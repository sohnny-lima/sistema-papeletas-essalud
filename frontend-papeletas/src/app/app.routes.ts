import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { MenuPrincipalComponent } from './menu-principal/menu-principal.component';
import { TrabajadoresComponent } from './trabajadores/trabajadores.component';
import { EquiposComponent } from './equipos/equipos.component';
import { PapeletasComponent } from './papeletas/papeletas.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DetallePapeletaComponent } from './papeletas/detalle-papeleta/detalle-papeleta.component';
import { LugaresComponent } from './lugares/lugares.component';

import { CentrosComponent } from './centros/centros.component';

import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';

export const appRoutes: Routes = [
  { path: 'login', component: LoginComponent }, // La ruta de login no debe tener protección
  {
    path: 'menu-principal',
    component: MenuPrincipalComponent,
    canActivate: [AuthGuard],
    canActivateChild: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'trabajadores', component: TrabajadoresComponent },
      { path: 'equipos', component: EquiposComponent },
      { path: 'papeletas', component: PapeletasComponent },
      { path: 'papeletas/detalle/:id', component: DetallePapeletaComponent }, // Ruta agregada
      { path: 'lugares', component: LugaresComponent },
      // Información del sistema para cualquier usuario con sesión (carga diferida).
      { path: 'acerca', loadComponent: () => import('./acerca/acerca.component').then(m => m.AcercaComponent) },
      { path: 'centros', component: CentrosComponent, canActivate: [AdminGuard] },  // AuthGuard ya protege la ruta padre
      // Bloque U: gestión de cuentas, solo administradores (la API lo comprueba también). Carga diferida.
      {
        path: 'usuarios',
        canActivate: [AdminGuard],
        loadComponent: () => import('./usuarios/usuarios.component').then(m => m.UsuariosComponent)
      }
    ]
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
