import {
  Component,
  EventEmitter,
  NgZone,
  OnDestroy,
  ViewChild,
  TemplateRef,
} from "@angular/core";
import BigNumber from "bignumber.js";
import { AppComponent } from "../../app.component";
import { MatDialog } from "@angular/material/dialog";
import { MiningContractService } from "../../services/mining-contract";
import { MetamaskErrorComponent } from "../../components/metamaskError/metamask-error.component";
import { ActivatedRoute } from "@angular/router";
import { TransactionSuccessModalComponent } from "../../components/transactionSuccessModal/transaction-success-modal.component";
import { Mine as BasicMine } from '../../services/mining-contract';

interface Mine extends BasicMine {
  depositLPLoading?: boolean,
  withdrawLPLoading?: boolean,
  withdrawAllLoading?: boolean,
  withdrawRewardsLoading?: boolean,
}

@Component({
  selector: "app-mining-page",
  templateUrl: "./mining-page.component.html",
  styleUrls: ["./mining-page.component.scss"],
})
export class MiningPageComponent implements OnDestroy {
  @ViewChild("createMineModal", {
    static: true,
  })
  createMineModal: TemplateRef<any>;

  @ViewChild("withdrawLPModal", {
    static: true,
  })
  withdrawLPModal: TemplateRef<any>;

  private accountSubscribe;
  private mineNotFoundModal;
  public tokensDecimals = 18;  // Always 18 UNI-V2 pairs

  public account;
  public switchingLoading;
  public mines: Mine[];
  public selectedMine: Mine;

  public onChangeAccount: EventEmitter<any> = new EventEmitter();

  public createMineData = {
    base: "",
    market: "",
    endBlock: null,
    startBlock: null,
    tokenAddress: "",
    rewardAmount: "",
    progressIndicator: false,
    blockReward: new BigNumber(0),
    ref: null,
  }

  public formData = {
    depositLPAmount: "",
    withdrawLPAmount: "",
    ref: null
  }

  public minerBalance = {
    lpDeposit: new BigNumber(0),
    pendingReward: new BigNumber(0),
    rewardPerBlock: new BigNumber(0),
    lpAvailable: {
      wei: "0",
      bn: new BigNumber(0)
    },
    nft: {
      og25NFT: 0,
      og100NFT: 0,
      liqNFT: 0,
      multiplier: 0,
      bonusApy: 0
    }
  };

  private usdcPerAxnPrice: BigNumber;
  public currentBlock: number;

  constructor(
    private contractService: MiningContractService,
    private ngZone: NgZone,
    private appComponent: AppComponent,
    private dialog: MatDialog,
    private activatedRoute: ActivatedRoute
  ) {
    this.accountSubscribe = this.contractService.accountSubscribe().subscribe((account: any) => {
      if (!account || account.balances) {
        this.ngZone.run(async () => {
          this.account = account;
          window.dispatchEvent(new Event("resize"));

          if (account) {
            this.onChangeAccount.emit();
            this.currentBlock = await this.contractService.getCurrentBlock();

            this.updateMines().then(() => {
              // Determine which pool to load
              this.activatedRoute.params.subscribe(params => {
                if (params['mine']) {
                  this.processParams(params['mine']);
                } else if (this.mines.length == 1) {
                  this.selectMine(this.mines[0])
                }
              });
            });

            this.usdcPerAxnPrice = await this.contractService.getUsdcPerAxnPrice();
          }
        });
      }
    });
  }

  ngOnDestroy() {
    this.accountSubscribe.unsubscribe();
  }

  /** Cosmetic: Used when mine doesn't exist. Takes mine param out of the url.
      Doing it this way does not refresh the current page.*/
  private fixURL() {
    window.history.replaceState({}, document.title, "/mining");
  }

  public async updateMines() {
    this.mines = await this.contractService.getMines();
  }

  private async updateSelectedMine() {
    this.selectedMine = await this.contractService.getMine(this.selectedMine.mineAddress);
    await this.updateMinerBalance();
  }

  public getDollarValue(amount: BigNumber) {
    return amount.times(this.usdcPerAxnPrice);
  }

