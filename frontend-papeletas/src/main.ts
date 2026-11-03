import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS, withXhr } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';
import { AuthInterceptor } from './app/services/auth.interceptor';

// Configura la aplicación con el interceptor y otros proveedores necesarios
bootstrapApplication(AppComponent, {
  providers: [
    provideZoneChangeDetection(),provideRouter(appRoutes), // Proveedor de rutas de la aplicación
    provideHttpClient(withXhr(), withInterceptorsFromDi()), // Conserva el interceptor de autenticación.
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true } // Proveedor para el AuthInterceptor
  ]
}).catch(err => console.error(err));
