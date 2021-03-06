import {
  Component,
  EventEmitter,
  NgZone,
  OnDestroy,
  TemplateRef,
  ViewChild,
} from "@angular/core";
import { ContractService, stakingMaxDays, Stake, VentureAuctionDivs } from "../../services/contract";
import BigNumber from "bignumber.js";
import { AppConfig } from "../../appconfig";
import { MatDialog } from "@angular/material/dialog";
import { TransactionSuccessModalComponent } from "src/app/components/transactionSuccessModal/transaction-success-modal.component";
import { MetamaskErrorComponent } from "src/app/components/metamaskError/metamask-error.component";

interface StakingInfoInterface {
  ShareRate: number;
  StepsFromStart: number;
  closestYearShares?: string;
  closestPoolAmount?: string;
}

const FULL_PERIOD = 700;
const AVAILABLE_DAYS_AFTER_END = 14;

@Component({
  selector: "app-staking-page",
  templateUrl: "./staking-page.component.html",
  styleUrls: ["./staking-page.component.scss"],
})
export class StakingPageComponent implements OnDestroy {
  public account;
  public tableInfo;
  public tokensDecimals;
  public stakeMaxDays = 5555;
  private accountSubscribe;
  public shareRate = 0;
  public hasBigPayDay = false;
  public stakeEndDate: any;
  public startDay = new Date();
  public maxSharesActive = false;
  public today = new Date().getTime();
  public share: any = {};
  public onChangeAccount: EventEmitter<any> = new EventEmitter();
  public formsData: {
    stakeAmount?: string;
    stakeDays?: number;
  } = {};

  public restakeData: {
    opened?: any;
    stake?: Stake;
    lpb?: BigNumber;
    isLate?: boolean;
    topUp?: string;
    shares?: BigNumber;
    stakeDays?: number;
    amount?: BigNumber;
    penalty?: BigNumber;
    totalShares?: BigNumber;
  } = {};

  public stakeTokensProgress: boolean;
  public stakes: {
    active?: Stake[];
    closed?: Stake[];
    matured?: Stake[];
    closedV1?: Stake[];
  } = {
    active: [],
    closed: [],
    matured: [],
    closedV1: [],
  };

  public activeStakeTotals: any;

  @ViewChild("stakeForm", { static: false }) stakeForm;

  @ViewChild("warningModal", {
    static: true,
  })
  warningModal: TemplateRef<any>;

  @ViewChild("actionsModal", {
    static: true,
  })
  actionsModal: TemplateRef<any>;

  @ViewChild("extendStakeModal", {
    static: true,
  })
  extendStakeModal: TemplateRef<any>;
  public extensionInfo: {
    ref?: any,
    stake?: Stake,
    progress?: boolean,
    newStake?: {
      endDate: Number,
      amount: BigNumber,
      lpbShares: BigNumber,
      baseShares: BigNumber,
      totalShares: BigNumber,
    }
  } = { };

  public stakingContractInfo: StakingInfoInterface = {
    ShareRate: 0,
    StepsFromStart: 0,
    closestYearShares: "0",
    closestPoolAmount: "0",
  };

  public stakingInfoChecker = false;
  private bpdInfoChecker = false;

  public currentSort: {
    active: any;
    closed: any;
    closedV1: any;
    matured: any;
  } = {
    active: {},
    closed: {},
    closedV1: {},
    matured: {},
  };

  public bpd: any = [];
  public vcaDivs: VentureAuctionDivs[];

  private settingsData: any;
  private dayEndSubscriber;

  private usdcPerAxnPrice;
  public vcaRegisterLoading = false;
  public maxShareMaxDays;
  public checkingVCARegistration = true;
  public confirmWithdrawData;

