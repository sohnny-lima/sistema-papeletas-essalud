import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetallePapeletaComponent } from './detalle-papeleta.component';

describe('DetallePapeletaComponent', () => {
  let component: DetallePapeletaComponent;
  let fixture: ComponentFixture<DetallePapeletaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetallePapeletaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetallePapeletaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
