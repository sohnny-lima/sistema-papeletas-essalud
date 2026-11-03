import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

/**
 * Solo deja entrar a administradores. Es un reflejo de interfaz: la API vuelve a
 * comprobar el rol en cada petición (verifyAdmin).
 */
@Injectable({
  providedIn: 'root'
})
export class AdminGuard implements CanActivate {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  canActivate(): boolean {
    if (this.authService.isAdmin()) {
      return true;
    }
    this.router.navigate(['/menu-principal/dashboard']);
    return false;
  }
}