  constructor(
    private contractService: ContractService,
    private ngZone: NgZone,
    private config: AppConfig,
    private dialog: MatDialog
  ) {
    this.accountSubscribe = this.contractService
      .accountSubscribe()
      .subscribe((account: any) => {
        if (!account || account.balances) {
          this.ngZone.run(async () => {
            this.account = account;
            window.dispatchEvent(new Event("resize"));
            if (account) {
              this.onChangeAccount.emit();
              this.stakeList();
              this.contractService
                .getStakingContractInfo()
                .then((data: StakingInfoInterface) => {
                  this.stakingContractInfo = data;
                  window.dispatchEvent(new Event("resize"));
                });

              this.contractService.geBPDInfo().then((result) => {
                this.bpd = result;
                // console.log("BPD data", this.bpd);
                this.tableInfo = result[4].show;
                this.getBPDInfo();
                this.bpdInfoChecker = true;
              });

              await this.updateUserVCADivs();
              this.maxShareMaxDays = await this.contractService.getMaxDaysMaxShares();
              this.maxSharesActive = await this.contractService.checkMaxSharesActive();
              this.usdcPerAxnPrice = await this.contractService.getUsdcPerAxnPrice();
            }
          });
        }
      });

    this.tokensDecimals = this.contractService.getCoinsDecimals();
    this.settingsData = this.config.getConfig();
    this.dayEndSubscriber = this.contractService.onDayEnd().subscribe(() => {
      this.stakeList();
    });
  }

  public openDialog(dialog) {
    return this.ngZone.run(() => this.dialog.open(dialog, {}))
  }

  public openSuccessDialog(txID) {
    this.ngZone.run(() => {
      this.dialog.open(TransactionSuccessModalComponent, {
        width: "400px",
        data: txID,
      })
    })
  }

  public openErrorDialog(msg) {
    this.ngZone.run(() => {
      this.dialog.open(MetamaskErrorComponent, {
        width: "400px",
        data: { msg },
      })
    })
  }

  public async updateUserVCADivs() {
    this.vcaDivs = await this.contractService.getVentureAuctionDivs();

    // Sometimes on load, the loading indicator would appear forever after getting vcaDivs.
    // but stops when the user scrolls. This line should fix that in most cases.
    window.dispatchEvent(new Event("scroll"));
  }

  public getStakingInfo() {
    setTimeout(() => {
      this.contractService
        .getStakingContractInfo()
        .then((data: StakingInfoInterface) => {
          this.stakingContractInfo = data;
          if (this.stakingInfoChecker && this.account) {
            this.getStakingInfo();
          }
        });
    }, this.settingsData.settings.checkerStakingInfo);
  }

  public getBPDInfo() {
    setTimeout(() => {
      this.contractService.geBPDInfo().then((result) => {
        this.bpd = result;
        this.tableInfo = result[4].show;
        if (this.bpdInfoChecker && this.account) {
          this.getBPDInfo();
        }
      });
    }, this.settingsData.settings.checkerBPD);
  }

  public shouldCheckBoxForBPD(index) {
    return (
      this.formsData.stakeDays > 349 &&
      this.stakeEndDate > this.bpd[index].dateEnd
    );
  }

  public stakeList() {
    this.contractService
      .getWalletStakesAsync()
      .then(
        async (res: {
          closed: Stake[];
          active: Stake[];
          matured: Stake[];
          closedV1: Stake[];
        }) => {
          this.stakes = res;

          let activeStakes: Stake[] = res.active.concat(res.matured);

          
          if (activeStakes.length) {
            this.activeStakeTotals = {
              principal: activeStakes
                .map((x) => x.principal)
                .reduce((total, x) => total.plus(x)),
              interest: activeStakes
                .map((x) => x.interest)
                .reduce((total, x) => total.plus(x)),
              shares: activeStakes
                .map((x) => x.shares)
                .reduce((total, x) => total.plus(x)),
              bigPayDay: activeStakes
                .map((x) => x.bigPayDay)
                .reduce((total, x) => total.plus(x)),
            };

            this.activeStakeTotals.total = this.activeStakeTotals.principal
              .plus(this.activeStakeTotals.interest)
              .plus(this.activeStakeTotals.bigPayDay);
          }

          this.applySort("active");
          this.applySort("closed");
          this.applySort("matured");
          this.applySort("closedV1");
          window.dispatchEvent(new Event("resize"));
          this.getStakingInfo();
          this.stakingInfoChecker = true;
        }
      )
      .catch(console.log);
  }

