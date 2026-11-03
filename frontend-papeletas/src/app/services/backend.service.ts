import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from './api-config';

@Injectable({
  providedIn: 'root',
})
export class BackendService {
  // Base URL del backend
  private apiUrl = inject(API_BASE_URL);

  constructor(private http: HttpClient) {}

  // -------------------------------------------------------
  // MÉTODOS AUXILIARES
  // -------------------------------------------------------

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
    return this.http.get<any>(`${this.apiUrl}/papeletas/tipos/formulario`);
  }

  getUltimoNumeroPapeleta(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/last/number`);
  }

  // -------------------------------------------------------
  // BÚSQUEDAS
  // -------------------------------------------------------

  searchTrabajadores(search: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/trabajadores/buscar`, {
      params: { search },
    });
  }

  searchLugares(searchValue: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/lugares/search`, {
      params: { searchText: searchValue }, // ✅ Clave correcta
    });
  }

  searchEquipos(search: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/search/equipos`, {
      params: { search },
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
      params,
    });
  }

  getEquipoById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/equipos/${id}`);
  }

  createEquipo(equipo: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/equipos`, equipo);
  }

  updateEquipo(id: number, equipo: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/equipos/${id}`, equipo);
  }

  deleteEquipo(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/equipos/${id}`);
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
      params,
    });
  }

  getTrabajadorById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/trabajadores/${id}`);
  }

  createTrabajador(trabajador: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/trabajadores`, trabajador);
  }

  updateTrabajador(id: number, trabajador: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/trabajadores/${id}`, trabajador);
  }

  deleteTrabajador(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/trabajadores/${id}`);
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
      params: requestParams,
    });
  }

  getPapeletaById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/papeletas/${id}`);
  }

  createPapeleta(papeleta: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/papeletas`, papeleta);
  }

  updatePapeleta(id: number, updatedData: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/papeletas/${id}`, updatedData);
  }

  deletePapeleta(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/papeletas/${id}`);
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
      params,
    });
  }

  getLugarById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/lugares/${id}`);
  }

  createLugar(lugarData: any): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/lugares`, lugarData);
  }

  updateLugar(id: number, updatedData: any): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/lugares/${id}`, updatedData);
  }

  deleteLugar(id: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/lugares/${id}`);
  }

  // -------------------------------------------------------
  // ESTADÍSTICAS
  // -------------------------------------------------------

  getEstadisticas(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/estadisticas`);
  }

  // -------------------------------------------------------
  // REGISTRO DE MOVIMIENTOS
  // -------------------------------------------------------

  getRegistroMovimientos(page: number, pageSize: number): Observable<any> {
    const params = this.buildParams(page, pageSize);
    return this.http.get<any>(`${this.apiUrl}/registro_movimientos`, {
      params,
    });
  }

  getRegistroMovimientoById(id: number): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/registro_movimientos/${id}`);
  }

  // -------------------------------------------------------
  // CENTROS ASISTENCIALES
  // -------------------------------------------------------

  // Respuesta { success, message, data: [{ id_centro, nombre_centro, total_lugares }] }
  getCentros(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/centros_asistenciales`);
  }

  createCentro(centroData: { nombre_centro: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/centros_asistenciales`, centroData);
  }

  updateCentro(id: number, centroData: { nombre_centro: string }): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/centros_asistenciales/${id}`, centroData);
  }
}
