import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import {TransactionSuccessModalComponent} from '../components/transactionSuccessModal/transaction-success-modal.component';
import { AuctionPageComponent } from './auction-page.component';

describe('AuctionPageComponent', () => {
  let component: AuctionPageComponent;
  let fixture: ComponentFixture<AuctionPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ AuctionPageComponent, TransactionSuccessModalComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AuctionPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