  public getDollarValue(amount: BigNumber) {
    return amount.times(this.usdcPerAxnPrice);
  }

  public openStake() {
    this.stakeTokensProgress = true;
    this.contractService
      .depositAXN(this.formsData.stakeAmount, this.formsData.stakeDays)
      .then((r) => {
        this.contractService.checkVCARegistration();
        this.contractService.updateAXNBalance(true).then(() => {
          this.stakeTokensProgress = false;
          this.shareRate = 0;
        });
        this.formsData = {};
      })
      .catch(() => {
        this.stakeTokensProgress = false;
      });
  }

  private _1e18 = new BigNumber(10).pow(18)
  private getLPBShares(amount, days) {
    const stakeDays = days || 1
    const principal = new BigNumber(amount || 0);
    const bonusMultiplier = new BigNumber(stakeDays - 1).div(1820);
    const fixedShareRate = new BigNumber(this.stakingContractInfo.ShareRate).div(this._1e18)
    return principal.times(bonusMultiplier).div(fixedShareRate)
  }

  get bonusLongerPays() {
    return this.getLPBShares(this.formsData.stakeAmount, this.formsData.stakeDays)
  }

  get bonusLongerPaysBetterRestake() {
    const topUp = new BigNumber(this.restakeData.topUp || 0)
    return this.getLPBShares(this.restakeData.amount.plus(topUp), this.restakeData.stakeDays)
  }

  get userShares() {
    const divDecimals = Math.pow(10, this.tokensDecimals.AXN);
    return new BigNumber(this.formsData.stakeAmount || 0)
      .div(divDecimals)
      .times(this.bonusLongerPays.div(divDecimals).plus(1))
      .div(this.stakingContractInfo.ShareRate || 1)
      .times(divDecimals);
  }

  get userSharesRestake() {
    const divDecimals = Math.pow(10, this.tokensDecimals.AXN);
    const topUp = new BigNumber(this.restakeData.topUp || 0);
    const shareRate = new BigNumber(this.stakingContractInfo.ShareRate || 0).div(divDecimals);
    const amount = new BigNumber(this.restakeData.amount || 0).plus(topUp).div(divDecimals);
    return amount.div(shareRate).times(divDecimals);
  }

  get stakeDaysInvalid() {
    return (this.formsData.stakeDays || 0) > this.stakeMaxDays;
  }

  public onRestakeChanged() {
    const shares = this.userSharesRestake;
    this.restakeData.shares = shares;

    const LPB = this.bonusLongerPaysBetterRestake;
    this.restakeData.lpb = LPB;

    this.restakeData.totalShares = shares.plus(LPB)
  }

  public onChangeAmount() {
    const divDecimals = Math.pow(10, this.tokensDecimals.AXN);

    const stareRate = new BigNumber(this.stakingContractInfo.ShareRate || 0)
      .div(divDecimals)
      .toString();

    const amount = new BigNumber(this.formsData.stakeAmount || 0)
      .div(divDecimals)
      .toString();

    const rate =
      (Number(amount) * (1 + (this.formsData.stakeDays - 1) / stakingMaxDays)) /
      Number(stareRate);

    const shareRate = new BigNumber(rate);

    if (this.formsData.stakeDays) {
      this.shareRate = isNaN(shareRate.toNumber())
        ? (new BigNumber(0) as any)
        : (new BigNumber(rate) as any);
    }

    this.stakeEndDate =
      Date.now() +
      this.formsData.stakeDays * this.settingsData.settings.time.seconds * 1000;

    const sharefull = new BigNumber(amount).div(
      new BigNumber(this.stakingContractInfo.ShareRate).div(
        Math.pow(10, this.tokensDecimals.AXN)
      )
    );

    this.share.short = parseFloat(sharefull.toFixed(4).toString());

    this.share.full = !isNaN(sharefull.toNumber()) ? sharefull : 0;
  }

