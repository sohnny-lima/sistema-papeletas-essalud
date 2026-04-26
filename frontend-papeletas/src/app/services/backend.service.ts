import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class BackendService {
  // Base URL del backend
  private apiUrl = 'http://localhost:3000/api';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  // -------------------------------------------------------
  // MÉTODOS AUXILIARES
  // -------------------------------------------------------

  // Obtiene encabezados con token de autenticación
  private getAuthHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
  }

  // Construye parámetros de consulta para paginación y filtros
  private buildParams(
    page: number,
    pageSize: number,
    filterCategory?: string,
    filterText?: string
  ): HttpParams {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (filterCategory) {
      params = params.set('category', filterCategory);
    }
    if (filterText) {
      params = params.set('filterText', filterText);
    }
    return params;
  }

  // -------------------------------------------------------
  // MÉTODOS GENERALES
  // -------------------------------------------------------

  getTiposFormulario(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/tipos/formulario`, {
      headers: this.getAuthHeaders(),
    });
  }

  getUltimoNumeroPapeleta(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/last/number`, {
      headers: this.getAuthHeaders(),
    });
  }

  // -------------------------------------------------------
  // BÚSQUEDAS
  // -------------------------------------------------------

  searchTrabajadores(search: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/trabajadores/buscar`, {
      params: { search },
      headers: this.getAuthHeaders(),
    });
  }

  searchLugares(searchValue: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/lugares/search`, {
      params: { searchText: searchValue }, // ✅ Clave correcta
      headers: this.getAuthHeaders(),
    });
  }

  searchEquipos(search: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/search/equipos`, {
      params: { search },
      headers: this.getAuthHeaders(),
    });
  }

  // -------------------------------------------------------
  // EQUIPOS
  // -------------------------------------------------------

  getEquipos(
    page: number,
    pageSize: number,
    filterCategory?: string,
    filterText?: string
  ): Observable<any> {
    const params = this.buildParams(page, pageSize, filterCategory, filterText);
    return this.http.get<any>(`${this.apiUrl}/equipos`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  getEquipoById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/equipos/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  createEquipo(equipo: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/equipos`, equipo, {
      headers: this.getAuthHeaders(),
    });
  }

  updateEquipo(id: number, equipo: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/equipos/${id}`, equipo, {
      headers: this.getAuthHeaders(),
    });
  }

  deleteEquipo(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/equipos/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  // -------------------------------------------------------
  // TRABAJADORES
  // -------------------------------------------------------

  getTrabajadores(
    page: number,
    pageSize: number,
    filterCategory?: string,
    filterText?: string
  ): Observable<any> {
    const params = this.buildParams(page, pageSize, filterCategory, filterText);
    return this.http.get<any>(`${this.apiUrl}/trabajadores`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  getTrabajadorById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/trabajadores/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  createTrabajador(trabajador: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/trabajadores`, trabajador, {
      headers: this.getAuthHeaders(),
    });
  }

  updateTrabajador(id: number, trabajador: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/trabajadores/${id}`, trabajador, {
      headers: this.getAuthHeaders(),
    });
  }

  deleteTrabajador(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/trabajadores/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  // -------------------------------------------------------
  // PAPELETAS
  // -------------------------------------------------------

  getPapeletas(
    page: number,
    pageSize: number,
    filterCategory?: string,
    filterText?: string
  ): Observable<any> {
    const requestParams = this.buildParams(page, pageSize, filterCategory, filterText);
    return this.http.get<any>(`${this.apiUrl}/papeletas`, {
      headers: this.getAuthHeaders(),
      params: requestParams,
    });
  }

  getPapeletaById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  createPapeleta(papeleta: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/papeletas`, papeleta, {
      headers: this.getAuthHeaders(),
    });
  }

  updatePapeleta(id: number, updatedData: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/papeletas/${id}`, updatedData, {
      headers: this.getAuthHeaders(),
    });
  }

  deletePapeleta(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/papeletas/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  // -------------------------------------------------------
  // LUGARES
  // -------------------------------------------------------

  getLugares(
    page: number,
    pageSize: number,
    filterCategory?: string,
    filterText?: string
  ): Observable<any> {
    const params = this.buildParams(page, pageSize, filterCategory, filterText);
    return this.http.get<any>(`${this.apiUrl}/lugares`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  getLugarById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/lugares/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  createLugar(lugarData: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/lugares`, lugarData, {
      headers: this.getAuthHeaders(),
    });
  }

  updateLugar(id: number, updatedData: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/lugares/${id}`, updatedData, {
      headers: this.getAuthHeaders(),
    });
  }

  deleteLugar(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/lugares/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  // -------------------------------------------------------
  // ESTADÍSTICAS
  // -------------------------------------------------------

  getEstadisticas(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/estadisticas`, {
      headers: this.getAuthHeaders(),
    });
  }

  // -------------------------------------------------------
  // REGISTRO DE MOVIMIENTOS
  // -------------------------------------------------------

  getRegistroMovimientos(page: number, pageSize: number): Observable<any> {
    const params = this.buildParams(page, pageSize);
    return this.http.get<any>(`${this.apiUrl}/registro_movimientos`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  createRegistroMovimiento(movimientoData: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/registro_movimientos`, movimientoData, {
      headers: this.getAuthHeaders(),
    });
  }

  getRegistroMovimientoById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/registro_movimientos/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  updateRegistroMovimiento(id: number, updatedData: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/registro_movimientos/${id}`, updatedData, {
      headers: this.getAuthHeaders(),
    });
  }

  deleteRegistroMovimiento(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/registro_movimientos/${id}`, {
      headers: this.getAuthHeaders(),
    });
  }

  // -------------------------------------------------------
  // CENTROS ASISTENCIALES
  // -------------------------------------------------------

  getCentros(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/centros_asistenciales`, {
      headers: this.getAuthHeaders(),
    });
  }
}
