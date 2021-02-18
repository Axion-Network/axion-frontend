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

import { AuctionBid, ContractService, Auction } from "../../services/contract";
import { MatDialog } from "@angular/material/dialog";
import { TransactionSuccessModalComponent } from "src/app/components/transactionSuccessModal/transaction-success-modal.component";

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

  @ViewChild("smallBidModal", {
    static: true,
  })
  smallBidModal: TemplateRef<any>;

  @ViewChild("largeBidModal", {
    static: true,
  })
  largeBidModal: TemplateRef<any>;

  @ViewChild("withdrawModal", {
    static: true,
  })
  withdrawModal: TemplateRef<any>;

  @ViewChild("overBidModal", {
    static: true,
  })
  overBidModal: TemplateRef<any>;
  private overBidDialog;
  private smallBidDialog;
  private largeBidDialog;

  public changeSort = true;

  public sortData = {
    id: true,
  } as any;

  public account;
  public tokensDecimals;
  private accountSubscribe;
  public onChangeAccount: EventEmitter<any> = new EventEmitter();

  public formsData: {
    bidEthAmount?: string;
  } = {};

  public withdrawData: {
    dialog?: any;
    bid?: AuctionBid;
    autoStakeDays?: number;
    minAutostakeDays?: number;
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

  public poolInfo: Auction;

  public auctions: any = [];
  public auctionsIntervals: [];
  public completedAuctions: any = [];

  public currentSort: any = {};

  private settings: any = {};

  private usdcPerAxnPrice: BigNumber;
  private usdcPerEthPrice: BigNumber;
  private _1e18: string;


  constructor(
    public contractService: ContractService,
    private cookieService: CookieService,
    private ngZone: NgZone,
    private appComponent: AppComponent,
    private config: AppConfig,
    private dialog: MatDialog
  ) {
    this._1e18 = contractService._1e18;
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
              this.contractService.getAuctionPool().then(poolInfo => {
                this.poolInfo = poolInfo
                this.getAuctionPool();
                this.auctionPoolChecker = true;
              });
              
              this.usdcPerAxnPrice = await this.contractService.getUsdcPerAxnPrice();
              this.usdcPerEthPrice = await this.contractService.getUsdcPerEthPrice();
            }
          });
        }
      });

    this.tokensDecimals = this.contractService.getCoinsDecimals();
    this.settings = this.config.getConfig();
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
      Number(this.formsData.bidEthAmount) <= 0 ||
        this.formsData.bidEthAmount === undefined
        ? false
        : true;

    if (
      this.formsData.bidEthAmount >
      this.account.balances.ETH.shortBigNumber.toString()
    ) {
      this.formsData.bidEthAmount = this.account.balances.ETH.shortBigNumber.toString();
    }

    this.dataSendForm =
      new BigNumber(this.formsData.bidEthAmount).toNumber() <= 0 ||
        this.formsData.bidEthAmount === undefined
        ? false
        : true;

    if (
      Number(this.formsData.bidEthAmount) >
      Number(this.account.balances.ETH.wei)
    ) {
      this.dataSendForm = false;
    }

    if (this.formsData.bidEthAmount === "") {
      this.dataSendForm = false;
    }

    if (this.formsData.bidEthAmount) {
      if (this.formsData.bidEthAmount.indexOf("+") !== -1) {
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
    if (this.smallBidDialog)
      this.smallBidDialog.close();
    if (this.overBidDialog)
      this.overBidDialog.close();
    if (this.largeBidDialog)
      this.largeBidDialog.close();

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
      if (this.poolInfo.eth && this.poolInfo.axn) {
        // Small bid warning
        const potentialWinnings = new BigNumber(this.poolInfo.axnPerEth).times(this.formsData.bidEthAmount).div(this._1e18).dp(0);
        if (potentialWinnings.isZero()) {
          this.smallBidDialog = this.dialog.open(this.smallBidModal, {});
          return;
        }

        // Overbid warning
        if (this.poolInfo.isOverBid) {
          this.overBidDialog = this.dialog.open(this.overBidModal, {});
          return;
        }

        // Large bid warning
        const afterBidAuctionPrice = new BigNumber(this.poolInfo.axn).div(this.poolInfo.eth.plus(this.formsData.bidEthAmount));
        if (afterBidAuctionPrice.isLessThan(this.poolInfo.axnPerEth.times(0.75))) {
          this.largeBidDialog = this.dialog.open(this.largeBidModal, {});
          return;
        }
      }
    
    }

    this.sendAuctionProgress = true;
    const callMethod = this.formsData.bidEthAmount === this.account.balances.ETH.wei ? "sendMaxETHToAuction" : "sendETHToAuction";

    this.contractService[callMethod](this.formsData.bidEthAmount, refAddress)
      .then(
        ({ transactionHash }) => {
          this.contractService.updateETHBalance(true).then(() => {
            this.formsData.bidEthAmount = undefined;
          });
          
          this.dialog.open(TransactionSuccessModalComponent, {
            width: "400px",
            data: transactionHash,
          })
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

    let autoStakeDays = this.contractService.autoStakeDays;
    if (this.contractService.auctionModes[+bid.auctionId % 7] === "1") {
      autoStakeDays = this.contractService.ventureAutostakeDays;
    }

    this.withdrawData.minAutostakeDays = autoStakeDays
    this.withdrawData.autoStakeDays = autoStakeDays;
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
    return amount ? amount.times(this.usdcPerAxnPrice) : 0;
  }

  public getEthDollarValue(amount: BigNumber) {
    return amount ? amount.times(this.usdcPerEthPrice) : 0;
  }

  public sort(ev, type) {
    const fields = ev.active.split(".")
    if (ev.direction === "asc") {
      this[type].sort((a, b) => {
        if (fields.length > 1)
          return a[fields[0]][fields[1]] - b[fields[0]][fields[1]]
        else
          return a[ev.active] - b[ev.active]
      })
    } else if (ev.direction === "desc") {
      this[type].sort((a, b) => {
        if (fields.length > 1)
          return b[fields[0]][fields[1]] - a[fields[0]][fields[1]]
        else
          return b[ev.active] - a[ev.active]
      })
    }
  }
}