  public getProgress(stake) {
    if (stake.oldUpdate && new Date().getTime() - stake.oldUpdate < 5000) {
      return stake.progress;
    }
    stake.oldUpdate = new Date().getTime();
    const fullAge = stake.end.getTime() - stake.start.getTime();
    const backAge = new Date().getTime() - stake.start.getTime();
    stake.progress = Math.min(Math.floor(backAge / (fullAge / 100)), 100);
    return stake.progress;
  }

  private applySort(table) {
    const currentTableState = this.currentSort[table];
    if (currentTableState.field) {
      this.stakes[table].sort((a, b) => {
        let aValue = a[currentTableState.field];
        let bValue = b[currentTableState.field];

        switch (currentTableState.field) {
          case "start":
          case "end":
            aValue = aValue.getTime();
            bValue = bValue.getTime();
            break;
          case "amount":
          case "shares":
            aValue = aValue.toNumber();
            bValue = bValue.toNumber();
            break;
        }

        return aValue > bValue
          ? currentTableState.ask
            ? 1
            : -1
          : aValue < bValue
          ? currentTableState.ask
            ? -1
            : 1
          : 1;
      });
    } else {
      this.stakes[table].sort((a, b) => {
        return Number(a.sessionId) < Number(b.sessionId) ? 1 : -1;
      });
    }
  }

  public async openStakeActions(stake: Stake) {
    // Check if this is a late unstake
    const endMS = +stake.endSeconds * 1000;
    const penaltyWindow = endMS + (AVAILABLE_DAYS_AFTER_END * this.contractService.getMSecondsInDay())
    const isLate = Date.now() > penaltyWindow

    if (isLate) {
      const result = await this.contractService.getStakePayoutAndPenalty(stake, stake.interest);
      const payout = new BigNumber(result[0]);
      const penalty = new BigNumber(result[1]);

      this.restakeData = {
        stake,
        isLate,
        penalty,
        topUp: "",
        stakeDays: 0,
        amount: payout,
        opened: this.openDialog(this.actionsModal)
      }
    } else {
      this.restakeData = {
        stake,
        isLate,
        topUp: "",
        stakeDays: 0,
        amount: stake.principal.plus(stake.interest),
        opened: this.openDialog(this.actionsModal)
      }
    }
  }

  public successWithPenaltyActions(stake: Stake) {
    this.restakeData.opened.close();

    // Skip late penalty dialog if not past 14 days
    const endMS = +stake.endSeconds * 1000;
    const penaltyWindow = endMS + (14 * 86400 * 1000)
    this.stakeWithdraw(stake, Date.now() < penaltyWindow);
  }

  public restake(stake: Stake) {    
    stake.withdrawProgress = true;
    this.contractService.restake(stake, this.restakeData.stakeDays, this.restakeData.topUp).then(() => {
      this.stakeList();
      this.contractService.updateAXNBalance(true);
      this.restakeData.opened.close();
      this.contractService.checkVCARegistration();
    })
    .finally(() => {
      stake.withdrawProgress = false;
    })
  }

  public successWithPenalty() {
    this.confirmWithdrawData.openedWarning.close();
    this.stakeWithdraw(this.confirmWithdrawData.stake, true);
  }

