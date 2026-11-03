import { Component, ChangeDetectionStrategy } from '@angular/core';
import { Router, NavigationEnd, RouterModule } from '@angular/router';


import { AuthService } from './services/auth.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [
    RouterModule
]
})
export class AppComponent {
  title = 'frontend-papeletas';
  isLoginPage: boolean = false;

  constructor(private router: Router, private authService: AuthService) {
    // Suscripción al evento de navegación para verificar si estamos en la página de login
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.isLoginPage = event.url === '/login' || event.urlAfterRedirects === '/login';
      }
    });
  }

  // Método para verificar si el usuario está autenticado
  isAuthenticated(): boolean {
    return this.authService.isAuthenticated();
  }
}
