import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}

  canActivate(): boolean {
    if (this.authService.isAuthenticated()) {
      return true; // pasa
    } else {
      console.warn('Token inválido o expirado. Redirigiendo al login...');
      this.router.navigate(['/login']);
      return false;
    }
  }
}
