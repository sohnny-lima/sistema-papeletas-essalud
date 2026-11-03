import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UsuariosService, formatearNombreRol } from './usuarios.service';

describe('U4 F-03 UsuariosService', () => {
  let service: UsuariosService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UsuariosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listar envía parámetros search, estado, page y pageSize contra API_BASE_URL (/api/usuarios)', () => {
    service
      .listar({ search: 'admin', estado: 'activos', page: 2, pageSize: 10 })
      .subscribe((res) => {
        expect(res.success).toBeTrue();
        expect(res.data.totalItems).toBe(1);
        expect(res.data.data[0].nombre_usuario).toBe('admin_prueba');
      });

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/api/usuarios' &&
        r.params.get('search') === 'admin' &&
        r.params.get('estado') === 'activos' &&
        r.params.get('page') === '2' &&
        r.params.get('pageSize') === '10'
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      message: 'Usuarios obtenidos exitosamente',
      data: {
        data: [
          {
            id_usuario: 1,
            nombre_usuario: 'admin_prueba',
            id_rol: 1,
            rol: 'admin',
            rolNombre: 'Administrador',
            activo: true,
            fecha_creacion: '2026-10-28T12:00:00.000Z',
          },
        ],
        totalItems: 1,
        totalPages: 1,
        currentPage: 2,
      },
    });
  });

  it('listar aplica valores por defecto (page=1, pageSize=10, estado=todos) cuando no se indican', () => {
    service.listar().subscribe((res) => {
      expect(res.success).toBeTrue();
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url === '/api/usuarios' &&
        r.params.get('page') === '1' &&
        r.params.get('pageSize') === '10' &&
        r.params.get('estado') === 'todos' &&
        !r.params.has('search')
    );
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: { data: [], totalItems: 0, totalPages: 0, currentPage: 1 },
    });
  });

  it('obtener consulta GET /api/usuarios/:id', () => {
    service.obtener(5).subscribe((res) => {
      expect(res.data.id_usuario).toBe(5);
    });

    const req = httpMock.expectOne('/api/usuarios/5');
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: {
        id_usuario: 5,
        nombre_usuario: 'usuario_cinco',
        id_rol: 2,
        rol: 'user',
        rolNombre: 'Usuario',
        activo: true,
      },
    });
  });

  it('crear envía POST /api/usuarios con nombre_usuario, contrasena e id_rol', () => {
    const payload = {
      nombre_usuario: 'nuevo_operador',
      contrasena: 'Clave.Segura1',
      id_rol: 2,
    };

    service.crear(payload).subscribe((res) => {
      expect(res.success).toBeTrue();
      expect(res.data.nombre_usuario).toBe('nuevo_operador');
    });

    const req = httpMock.expectOne('/api/usuarios');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush({
      success: true,
      message: 'Usuario creado exitosamente',
      data: {
        id_usuario: 9,
        nombre_usuario: 'nuevo_operador',
        id_rol: 2,
        rol: 'user',
        rolNombre: 'Usuario',
        activo: true,
      },
    });
  });

  it('actualizar envía PUT /api/usuarios/:id con o sin contraseña opcional', () => {
    const payload = { nombre_usuario: 'operador_editado', id_rol: 1 };

    service.actualizar(9, payload).subscribe((res) => {
      expect(res.data.id_rol).toBe(1);
    });

    const req = httpMock.expectOne('/api/usuarios/9');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(payload);
    req.flush({
      success: true,
      message: 'Usuario actualizado exitosamente',
      data: {
        id_usuario: 9,
        nombre_usuario: 'operador_editado',
        id_rol: 1,
        rol: 'admin',
        rolNombre: 'Administrador',
        activo: true,
      },
    });
  });

  it('cambiarEstado envía PATCH /api/usuarios/:id/estado con booleano estricto', () => {
    service.cambiarEstado(9, false).subscribe((res) => {
      expect(res.data.activo).toBeFalse();
    });

    const req = httpMock.expectOne('/api/usuarios/9/estado');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ activo: false });
    req.flush({
      success: true,
      message: 'Estado del usuario actualizado exitosamente',
      data: {
        id_usuario: 9,
        nombre_usuario: 'operador_editado',
        id_rol: 1,
        activo: false,
      },
    });
  });

  it('politicaContrasena y roles consultan sus endpoints respectivos', () => {
    service.politicaContrasena().subscribe((res) => {
      expect(res.data.longitudMinima).toBe(10);
      expect(res.data.longitudMaximaBytes).toBe(72);
    });

    const reqPolitica = httpMock.expectOne('/api/usuarios/politica-contrasena');
    expect(reqPolitica.request.method).toBe('GET');
    reqPolitica.flush({
      success: true,
      data: { longitudMinima: 10, longitudMaximaBytes: 72 },
    });

    service.roles().subscribe((res) => {
      expect(res.data.length).toBe(2);
    });

    const reqRoles = httpMock.expectOne('/api/roles');
    expect(reqRoles.request.method).toBe('GET');
    reqRoles.flush({
      success: true,
      data: [
        { id_rol: 1, nombre_rol: 'ADMINISTRADOR' },
        { id_rol: 2, nombre_rol: 'USUARIO' },
      ],
    });
  });

  it('formatearNombreRol aplica la regla del contrato §7.14', () => {
    expect(formatearNombreRol(1, 'ADMINISTRADOR')).toBe('Administrador');
    expect(formatearNombreRol(2, 'USUARIO')).toBe('Usuario');
    expect(formatearNombreRol(3, 'AUDITOR_EXTERNO')).toBe('Auditor_externo');
  });
});
