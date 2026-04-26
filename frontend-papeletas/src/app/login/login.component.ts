import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
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
    private router: Router
  ) {}

  toggleMostrarContrasena(): void {
    this.mostrarContrasena = !this.mostrarContrasena;
  }

  onSubmit(): void {
    console.log('Iniciando sesión con:', this.nombreUsuario);

    // Validar si los campos están vacíos
    if (!this.nombreUsuario || !this.contrasena) {
      this.errorMessage = 'Por favor, ingresa tu usuario y contraseña.';
      this.successMessage = ''; // Limpiar mensaje de éxito
      this.ocultarAlerta();
      return;
    }

    // Simulación de autenticación
    this.authService.login(this.nombreUsuario, this.contrasena).subscribe({
      next: () => {
        console.log('Inicio de sesión exitoso, navegando al menú principal');
        this.successMessage = 'Inicio de sesión exitoso. Redirigiendo...';
        this.errorMessage = ''; // Limpiar mensaje de error
        this.ocultarAlerta();

        // Simulación de redirección después de 2 segundos
        setTimeout(() => {
          this.router.navigate(['/menu-principal']);
        }, 2000);
      },
      error: (error: any) => {
        console.error('Error de inicio de sesión:', error);
        this.errorMessage = 'Credenciales incorrectas. Inténtalo nuevamente.';
        this.successMessage = ''; // Limpiar mensaje de éxito
        this.ocultarAlerta();
      }
    });
  }

  // Ocultar alertas después de 3 segundos
  ocultarAlerta(): void {
    setTimeout(() => {
      this.errorMessage = '';
      this.successMessage = '';
    }, 3000);
  }
}
