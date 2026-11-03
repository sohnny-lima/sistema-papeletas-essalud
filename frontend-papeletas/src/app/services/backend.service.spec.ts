import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { BackendService } from './backend.service';
import { AuthService } from './auth.service';

describe('BackendService', () => {
  let service: BackendService;
  let httpMock: HttpTestingController;
  let authService: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(BackendService);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('F4 delega el token al interceptor y conserva los parámetros de paginación', () => {
    spyOn(authService, 'getToken').and.returnValue('test-jwt-token');

    service.getPapeletas(2, 10, 'numero_papeleta', 'PA-0001').subscribe((res) => {
      expect(res.success).toBeTrue();
    });

    const req = httpMock.expectOne(
      (r) =>
        r.url.endsWith('/api/papeletas') &&
        r.params.get('page') === '2' &&
        r.params.get('pageSize') === '10' &&
        r.params.get('category') === 'numero_papeleta' &&
        r.params.get('filterText') === 'PA-0001'
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    expect(authService.getToken).not.toHaveBeenCalled();
    req.flush({ success: true, data: { data: [], totalItems: 0 } });
  });
});