  public getLpTokenDollarValue(amount: BigNumber) {
    return amount.times(this.selectedMine.lpTokenUsdcPrice);
  }

  public openSuccessModal(txID: string) {
    this.ngZone.run(() => {
      this.dialog.open(TransactionSuccessModalComponent, {
        width: "400px",
        data: txID,
      })
    })
  }

  public openErrorModal(message: string) {
    return this.ngZone.run(() => {
      return this.dialog.open(MetamaskErrorComponent, {
        width: "400px",
        data: { msg: message },
      });
    })
  }

  public openWithdrawLPModal() {
    this.formData.ref = this.ngZone.run(() => this.dialog.open(this.withdrawLPModal, {}));
  }

  public subscribeAccount() {
    this.appComponent.subscribeAccount();
  }

  public openUniswapPoolInfo(addr = this.selectedMine.lpToken) {
    window.open(`https://info.uniswap.org/pair/${addr}`, "_blank")
  }

  public async openCreateMineModal() {
    this.createMineData.rewardAmount = "";
    this.createMineData.blockReward = new BigNumber(0);
    this.createMineData.ref = this.dialog.open(this.createMineModal, {});
    try {
      const startBlock = await this.contractService.getCurrentBlock();
      this.createMineData.startBlock = startBlock + 25;
      this.createMineData.endBlock = startBlock + 1223333;
    } catch (err) { console.log(err) }
  }

  public async updateMinerBalance() {
    const result = await Promise.all([
      this.contractService.getMinerLpDeposit(this.selectedMine.mineAddress),
      this.contractService.getMinerPendingReward(this.selectedMine.mineAddress),
      this.contractService.getMinerLpTokenBalance(this.selectedMine.lpToken),
      this.contractService.getMinerNftBalances()
    ]);

    this.contractService.adjustApy(this.selectedMine, result[3]);

    this.minerBalance.lpDeposit = result[0];
    this.minerBalance.pendingReward = result[1];
    this.minerBalance.lpAvailable = result[2];
    this.minerBalance.nft = result[3];
    this.minerBalance.rewardPerBlock = this.getMinerRewardPerBlock(result[0], result[3].multiplier);

    if (!this.minerBalance.lpDeposit.isZero())
      this.contractService.updatePendingRewardOnNewBlock(this.selectedMine.mineAddress, this.minerBalance);
  }

  private getMinerRewardPerBlock(lpDeposit: BigNumber, nftMultiplier: number) {
    return lpDeposit
      .times(this.selectedMine.blockReward)
      .times(0.7 + nftMultiplier / 10)
      .div(this.contractService._1e18)
      .div(this.selectedMine.lpTokenBalance.isZero() ? 1 : this.selectedMine.lpTokenBalance);
  }

  public async onCreateMineAddressChanged() {
    const address = this.createMineData.tokenAddress;

    if (address) {
      try {
        const symbols = await this.contractService.getPoolTokens(address.trim())
        if (symbols) {
          this.createMineData.base = symbols.base;
          this.createMineData.market = symbols.market;
        }
      } catch (err) {
        if (err.message)
          this.openErrorModal(err.message)
      }
    }
  }

  public onRewardAmountChanged() {
    if (this.createMineData.rewardAmount && this.createMineData.startBlock && this.createMineData.endBlock) {
      this.createMineData.blockReward = this.contractService.calculateBlockReward(
        this.createMineData.rewardAmount,
        this.createMineData.startBlock,
        this.createMineData.endBlock,
      )
    }
  }

  public async selectMine(mine: Mine) {
    this.switchingLoading = mine.mineAddress;

    try {
      this.selectedMine = mine;
      await this.updateMinerBalance();
    }
    catch (err) { console.log(err) }
    finally { this.switchingLoading = "" }
  }

