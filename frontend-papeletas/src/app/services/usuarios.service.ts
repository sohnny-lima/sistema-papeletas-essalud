import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';

export type EstadoFiltroUsuario = 'activos' | 'inactivos' | 'todos';

export interface UsuarioItem {
  id_usuario: number;
  nombre_usuario: string;
  id_rol: number;
  rol?: 'admin' | 'user' | string;
  rolNombre?: string;
  activo: boolean;
  fecha_creacion?: string;
}

export interface ListaUsuariosData {
  data: UsuarioItem[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
}

export interface ListarUsuariosParams {
  search?: string;
  estado?: EstadoFiltroUsuario;
  page?: number;
  pageSize?: number;
}

export interface CrearUsuarioPayload {
  nombre_usuario: string;
  contrasena: string;
  id_rol: number;
}

export interface ActualizarUsuarioPayload {
  nombre_usuario: string;
  id_rol: number;
  contrasena?: string;
}

export interface PoliticaContrasena {
  longitudMinima: number;
  longitudMaximaBytes: number;
}

export interface RolItem {
  id_rol: number;
  nombre_rol: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

/**
 * Formatea el nombre del rol según el contrato §7.14:
 * 1 -> Administrador, 2 -> Usuario; cualquier otro con la inicial en mayúscula.
 */
export function formatearNombreRol(
  idRol?: number | null,
  nombreRol?: string | null,
  rolNombreApi?: string | null
): string {
  const id = Number(idRol);
  if (id === 1) return 'Administrador';
  if (id === 2) return 'Usuario';
  if (rolNombreApi === 'Administrador' || rolNombreApi === 'Usuario') {
    return rolNombreApi;
  }
  const bruto = (nombreRol ?? rolNombreApi ?? '').trim();
  if (!bruto) return 'Usuario';
  const minusculas = bruto.toLowerCase();
  if (minusculas === 'admin' || minusculas === 'administrador') return 'Administrador';
  if (minusculas === 'user' || minusculas === 'usuario') return 'Usuario';
  return minusculas.charAt(0).toUpperCase() + minusculas.slice(1);
}

@Injectable({
  providedIn: 'root',
})
export class UsuariosService {
  private readonly apiUrl = inject(API_BASE_URL);

  constructor(private readonly http: HttpClient) {}

  listar(opciones: ListarUsuariosParams = {}): Observable<ApiResponse<ListaUsuariosData>> {
    const page = opciones.page ?? 1;
    const pageSize = opciones.pageSize ?? 10;
    const estado = opciones.estado ?? 'todos';
    const search = opciones.search ?? '';

    let params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize))
      .set('estado', estado);

    if (search !== '') {
      params = params.set('search', search);
    }

    return this.http.get<ApiResponse<ListaUsuariosData>>(`${this.apiUrl}/usuarios`, { params });
  }

  obtener(id: number): Observable<ApiResponse<UsuarioItem>> {
    return this.http.get<ApiResponse<UsuarioItem>>(`${this.apiUrl}/usuarios/${id}`);
  }

  crear(payload: CrearUsuarioPayload): Observable<ApiResponse<UsuarioItem>> {
    return this.http.post<ApiResponse<UsuarioItem>>(`${this.apiUrl}/usuarios`, payload);
  }

  actualizar(id: number, payload: ActualizarUsuarioPayload): Observable<ApiResponse<UsuarioItem>> {
    return this.http.put<ApiResponse<UsuarioItem>>(`${this.apiUrl}/usuarios/${id}`, payload);
  }

  cambiarEstado(id: number, activo: boolean): Observable<ApiResponse<UsuarioItem>> {
    return this.http.patch<ApiResponse<UsuarioItem>>(`${this.apiUrl}/usuarios/${id}/estado`, {
      activo,
    });
  }

  politicaContrasena(): Observable<ApiResponse<PoliticaContrasena>> {
    return this.http.get<ApiResponse<PoliticaContrasena>>(
      `${this.apiUrl}/usuarios/politica-contrasena`
    );
  }

  roles(): Observable<ApiResponse<RolItem[]>> {
    return this.http.get<ApiResponse<RolItem[]>>(`${this.apiUrl}/roles`);
  }

  // Alias compatibles con la nomenclatura extendida de F-03
  listarUsuarios(opciones: ListarUsuariosParams = {}): Observable<ApiResponse<ListaUsuariosData>> {
    return this.listar(opciones);
  }

  obtenerUsuario(id: number): Observable<ApiResponse<UsuarioItem>> {
    return this.obtener(id);
  }

  crearUsuario(payload: CrearUsuarioPayload): Observable<ApiResponse<UsuarioItem>> {
    return this.crear(payload);
  }

  actualizarUsuario(
    id: number,
    payload: ActualizarUsuarioPayload
  ): Observable<ApiResponse<UsuarioItem>> {
    return this.actualizar(id, payload);
  }

  obtenerRoles(): Observable<ApiResponse<RolItem[]>> {
    return this.roles();
  }
}
