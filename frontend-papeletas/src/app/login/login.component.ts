import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-login',
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    imports: [FormsModule, CommonModule]
})
export class LoginComponent {
  nombreUsuario: string = '';
  contrasena: string = '';
  errorMessage: string = '';
  successMessage: string = '';
  mostrarContrasena: boolean = false;

  constructor(
    private authService: AuthService,
    private route: ActivatedRoute
  ) {
    const sesion = this.route.snapshot.queryParamMap.get('sesion');
    if (sesion === 'caducada') {
      this.errorMessage = 'Su sesión ha caducado. Vuelva a iniciar sesión.';
    } else if (sesion === 'clave-cambiada') {
      // U3: aviso informativo, no un error, tras cambiar la propia contraseña.
      this.successMessage = 'Contraseña actualizada. Inicie sesión con la nueva.';
    } else if (sesion === 'otra-pestana') {
      // Mismo perfil del navegador: otra pestaña cerró la sesión compartida.
      this.successMessage = 'La sesión se cerró en otra pestaña.';
    }
  }

  toggleMostrarContrasena(): void {
    this.mostrarContrasena = !this.mostrarContrasena;
  }

  onSubmit(): void {
    this.errorMessage = '';
    this.successMessage = '';
    if (!this.nombreUsuario.trim() || !this.contrasena) {
      this.errorMessage = 'Complete el usuario y la contraseña.';
      return;
    }
    // Los nombres no admiten espacios en los extremos: un espacio pegado no debe contar como intento fallido.
    this.authService.login(this.nombreUsuario.trim(), this.contrasena).subscribe({
      next: () => {
        // AuthService guarda el token y realiza la única navegación.
        this.successMessage = 'Inicio de sesión exitoso. Redirigiendo...';
      },
      error: (error: any) => {
        if (error.status === 401) {
          this.errorMessage = 'Usuario o contraseña incorrectos.';
        } else if (error.status === 403) {
          // U2: solo llega con la clave correcta de una cuenta desactivada.
          this.errorMessage = 'La cuenta está desactivada. Contacte con un administrador.';
        } else if (error.status === 429) {
          this.errorMessage = 'Demasiados intentos. Espere unos minutos.';
        } else if (error.status === 400) {
          this.errorMessage = 'Complete el usuario y la contraseña.';
        } else if ([0, 502, 503, 504].includes(error.status)) {
          this.errorMessage = 'No se pudo conectar con el servidor. Compruebe su conexión e inténtelo nuevamente.';
        } else {
          this.errorMessage = 'No se pudo iniciar sesión. Inténtelo más tarde.';
        }
      }
    });
  }
}