  // Process mine pair address found in URL parameter
  public processParams(mineAddress: string) {
    if (this.mines.length > 0) {
      const mineFound = this.mines.find(p => p.mineAddress === mineAddress)

      if (mineFound) {
        this.selectMine(mineFound)
      }
      else {
        const fallbackPool = this.mines[0]
        this.fixURL();
        this.selectMine(fallbackPool)
        if (!this.mineNotFoundModal) {
          this.mineNotFoundModal = this.openErrorModal(`Mine not found. Falling back to ${fallbackPool.base}-${fallbackPool.market}.`)
        }
      }
    } else {
      this.fixURL();
      this.openErrorModal(`There are currently no active mines. Please check back later!`)
    }
  }

  public async deposit() {
    if (+this.formData.depositLPAmount > 0) {
      try {
        this.selectedMine.depositLPLoading = true;
        const tx = await this.contractService.depositLPTokens(this.selectedMine.mineAddress, this.selectedMine.lpToken, new BigNumber(this.formData.depositLPAmount));
        await this.updateSelectedMine();
        this.formData.depositLPAmount = "0";
        this.openSuccessModal(tx.transactionHash);
      }
      catch (err) {
        if (err.message)
          this.openErrorModal(err.message)
      }
      finally {
        this.selectedMine.depositLPLoading = false;
      }
    }
  }

  public async withdrawRewards() {
    if (!this.minerBalance.pendingReward.isZero()) {
      this.selectedMine.withdrawRewardsLoading = true;

      try {
        const tx = await this.contractService.withdrawReward(this.selectedMine.mineAddress);
        await this.updateSelectedMine();
        this.openSuccessModal(tx.transactionHash);
      }
      catch (err) {
        if (err.message)
          this.openErrorModal(err.message)
      }
      finally {
        this.selectedMine.withdrawRewardsLoading = false
      }
    }
  }

  public async withdrawAll() {
    if (!this.minerBalance.pendingReward.isZero() && !this.minerBalance.lpDeposit.isZero()) {
      this.selectedMine.withdrawAllLoading = true;

      try {
        const tx = await this.contractService.withdrawAll(this.selectedMine.mineAddress);
        await this.updateSelectedMine();
        this.openSuccessModal(tx.transactionHash);
      }
      catch (err) {
        if (err.message)
          this.openErrorModal(err.message)
      }
      finally {
        this.selectedMine.withdrawAllLoading = false
      }
    }
  }

  public async withdrawLPTokens() {
    if (!this.minerBalance.lpDeposit.isZero()) {
      this.selectedMine.withdrawLPLoading = true;

      try {
        const tx = await this.contractService.withdrawLPTokens(this.selectedMine.mineAddress, this.formData.withdrawLPAmount);
        await this.updateSelectedMine();
        this.formData.ref.close();
        this.formData.withdrawLPAmount = "0";
        this.openSuccessModal(tx.transactionHash);
      }
      catch (err) {
        if (err.message)
          this.openErrorModal(err.message)
      }
      finally {
        this.selectedMine.withdrawLPLoading = false
      }
    }
  }

  // ONLY MANAGERS
  public async createMine() {
    if (!this.createMineData.rewardAmount || !this.createMineData.tokenAddress || !this.createMineData.startBlock || !this.createMineData.endBlock) {
      this.openErrorModal("Missing information. All fields must be filled.")
      return;
    }

    this.createMineData.progressIndicator = true;

    const rewards = this.createMineData.rewardAmount;
    const startBlock = this.createMineData.startBlock;
    const blockReward = this.contractService.calculateBlockReward(rewards, startBlock, this.createMineData.endBlock);

    try {
      const tx = await this.contractService.createMine(
        this.createMineData.tokenAddress,
        new BigNumber(rewards),
        blockReward,
        startBlock
      )
      this.createMineData.ref.close();
      await this.updateMines();
      this.openSuccessModal(tx.transactionHash);
      this.createMineData = {
        base: "",
        market: "",
        endBlock: null,
        startBlock: null,
        tokenAddress: "",
        rewardAmount: "",
        progressIndicator: false,
        blockReward: new BigNumber(0),
        ref: null,
      };
    }
    catch (err) {
      if (err.message)
        this.openErrorModal(err.message)
    }
    finally {
      this.createMineData.progressIndicator = false;
    }
  }
}
