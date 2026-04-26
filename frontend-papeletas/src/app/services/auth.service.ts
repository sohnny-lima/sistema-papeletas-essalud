import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import jwt_decode from 'jwt-decode'; // <-- Versión 3.x lo soporta

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private authTokenKey = 'authToken';

  constructor(
    private router: Router,
    private http: HttpClient
  ) {}

  login(username: string, password: string): Observable<any> {
    return this.http
      .post<{ token: string }>('http://localhost:3000/api/auth/login', {
        nombreUsuario: username,
        contrasena: password
      })
      .pipe(
        tap(response => {
          this.saveToken(response.token);
          this.router.navigate(['/menu-principal']);
        })
      );
  }

  saveToken(token: string): void {
    localStorage.setItem(this.authTokenKey, token);
  }

  logout(): void {
    localStorage.removeItem(this.authTokenKey);
    this.router.navigate(['/login']);
  }

  /** Comprueba si el token no ha expirado */
  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) {
      return false;
    }
    try {
      // Decodificar el token usando 'decode as jwtDecode'
      const decoded: any = jwt_decode(token);
      // Si no tiene campo exp, considerarlo inválido
      if (!decoded.exp) {
        return false;
      }
      // exp está en segundos. Obtener tiempo actual (en seg)
      const currentTime = Math.floor(Date.now() / 1000);
      // Comprobar si exp > currentTime
      return decoded.exp > currentTime;
    } catch (error) {
      // Error al decodificar => token inválido
      return false;
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.authTokenKey);
  }
}
