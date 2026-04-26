import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { MenuPrincipalComponent } from './menu-principal/menu-principal.component';
import { TrabajadoresComponent } from './trabajadores/trabajadores.component';
import { EquiposComponent } from './equipos/equipos.component';
import { PapeletasComponent } from './papeletas/papeletas.component';
import { PapeletaFormComponent } from './papeleta-form/papeleta-form.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { DetallePapeletaComponent } from './papeletas/detalle-papeleta/detalle-papeleta.component';
import { LugaresComponent } from './lugares/lugares.component';

import { AuthGuard } from './auth.guard';

export const appRoutes: Routes = [
  { path: 'login', component: LoginComponent }, // La ruta de login no debe tener protección
  {
    path: 'menu-principal',
    component: MenuPrincipalComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      { path: 'dashboard', component: DashboardComponent },
      { path: 'trabajadores', component: TrabajadoresComponent },
      { path: 'equipos', component: EquiposComponent },
      { path: 'papeletas', component: PapeletasComponent },
      { path: 'papeletas/detalle/:id', component: DetallePapeletaComponent }, // Ruta agregada
      { path: 'papeleta-form', component: PapeletaFormComponent },
      { path: 'lugares', component: LugaresComponent }
    ]
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' }
];
