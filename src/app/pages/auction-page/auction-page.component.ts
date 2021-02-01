import {
  Component,
  EventEmitter,
  NgZone,
  OnDestroy,
  ViewChild,
  TemplateRef,
} from "@angular/core";
import BigNumber from "bignumber.js";
import * as moment from "moment";
import { CookieService } from "ngx-cookie-service";
import { AppComponent } from "../../app.component";
import { AppConfig } from "../../appconfig";
import { MetamaskErrorComponent } from "../../components/metamaskError/metamask-error.component";

import { AuctionBid, ContractService } from "../../services/contract";
import { MatDialog } from "@angular/material/dialog";

@Component({
  selector: "app-auction-page",
  templateUrl: "./auction-page.component.html",
  styleUrls: ["./auction-page.component.scss"],
})
export class AuctionPageComponent implements OnDestroy {
  @ViewChild("successModal", {
    static: true,
  })
  successModal: TemplateRef<any>;

  @ViewChild("warningModal", {
    static: true,
  })
  warningModal: TemplateRef<any>;

  @ViewChild("withdrawModal", {
    static: true,
  })
  withdrawModal: TemplateRef<any>;

  @ViewChild("overBidModal", {
    static: true,
  })
  overBidModal: TemplateRef<any>;
  private overBidDialog;
  private warningDialog;

  public changeSort = true;

  public sortData = {
    id: true,
  } as any;

  public account;
  public tokensDecimals;
  private accountSubscribe;
  public onChangeAccount: EventEmitter<any> = new EventEmitter();

  public formsData: {
    auctionAmount?: string;
  } = {};

  public withdrawData: {
    dialog?: any;
    bid?: AuctionBid;
    autoStakeDays?: number;
  } = {};

  public referalLink = "";
  public stakeMaxDays = 5555;
  public referalAddress = "";
  public addressCopy = false;
  public auctionPoolChecker = false;
  public currentAuctionDate = new Date();

  public today = new Date().getTime();

  public dataSendForm = false;
  public newAuctionDay = false;
  public auctionTimer = "";
  public checker = undefined;

  public sendAuctionProgress: boolean;
  public activeBids: AuctionBid[] = [];
  public withdrawnBids: AuctionBid[] = [];
  public withdrawnV1Bids: AuctionBid[] = [];

  public poolInfo: any = {
    axn: 0,
    eth: 0,
  };

  public auctions: any = [];
  public auctionsIntervals: [];
  public completedAuctions: any = [];

  public currentSort: any = {};

  private settings: any = {};

  private usdcPerAxnPrice: BigNumber;
  private usdcPerEthPrice: BigNumber;

  constructor(
    public contractService: ContractService,
    private cookieService: CookieService,
    private ngZone: NgZone,
    private appComponent: AppComponent,
    private config: AppConfig,
    private dialog: MatDialog
  ) {
    this.referalAddress = this.cookieService.get("ref");
    this.accountSubscribe = this.contractService
      .accountSubscribe()
      .subscribe((account: any) => {
        if (!account || account.balances) {
          this.ngZone.run(async () => {
            this.account = account;
            window.dispatchEvent(new Event("resize"));

            if (account) {
              this.getAuctions();
              this.onChangeAmount();
              this.onChangeAccount.emit();
              this.getWalletBids();

              const info = await this.contractService.getAuctionPool();
              this.poolInfo = info;
              this.getAuctionPool();
              this.auctionPoolChecker = true;

              this.usdcPerAxnPrice = await this.contractService.getUsdcPerAxnPrice();
              this.usdcPerEthPrice = await this.contractService.getUsdcPerEthPrice();
            }
          });
        }
      });

    this.tokensDecimals = this.contractService.getCoinsDecimals();
    this.settings = config.getConfig();
  }

  ngOnDestroy() {
    this.auctionPoolChecker = false;
    this.accountSubscribe.unsubscribe();
  }

  public scanDate(date) {
    const a1 = moment(new Date());
    const b1 = moment(date);

    if (Number(a1.format("D")) === Number(b1.format("D"))) {
      a1.add(1, "day");
    }

    const check = a1.diff(b1);

    if (check < 0) {
      this.newAuctionDay = true;
    }

    this.setNewDayTimer();

    this.auctionTimer = moment
      .utc(
        moment(b1, "DD/MM/YYYY HH:mm:ss").diff(
          moment(a1, "DD/MM/YYYY HH:mm:ss")
        )
      )
      .format("HH:mm:ss");
  }

