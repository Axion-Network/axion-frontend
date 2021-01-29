import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { StakingPageComponent } from './staking-page.component';

describe('StakingPageComponent', () => {
  let component: StakingPageComponent;
  let fixture: ComponentFixture<StakingPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ StakingPageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(StakingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
