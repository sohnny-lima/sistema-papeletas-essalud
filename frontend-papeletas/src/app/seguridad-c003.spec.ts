import { TestBed } from '@angular/core/testing';
import { EMPTY, Subject, throwError } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { BackendService } from './services/backend.service';
import { AuthService } from './services/auth.service';
import { EquiposComponent } from './equipos/equipos.component';
import { TrabajadoresComponent } from './trabajadores/trabajadores.component';
import { PapeletasComponent } from './papeletas/papeletas.component';
import { LugaresComponent } from './lugares/lugares.component';
import { CentrosComponent } from './centros/centros.component';
import { CentroFormComponent } from './centros/centro-form/centro-form.component';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import Swal from 'sweetalert2';

describe('g009 #1 finalización sin next ni error (401 completado por el interceptor)', () => {
  let backend: jasmine.SpyObj<BackendService>;
  beforeEach(() => {
    backend = jasmine.createSpyObj('BackendService', ['getEquipos','getTrabajadores','getPapeletas','deletePapeleta','getLugares','getCentros','getEstadisticas','createLugar','updateLugar','createCentro','updateCentro']);
    TestBed.configureTestingModule({ providers: [
      { provide: BackendService, useValue: backend },
      { provide: AuthService, useValue: {isAdmin: () => true} }
    ] });
  });
  for (const [tipo, metodo, servicio, indicador] of [
    [EquiposComponent, 'getEquipos','getEquipos','isLoading'],
    [TrabajadoresComponent, 'getTrabajadores','getTrabajadores','isLoading'],
    [PapeletasComponent, 'getPapeletas','getPapeletas','isLoading'],
    [LugaresComponent, 'getLugares','getLugares','isLoading'],
    [CentrosComponent, 'cargarCentros','getCentros','cargando'],
    [DashboardComponent, 'cargarEstadisticas','getEstadisticas','cargando'],
  ] as const) {
    it(`${tipo.name} libera ${indicador} al completar vacío`, () => {
      const peticion = new Subject<any>();
      (backend[servicio] as jasmine.Spy).and.returnValue(peticion);
      const instancia: any = TestBed.createComponent(tipo as any).componentInstance;
      instancia[metodo]();
      expect(instancia[indicador]).toBeTrue();
      peticion.complete();
      expect(instancia[indicador]).toBeFalse();
    });
  }
  for (const edicion of [false,true]) {
    it(`Lugares libera guardando en ${edicion ? 'edición' : 'alta'} vacía`, () => {
      backend.createLugar.and.returnValue(EMPTY); backend.updateLugar.and.returnValue(EMPTY);
      const c = TestBed.createComponent(LugaresComponent).componentInstance;
      c.isAdmin=true; c.centros=[{id_centro:1,nombre_centro:'CENTRO'}];
      c.lugar={id_lugar:edicion?1:undefined,nombre_ambiente:'OFICINA',dependencia:'ADMINISTRACIÓN',id_centro:1};
      c.onSubmit();
      expect(edicion?backend.updateLugar:backend.createLugar).toHaveBeenCalled();
      expect(c.guardando).toBeFalse();
    });
    it(`CentroForm libera guardando en ${edicion ? 'edición' : 'alta'} vacía`, () => {
      backend.createCentro.and.returnValue(EMPTY); backend.updateCentro.and.returnValue(EMPTY);
      const c=TestBed.createComponent(CentroFormComponent).componentInstance;
      c.nombre='CENTRO'; if(edicion)c.centro={id_centro:1,nombre_centro:'CENTRO'};
      c.guardar();
      expect(edicion?backend.updateCentro:backend.createCentro).toHaveBeenCalled();
      expect(c.guardando).toBeFalse();
    });
  }
  it('Papeletas libera el indicador si el borrado completa vacío', async () => {
    const peticion=new Subject<any>(); backend.deletePapeleta.and.returnValue(peticion);
    spyOn(Swal,'fire').and.returnValue(Promise.resolve({isConfirmed:true} as any));
    const c=TestBed.createComponent(PapeletasComponent).componentInstance;
    c.deletePapeleta(1);await Promise.resolve();
    expect(c.isLoading).toBeTrue();peticion.complete();expect(c.isLoading).toBeFalse();
    expect(backend.getPapeletas).not.toHaveBeenCalled();
  });
  it('Papeletas mantiene el indicador de la recarga posterior al borrado', async () => {
    const borrado=new Subject<any>(), listado=new Subject<any>();
    backend.deletePapeleta.and.returnValue(borrado);backend.getPapeletas.and.returnValue(listado);
    spyOn(Swal,'fire').and.returnValue(Promise.resolve({isConfirmed:true} as any));
    const c=TestBed.createComponent(PapeletasComponent).componentInstance;
    c.deletePapeleta(1);await Promise.resolve();borrado.next({success:true});borrado.complete();
    expect(backend.getPapeletas).toHaveBeenCalled();expect(c.isLoading).toBeTrue();
    listado.complete();expect(c.isLoading).toBeFalse();
  });
});

describe('A3 login con límite de intentos', () => {
  it('429 muestra un mensaje claro y persistente', () => {
    const auth=jasmine.createSpyObj('AuthService',['login']);
    auth.login.and.returnValue(throwError(()=>({status:429})));
    TestBed.configureTestingModule({providers:[
      {provide:AuthService,useValue:auth},
      {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:{get:()=>null}}}}
    ]});
    const fixture=TestBed.createComponent(LoginComponent);
    fixture.componentInstance.nombreUsuario='ficticio';fixture.componentInstance.contrasena='incorrecta';
    fixture.componentInstance.onSubmit();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Demasiados intentos. Espere unos minutos.');
  });
});