  public setNewDayTimer(date?) {
    if (date) {
      this.currentAuctionDate = date;
    }

    if (!this.newAuctionDay) {
      this.checker = setTimeout(() => {
        if (this.checker) {
          this.scanDate(this.currentAuctionDate);
        }
      }, 1000);
    } else {
      this.checker = undefined;
      this.getAuctions();
    }
  }

  public getAuctions() {
    this.contractService.getAuctions().then((res: Array<any>) => {
      this.auctions = res.filter((x) => x.time.state !== "finished");
      this.completedAuctions = res.filter((x) => x.time.state === "finished");

      let todaysAuction = this.auctions.find(
        (auction) => auction.time.state === "progress"
      );
      this.setNewDayTimer(todaysAuction.time.date);
      this.newAuctionDay = false;
    });
  }

  public getWalletBids() {
    this.contractService.getWalletBidsAsync().then((bids) => {
      this.activeBids = bids.active ? bids.active : [];
      this.withdrawnBids = bids.withdrawn ? bids.withdrawn : [];
      this.withdrawnV1Bids = bids.withdrawnV1 ? bids.withdrawnV1 : [];

      this.referalLink = "";
    });
  }

  public onChangeAmount() {
    this.dataSendForm =
      Number(this.formsData.auctionAmount) <= 0 ||
        this.formsData.auctionAmount === undefined
        ? false
        : true;

    if (
      this.formsData.auctionAmount >
      this.account.balances.ETH.shortBigNumber.toString()
    ) {
      this.formsData.auctionAmount = this.account.balances.ETH.shortBigNumber.toString();
    }

    this.dataSendForm =
      new BigNumber(this.formsData.auctionAmount).toNumber() <= 0 ||
        this.formsData.auctionAmount === undefined
        ? false
        : true;

    if (
      Number(this.formsData.auctionAmount) >
      Number(this.account.balances.ETH.wei)
    ) {
      this.dataSendForm = false;
    }

    if (this.formsData.auctionAmount === "") {
      this.dataSendForm = false;
    }

    if (this.formsData.auctionAmount) {
      if (this.formsData.auctionAmount.indexOf("+") !== -1) {
        this.dataSendForm = false;
      }
    }
  }

  private getAuctionPool() {
    setTimeout(async () => {
      const info = await this.contractService.getAuctionPool();
      if (info.axnPerEth.toNumber() === 0) {
        info.axnPerEth = this.poolInfo.axnPerEth;
      }

      this.poolInfo = info;

      if (this.auctionPoolChecker) {
        this.getAuctionPool();
      }
    }, this.settings.settings.checkerAuctionPool);
  }

  public successLowProfit() {
    if (this.warningDialog)
      this.warningDialog.close();
    if (this.overBidDialog)
      this.overBidDialog.close();

    this.sendETHToAuction(true);
  }

  public sendETHToAuction(withoutWarning?) {
    const refAddress = this.cookieService.get("ref")
    if (refAddress.toLowerCase() === this.account.address.toLowerCase()) {
      this.dialog.open(MetamaskErrorComponent, {
        width: "400px",
        data: {
          msg: "It appears you are trying to self refer using your own referral link. Please use a different referral link before proceeding.",
        },
      });
      return;
    }

    if (!withoutWarning) {

      // Low Bid warning
      const _1e18 = new BigNumber(10).pow(this.tokensDecimals.ETH);
      const myTokens = new BigNumber(this.poolInfo.axnPerEth).times(this.formsData.auctionAmount).div(_1e18).dp(0);
      if (myTokens.isZero()) {
        this.warningDialog = this.dialog.open(this.warningModal, {});
        return;
      }

      // Overbid warning
      if (this.poolInfo.isOverBid) {
        this.overBidDialog = this.dialog.open(this.overBidModal, {});
        return;
      }
    }

    this.sendAuctionProgress = true;

    const callMethod =
      this.formsData.auctionAmount === this.account.balances.ETH.wei
        ? "sendMaxETHToAuctionV2"
        : "sendETHToAuctionV2";

    this.contractService[callMethod](
      this.formsData.auctionAmount,
      refAddress
    )
      .then(
        ({ transactionHash }) => {
          this.contractService.updateETHBalance(true).then(() => {
            this.formsData.auctionAmount = undefined;
          });
        },
        (err) => {
          if (err.message) {
            this.dialog.open(MetamaskErrorComponent, {
              width: "400px",
              data: {
                msg: err.message,
              },
            });
          }
        }
      )
      .finally(() => {
        this.sendAuctionProgress = false;
      });
  }

