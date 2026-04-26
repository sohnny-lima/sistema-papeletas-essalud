import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';
import { AuthInterceptor } from './app/services/auth.interceptor';
import { importProvidersFrom } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';

// Configura la aplicación con el interceptor y otros proveedores necesarios
bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(appRoutes), // Proveedor de rutas de la aplicación
    importProvidersFrom(HttpClientModule), // Importa el módulo HttpClient para solicitudes HTTP
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true } // Proveedor para el AuthInterceptor
  ]
}).catch(err => console.error(err));
