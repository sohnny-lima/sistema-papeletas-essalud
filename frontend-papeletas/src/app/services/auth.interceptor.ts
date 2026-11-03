import { Injectable, inject } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse } from '@angular/common/http';
import { EMPTY, Observable, throwError } from 'rxjs';
import { catchError, filter } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { API_BASE_URL, esApiPropia } from './api-config';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private apiUrl = inject(API_BASE_URL);
  constructor(
    private authService: AuthService
  ) {}

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    const authToken = this.authService.getToken();

    const propia = esApiPropia(request.url, this.apiUrl, window.location.origin);
    const isLoginRequest = propia && new URL(request.url, window.location.origin).pathname ===
      new URL(this.apiUrl.replace(/\/$/, '') + '/auth/login', window.location.origin).pathname;
    // El login no utiliza la sesión anterior.
    if (propia && authToken && !isLoginRequest) {
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${authToken}`
        }
      });
    }

    // Otra pestaña cambió la sesión mientras la petición estaba pendiente: su resultado ya no vale.
    const deOtraSesion = () => propia && !isLoginRequest && this.authService.getToken() !== authToken;
    // r007-1: nada sale con un token que esta pestaña no conoce ni durante la carga del documento nuevo.
    if (propia && !isLoginRequest && !this.authService.puedeEnviar(authToken)) return EMPTY;
    return next.handle(request).pipe(
      filter(() => !this.descartar(deOtraSesion())),
      catchError((error: HttpErrorResponse) => {
        if (this.descartar(deOtraSesion())) return EMPTY;
        if (error.status === 401 && propia && !isLoginRequest) {
          this.authService.expireSession(authToken);
          // El login muestra el aviso de sesión; ninguna pantalla debe abrir otra alerta.
          // También se descartan respuestas tardías de una sesión anterior.
          return EMPTY;
        }
        return throwError(() => error);
      })
    );
  }

  /** Al descartar, la pestaña se pone al día aunque no le haya llegado el evento `storage`. */
  private descartar(deOtraSesion: boolean): boolean {
    if (deOtraSesion) this.authService.comprobarCambioExterno();
    return deOtraSesion;
  }
}