  public generateRefLink() {
    this.referalLink =
      window.location.origin + "/auction?ref=" + this.account.address;
  }

  public onCopied() {
    this.addressCopy = true;

    setTimeout(() => {
      this.addressCopy = false;
    }, 2500);
  }

  public openWithdrawBid(bid: AuctionBid) {
    this.withdrawData.bid = bid;
    this.withdrawData.autoStakeDays = this.contractService.autoStakeDays;
    this.withdrawData.dialog = this.dialog.open(this.withdrawModal, {});
  }

  public confirmAutostakeDays() {
    this.withdrawData.dialog.close();

    this.bidWithdraw(
      this.withdrawData.bid,
      this.withdrawData.autoStakeDays
    )

  }

  public bidWithdraw(bid, autoStakeDays) {
    bid.withdrawProgress = true;

    if (!bid.isV1) {
      this.contractService
        .withdrawFromAuction(bid.auctionId, autoStakeDays)
        .then(() => {
          this.contractService.loadAccountInfo();
          bid.status = "complete";
          this.getWalletBids();
        })
        .finally(() => {
          bid.withdrawProgress = false;
        });
    } else {
      this.contractService
        .withdrawFromAuctionV1(bid.auctionId, autoStakeDays)
        .then(() => {
          this.contractService.loadAccountInfo();
          bid.status = "complete";
          this.getWalletBids();
        })
        .finally(() => {
          bid.withdrawProgress = false;
        });
    }
  }

  public subscribeAccount() {
    this.appComponent.subscribeAccount();
  }

  public getAxnDollarValue(amount: BigNumber) {
    return amount.times(this.usdcPerAxnPrice);
  }

  public getEthDollarValue(amount: BigNumber) {
    return amount.times(this.usdcPerEthPrice);
  }

  // private applySort() {
  //   if (this.currentSort.field) {
  //     this.activeBids.sort((a, b) => {
  //       let aValue = a[this.currentSort.field];
  //       let bValue = b[this.currentSort.field];
  //       switch (this.currentSort.field) {
  //         case "start":
  //           aValue = aValue.getTime();
  //           bValue = bValue.getTime();
  //           break;
  //         case "token":
  //         case "eth":
  //         case "accountTokenBalance":
  //           aValue = aValue.toNumber();
  //           bValue = bValue.toNumber();
  //           break;
  //       }

  //       return aValue > bValue
  //         ? this.currentSort.ask
  //           ? 1
  //           : -1
  //         : aValue < bValue
  //         ? this.currentSort.ask
  //           ? -1
  //           : 1
  //         : 1;
  //     });
  //   } else {
  //     this.activeBids.sort((a, b) => {
  //       return Number(a.auctionId) > Number(b.auctionId) ? 1 : -1;
  //     });
  //   }
  // }

  // public async sortAuctions(type: string, tdate?: string) {
  //   this.sortData[type] && this.changeSort
  //     ? (this.changeSort = false)
  //     : (this.changeSort = true);
  //   Object.keys(this.sortData).forEach((v) => (this.sortData[v] = v === type));

  //   this.auctions.sort((auctionsList1, auctionsList2) => {
  //     let sortauctionsList1: any;
  //     let sortauctionsList2: any;

  //     if (tdate) {
  //       sortauctionsList1 =
  //         tdate === "date"
  //           ? new Date(auctionsList1[type]).getDate()
  //           : new Date(auctionsList1[type]).getTime();
  //       sortauctionsList2 =
  //         tdate === "date"
  //           ? new Date(auctionsList2[type]).getDate()
  //           : new Date(auctionsList2[type]).getTime();
  //     } else {
  //       sortauctionsList1 = auctionsList1[type];
  //       sortauctionsList2 = auctionsList2[type];
  //     }

  //     if (this.changeSort) {
  //       return sortauctionsList1 > sortauctionsList2 ? 1 : -1;
  //     } else {
  //       return sortauctionsList1 < sortauctionsList2 ? 1 : -1;
  //     }
  //   });
  // }

  // public sortAuctions(field) {
  //   const currentUseField = this.currentSort.field;

  //   if (currentUseField !== field) {
  //     this.currentSort.field = field;
  //     this.currentSort.ask = false;
  //   } else {
  //     if (!this.currentSort.ask) {
  //       this.currentSort.ask = true;
  //     } else {
  //       this.currentSort.field = undefined;
  //     }
  //   }
  //   this.applySort();
  // }
}