  public async stakeWithdraw(stake: Stake, withoutConfirm?) {
    if (!withoutConfirm) {
      const result = await this.contractService.getStakePayoutAndPenalty(stake, stake.interest);
      const payout = new BigNumber(result[0]);
      const penalty = new BigNumber(result[1]);

      if (!penalty.isZero()) {
        const openedWarning = this.openDialog(this.warningModal);
        const oneDayInSeconds = this.contractService.getMSecondsInDay();
        const nowTS = Date.now();
        const endTS = stake.end.getTime();
        const endTwoWeeks = endTS + oneDayInSeconds * AVAILABLE_DAYS_AFTER_END;
        const late =
          nowTS < endTS ? "Early" : nowTS > endTwoWeeks ? "Late" : "Normal";
          
        this.confirmWithdrawData = {
          stake,
          openedWarning,
          penalty,
          late,
          payout,
        };
        return;
      }
    }

    stake.withdrawProgress = true;

    if (!stake.isV1) {
      this.contractService
        .unstake(stake.sessionId)
        .then(() => {
          this.stakeList();
          this.contractService.updateAXNBalance(true);
          stake.withdrawProgress = false;
          this.contractService.checkVCARegistration();
        })
        .catch(() => {
          stake.withdrawProgress = false;
        });
    } else {
      this.contractService
        .unstakeV1(stake.sessionId)
        .then(() => {
          this.stakeList();
          this.contractService.updateAXNBalance(true);
          stake.withdrawProgress = false;
          this.contractService.checkVCARegistration();
        })
        .catch(() => {
          stake.withdrawProgress = false;
        });
    }
  }

  public bpdWithdraw(stake) {
    stake.withdrawProgress = true;

    this.contractService
      .bpdWithdraw(stake.sessionId)
      .then(() => {
        this.stakeList();
        this.contractService.updateAXNBalance(true);
        stake.withdrawProgress = false;
      })
      .catch(() => {
        stake.withdrawProgress = false;
      });
  }

  public extendStake(stake: Stake) {
    const shareRate = new BigNumber(this.stakingContractInfo.ShareRate).div(this._1e18);
    const amount = new BigNumber(stake.principal.plus(stake.interest));

    this.extensionInfo.stake = stake;
    this.extensionInfo.ref = this.openDialog(this.extendStakeModal);
    this.extensionInfo.newStake = {
      amount, 
      lpbShares: this.getLPBShares(amount, 5555),
      totalShares: amount.times((5554 / 1820) + 1).div(shareRate),
      baseShares: amount.div(this._1e18).div(shareRate).times(this._1e18),
      endDate: Date.now() + (5555 * this.settingsData.settings.time.seconds * 1000),
    }
  }

  public async confirmExtension() {
    this.extensionInfo.progress = true;

    try {
      const transaction = await this.contractService.extendStake(this.extensionInfo.stake);
      this.extensionInfo.ref.close();
      this.stakeList();
      this.openSuccessDialog(transaction.transactionHash);
      this.contractService.checkVCARegistration();
    } catch (err) {
      if (err.message) {
        this.openErrorDialog(err.message);
      }
    } finally { this.extensionInfo.progress = false }
  }

  public sortStakes(ev, type) {
    if (ev.direction === "asc")
      this.stakes[type].sort((a: Stake, b: Stake) => a[ev.active] - b[ev.active])
    else if (ev.direction === "desc")
      this.stakes[type].sort((a: Stake, b: Stake) => b[ev.active] - a[ev.active])
  }

  public async withdrawVCA(vca: VentureAuctionDivs) {
    vca["loading"] = true;

    try {
      const tx = await this.contractService.withdrawVCADivs(vca.tokenAddress);
      this.updateUserVCADivs();
      this.openSuccessDialog(tx.transactionHash);
    }
    catch (err) {
      if (err.message) {
        this.openErrorDialog(err.message)
      }
    }
    finally {
      vca["loading"] = false;
    }
  }

  public async registerVCA() {
    this.vcaRegisterLoading = true;

    try {
      const tx = await this.contractService.registerForVCA();
      this.openSuccessDialog(tx.transactionHash);
      this.contractService.checkVCARegistration();
    }
    catch (err) {
      if (err.message) {
        this.openErrorDialog(err.message)
      }
    }
    finally {
      this.vcaRegisterLoading = false;
    }
  }

  ngOnDestroy() {
    this.stakingInfoChecker = false;
    this.bpdInfoChecker = false;
    this.accountSubscribe.unsubscribe();
    this.dayEndSubscriber.unsubscribe();
  }
}
