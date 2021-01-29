import {
  Component,
  EventEmitter,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from "@angular/core";
import BigNumber from "bignumber.js";
import { AppComponent } from "../../app.component";
import { ContractService } from "../../services/contract";
import { Resolve, Router } from "@angular/router";

@Component({
  selector: "app-claim-page",
  templateUrl: "./claim-page.component.html",
  styleUrls: ["./claim-page.component.scss"],
})
export class ClaimPageComponent implements OnInit, OnDestroy {
  public account;
  public tokensDecimals;
  private accountSubscribe;
  public formsData: {
    swapAmount?: string;
  } = {};
  public swapContractBalance = {
    value: 0,
    fullValue: 0,
    fullValueNotBN: 0,
    fullValueNumber: 0,
  };
  public onChangeAccount: EventEmitter<any> = new EventEmitter();
  public swapTokensProgress: boolean;
  public updateSwapBalanceProgress: boolean;
  public withdrawH2TProgress: boolean;
  public burnTokensProgress: boolean;
  public claimTokensProgress: boolean;

  public dataSendForm = false;
  public leftDaysInfoChecker = true;

  public clacPenalty = 0;
  public toSwap = new BigNumber(0);
  public claimDataInfo = {
    claimedAddresses: 0,
    totalAddresses: 0,
    claimedAmount: 0,
    totalAmount: 0,
  };

  public swapNativeTokenInfo: any;

  @ViewChild("sendForm", { static: false }) sendForm;

  constructor(
    private contractService: ContractService,
    private ngZone: NgZone,
    private appComponent: AppComponent,
    private router: Router
  ) {
    this.initPage();

    this.tokensDecimals = this.contractService.getCoinsDecimals();
  }

  public checkDays() {
    if (this.leftDaysInfoChecker) {
      setTimeout(() => {
        this.contractService
          .getEndDateTimeHex3t()
          .then((result: { leftDaysInfo: number }) => {
            if (result.leftDaysInfo < 0) {
              this.leftDaysInfoChecker = false;
              this.router.navigate(["auction"], { preserveQueryParams: true });
            } else {
              this.checkDays();
            }
          });
      }, 1000);
    }
  }

  public initPage() {
    this.accountSubscribe = this.contractService
      .accountSubscribe()
      .subscribe((account: any) => {
        if (!account || account.balances) {
          this.ngZone.run(() => {
            this.account = account;
            if (account) {
              this.contractService
                .getEndDateTimeHex3t()
                .then((result: { leftDaysInfo: number }) => {
                  if (result.leftDaysInfo < 0) {
                    this.leftDaysInfoChecker = false;
                    this.router.navigate(["auction"], {
                      preserveQueryParams: true,
                    });
                  } else {
                    this.leftDaysInfoChecker = true;
                    this.checkDays();
                  }
                });

              this.updateSwapBalanceProgress = true;
              this.onChangeAmount();
              this.onChangeAccount.emit();
              this.getSnapshotInfo();
              this.readSwapNativeToken();
              this.contractService.swapTokenBalanceOf().then((balance) => {
                this.swapContractBalance = balance;
                this.readPenalty();
                this.updateSwapBalanceProgress = false;
              });
            }
            window.dispatchEvent(new Event("resize"));
          });
        }
      });
  }

  ngOnInit() {
    this.initPage();
  }

  ngOnDestroy() {
    this.leftDaysInfoChecker = false;
    this.accountSubscribe.unsubscribe();
  }

  private getSnapshotInfo() {
    this.contractService.getSnapshotInfo().then((res) => {
      this.claimDataInfo = res as any;
    });
  }

  private readSwapNativeToken() {
    this.contractService.readSwapNativeToken().then((result) => {
      this.swapNativeTokenInfo = result;
      window.dispatchEvent(new Event("resize"));
    });
  }

  public onChangeAmount() {
    if (
      this.formsData.swapAmount >
      this.account.balances.H2T.shortBigNumber.toString()
    ) {
      this.formsData.swapAmount = this.account.balances.H2T.shortBigNumber.toString();
    }

    this.dataSendForm =
      new BigNumber(this.formsData.swapAmount).toNumber() <= 0 ||
      this.formsData.swapAmount === undefined
        ? false
        : true;

    if (
      Number(this.formsData.swapAmount) > Number(this.account.balances.H2T.wei)
    ) {
      this.dataSendForm = false;
    }

    if (this.formsData.swapAmount === "") {
      this.dataSendForm = false;
    }

    if (this.formsData.swapAmount) {
      if (this.formsData.swapAmount.indexOf("+") !== -1) {
        this.dataSendForm = false;
      }
    }
  }

  private readPenalty() {
    this.contractService
      .calculatePenalty(this.swapContractBalance.fullValueNotBN)
      .then((res) => {
        this.clacPenalty = res;
        this.toSwap = new BigNumber(
          this.swapContractBalance.fullValueNotBN
        ).minus(this.clacPenalty);
      });
  }

  public swapH2T() {
    this.swapTokensProgress = true;
    this.contractService
      .swapH2T(this.formsData.swapAmount)
      .then(() => {
        this.contractService.updateH2TBalance(true).then(() => {
          this.formsData.swapAmount = "";
        });
      })
      .finally(() => {
        this.swapTokensProgress = false;
      });
  }

  public withdrawH2T() {
    this.withdrawH2TProgress = true;
    this.contractService
      .withdrawH2T()
      .then(() => {
        this.contractService.updateH2TBalance(true).then(() => {
          this.withdrawH2TProgress = false;
        });
      })
      .catch(() => {
        this.withdrawH2TProgress = false;
      });
  }

  public burnH2T() {
    this.burnTokensProgress = true;
    this.contractService
      .swapNativeToken()
      .then(() => {
        this.readPenalty();
        this.swapContractBalance = {
          value: 0,
          fullValue: 0,
          fullValueNotBN: 0,
          fullValueNumber: 0,
        };
        this.formsData.swapAmount = "";

        this.contractService.updateH2TBalance(true).then(() => {
          this.burnTokensProgress = false;
        });
      })
      .catch(() => {
        this.burnTokensProgress = false;
      });
  }

  public updateUserSnapshot() {
    if (
      !this.account.snapshot.nothingToClaim &&
      !this.account.completeClaim.hasClaimed
    ) {
      setTimeout(() => {
        this.contractService.updateUserSnapshot();
      }, 5000);
    }
  }

  public claim() {
    this.claimTokensProgress = true;
    this.contractService
      .claimFromForeign()
      .then(() => {
        this.contractService.updateH2TBalance(true).then(() => {
          this.claimTokensProgress = false;
          this.updateUserSnapshot();
        });
      })
      .finally(() => {
        this.claimTokensProgress = false;
      });
  }

  public subscribeAccount() {
    this.appComponent.subscribeAccount();
  }
}
