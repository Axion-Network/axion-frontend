import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import {TransactionSuccessModalComponent} from '../components/transactionSuccessModal/transaction-success-modal.component';
import { MiningPageComponent } from './mining-page.component';

describe('MiningPageComponent', () => {
  let component: MiningPageComponent;
  let fixture: ComponentFixture<MiningPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ MiningPageComponent, TransactionSuccessModalComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MiningPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
