import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import BigNumber from "bignumber.js";
import * as moment from "moment";
import { Observable, Subscriber } from "rxjs";
import { Contract } from "web3-eth-contract";
import { environment } from "../../../environments/environment";
import { AppConfig } from "../../appconfig";
import { MetamaskService } from "../web3";
import { MaxUint256 } from '@ethersproject/constants';

// export const stakingMaxDays = 5555;
export const stakingMaxDays = 1820;

export interface Stake {
  start: Date;
  startSeconds: string;
  end: Date;
  endSeconds: string;
  targetEnd: Date;
  shares: BigNumber;
  principal: BigNumber;
  sessionId: string;
  bigPayDay: BigNumber;
  interest: BigNumber;
  payout: BigNumber;
  withdrawProgress?: boolean;
  firstPayout: string;
  lastPayout: number;
  isBpdWithdraw: boolean;
  isBpdWithdrawn: boolean;
  isMatured: boolean;
  isWithdrawn: boolean;
  isV1: boolean;
  apy: number;
}

export interface Auction {
  eth: BigNumber;
  axn: BigNumber;
  uniAxnPerEth: BigNumber;
  axnPerEth: BigNumber;
  isOverBid: boolean;
}

export interface AuctionBid {
  auctionId: string;
  startDate: Date;
  axnInPool: BigNumber;
  ethInPool: BigNumber;
  ethBid: BigNumber;
  winnings: BigNumber;
  hasWinnings: boolean;
  status: string;
  axnPerEth: BigNumber;
  isV1: boolean;
}

@Injectable({
  providedIn: "root",
})
export class ContractService {
  private web3Service;

  private H2TContract: Contract;
  public AXNContract: Contract;
  private HEXContract: Contract;
  private NativeSwapContract: Contract;

  private StakingContract: Contract;
  private StakingV1Contract: Contract;
  private UniswapV2Router02: Contract;
  private AuctionContract: Contract;
  private AuctionV1Contract: Contract;

  private ForeignSwapContract: Contract;
  private BPDContract: Contract;
  private SubBalanceContract: Contract;
  private SubBalanceV1Contract: Contract;

  private isActive: boolean;

  private tokensDecimals: any = {
    ETH: 18,
  };

  public readonly _1e18: string = Math.pow(10, 18).toString();

  public account;
  private allAccountSubscribers = [];
  private allTransactionSubscribers = [];
  public settingsApp = {
    settings: {
      checkerDays: 5000,
      checkerAuctionPool: 5000,
      checkerStakingInfo: 3600000,
      checkerBPD: 3600000,
      freeclaimEndTime: 1611859352000, // Jan-28-2021 06:42:32 PM UTC

      production: false,
      network: "ropsten",
      chainsForButtonAddToMetamask: [1, 3, 4],
      net: 3,

      time: {
        seconds: 86400,
        display: "days",
      },
    },
    minutes: {
      name: "Minutes",
      shortName: "Min",
      lowerName: "minutes",
    },
    days: {
      name: "Days",
      shortName: "Days",
      lowerName: "days",
    },
  };

  private secondsInDay: any;
  private startDate: any;
  private leftDays: any;

  public CONTRACTS_PARAMS: any;

  public AxnTokenAddress = "none";

  private dayEndSubscribers: Subscriber<any>[] = [];

  public autoStakeDays: number;
  private discountPercent: number;
  private premiumPercent: number;

  constructor(private httpService: HttpClient, private config: AppConfig) {
    setInterval(() => {
      if (!(this.secondsInDay && this.startDate)) {
        return;
      }
      const oldLeftDays = this.leftDays;

      const finishDate = this.settingsApp.settings.freeclaimEndTime;
      this.leftDays = Math.floor(
        (finishDate - new Date().getTime()) / (this.secondsInDay * 1000)
      );

      if (oldLeftDays) {
        if (oldLeftDays !== this.leftDays) {
          this.dayEndSubscribers.forEach((obs) => {
            obs.next();
          });
        }
      }
    }, 60000);
  }

  public getMSecondsInDay() {
    return this.secondsInDay * 1000;
  }

  public onDayEnd() {
    return new Observable((observer) => {
      this.dayEndSubscribers.push(observer);
      return {
        unsubscribe: () => {
          this.dayEndSubscribers = this.dayEndSubscribers.filter((obs) => {
            return obs !== observer;
          });
        },
      };
    });
  }

  private initAll() {
    const promises = [
      this.httpService
        .get(`${environment.configDomain}/settings.json`)
        .toPromise()
        .then((config) => {
          if (config) {
            this.settingsApp = config as any;
            this.config.setConfig(config);
          } else {
            this.config.setConfig(this.settingsApp);
          }
        })
        .catch((err) => {
          console.log("err settings", err);
          this.config.setConfig(this.settingsApp);
        }),
      this.httpService
        .get(`${environment.configDomain}/constants.json`)
        .toPromise()
        .then((result) => {
          return result;
        })
        .catch((err) => {
          console.log("err constants", err);
        }),
    ];

    return Promise.all(promises).then((result) => {
      const IS_PRODUCTION = environment.production;
      this.CONTRACTS_PARAMS =
        result[1][
        IS_PRODUCTION ? "mainnet" : this.settingsApp.settings.network
        ];
      this.isActive = true;
      if (this.account) {
        this.callAllAccountsSubscribers();
      }
    });
  }

  public addToken() {
    this.web3Service.addToken({
      address: this.CONTRACTS_PARAMS.AXN.ADDRESS,
      decimals: this.tokensDecimals.AXN,
      image:
        "https://stake.axion.network/assets/images/icons/axion-icon.png",
      symbol: "AXN",
    });
  }

  private getTokensInfo(noEnable?) {
    if (!noEnable) {
      this.initializeContracts();
    }
    const promises = [
      this.H2TContract.methods
        .decimals()
        .call()
        .then((decimals) => {
          this.tokensDecimals.H2T = decimals;
        }),
      this.AXNContract.methods
        .decimals()
        .call()
        .then((decimals) => {
          this.tokensDecimals.AXN = decimals;
        }),
      this.HEXContract.methods
        .decimals()
        .call()
        .then((decimals) => {
          this.tokensDecimals.HEX = decimals;
        }),
    ];
    return Promise.all(promises);
  }

  public getStaticInfo() {
    return this.initAll().then(() => {
      this.web3Service = new MetamaskService(this.config);
      this.web3Service.getAccounts().subscribe(async (account: any) => {
        if (account) {
          this.initializeContracts();
          const options = await this.AuctionContract.methods.options().call();

          this.autoStakeDays = +options.autoStakeDays;
          this.discountPercent = +options.discountPercent;
          this.premiumPercent = +options.premiumPercent;

          const promises = [this.getTokensInfo(false)];
          return Promise.all(promises);
        }
      });
    });
  }

  private callAllAccountsSubscribers() {
    if (this.isActive) {
      this.allAccountSubscribers.forEach((observer) => {
        observer.next(this.account);
      });
    }
  }
  private callAllTransactionsSubscribers(transaction) {
    this.allTransactionSubscribers.forEach((observer) => {
      observer.next(transaction);
    });
  }

  public accountSubscribe() {
    const newObserver = new Observable((observer) => {
      observer.next(this.account);
      this.allAccountSubscribers.push(observer);
      return {
        unsubscribe: () => {
          this.allAccountSubscribers = this.allAccountSubscribers.filter(
            (a) => a !== newObserver
          );
        },
      };
    });
    return newObserver;
  }

  public updateClaimableInformation(callEmitter?) {
    return this.ForeignSwapContract.methods
      .getUserClaimableAmountFor(this.account.snapshot.hex_amount)
      .call()
      .then((result) => {
        this.account.claimableInfo = {
          claim: new BigNumber(result[0]),
          penalty: new BigNumber(result[1]),
        };
        if (callEmitter) {
          this.callAllAccountsSubscribers();
        }
      });
  }

  public updateClaimableInformationHex(callEmitter?) {
    return this.ForeignSwapContract.methods
      .claimedBalanceOf(this.account.snapshot.user_address)
      .call()
      .then((result) => {
        this.account.completeClaim = {
          hasClaimed: new BigNumber(result).toNumber() > 0,
          value: new BigNumber(result).div(10000000000).toNumber(),
          valueFull: new BigNumber(result),
        };
        if (callEmitter) {
          this.callAllAccountsSubscribers();
        }
      });
  }

  public transactionsSubscribe() {
    const newObserver = new Observable((observer) => {
      this.allTransactionSubscribers.push(observer);
    });
    return newObserver;
  }

  public getAccount(noEnable?) {
    const finishIniAccount = () => {
      if (this.account) {
        this.initializeContracts();
        this.getAccountSnapshot().then(() => {
          this.updateClaimableInformation(true);
          this.updateClaimableInformationHex(true);
        });
      } else {
        this.callAllAccountsSubscribers();
      }
    };
    return new Promise((resolve, reject) => {
      this.web3Service.getAccounts(noEnable).subscribe(
        (account) => {
          if (!this.account || account.address !== this.account.address) {
            this.account = account;
            finishIniAccount();
          }
          resolve(this.account);
        },
        (err) => {
          this.account = false;
          finishIniAccount();
          reject(err);
        }
      );
    });
  }

  public getSnapshotInfo() {
    const promises = [
      this.ForeignSwapContract.methods
        .getCurrentClaimedAddresses()
        .call()
        .then((claimedAddresses) => {
          return {
            key: "claimedAddresses",
            value: claimedAddresses,
          };
        }),
      this.ForeignSwapContract.methods
        .getTotalSnapshotAddresses()
        .call()
        .then((totalAddresses) => {
          return {
            key: "totalAddresses",
            value: totalAddresses,
          };
        }),
      this.ForeignSwapContract.methods
        .getCurrentClaimedAmount()
        .call()
        .then((claimedAmount) => {
          return {
            key: "claimedAmount",
            value: new BigNumber(claimedAmount).div(10000000000),
          };
        }),
      this.ForeignSwapContract.methods
        .getTotalSnapshotAmount()
        .call()
        .then((totalAmount) => {
          return {
            key: "totalAmount",
            value: new BigNumber(totalAmount).div(10000000000),
          };
        }),
    ];
    return Promise.all(promises).then((results) => {
      const info = {};
      results.forEach((params) => {
        info[params.key] = params.value;
      });
      return info;
    });
  }

  public updateH2TBalance(callEmitter?) {
    return new Promise((resolve, reject) => {
      if (!(this.account && this.account.address)) {
        return reject();
      }
      return this.H2TContract.methods
        .balanceOf(this.account.address)
        .call()
        .then((balance) => {
          const bigBalance = new BigNumber(balance);
          this.account.balances = this.account.balances || {};
          this.account.balances.H2T = {
            wei: balance,
            weiBigNumber: bigBalance,
            shortBigNumber: bigBalance.div(
              new BigNumber(10).pow(this.tokensDecimals.H2T)
            ),
            display: bigBalance
              .div(new BigNumber(10).pow(this.tokensDecimals.H2T))
              .toFormat(4),
          };
          resolve(null);
          if (callEmitter) {
            this.callAllAccountsSubscribers();
          }
        });
    });
  }

  public updateAXNBalance(callEmitter?) {
    return new Promise((resolve, reject) => {
      if (!(this.account && this.account.address)) {
        return reject();
      }
      return this.AXNContract.methods
        .balanceOf(this.account.address)
        .call()
        .then((balance) => {
          const bigBalance = new BigNumber(balance);
          this.account.balances = this.account.balances || {};
          this.account.balances.AXN = {
            wei: balance,
            weiBigNumber: bigBalance,
            shortBigNumber: bigBalance.div(
              new BigNumber(10).pow(this.tokensDecimals.H2T)
            ),
            display: bigBalance
              .div(new BigNumber(10).pow(this.tokensDecimals.H2T))
              .toFormat(4),
          };
          resolve(null);
          if (callEmitter) {
            this.callAllAccountsSubscribers();
          }
        });
    });
  }

  public updateHEXBalance(callEmitter?) {
    return new Promise((resolve, reject) => {
      if (!(this.account && this.account.address)) {
        return reject();
      }
      return this.HEXContract.methods
        .balanceOf(this.account.address)
        .call()
        .then((balance) => {
          const bigBalance = new BigNumber(balance);
          this.account.balances = this.account.balances || {};
          this.account.balances.HEX = {
            wei: balance,
            weiBigNumber: bigBalance,
            shortBigNumber: bigBalance.div(
              new BigNumber(10).pow(this.tokensDecimals.HEX)
            ),
            display: bigBalance
              .div(new BigNumber(10).pow(this.tokensDecimals.HEX))
              .toFormat(4),
          };
          resolve(null);
          if (callEmitter) {
            this.callAllAccountsSubscribers();
          }
        });
    });
  }

  public updateETHBalance(callEmitter?) {
    return new Promise((resolve, reject) => {
      if (!(this.account && this.account.address)) {
        return reject();
      }
      return this.web3Service
        .getBalance(this.account.address)
        .then((balance) => {
          const bigBalance = new BigNumber(balance);
          this.account.balances = this.account.balances || {};
          this.account.balances.ETH = {
            wei: balance,
            weiBigNumber: bigBalance,
            shortBigNumber: bigBalance.div(new BigNumber(10).pow(18)),
            display: bigBalance.div(new BigNumber(10).pow(18)).toFormat(4),
          };
          resolve(null);
          if (callEmitter) {
            this.callAllAccountsSubscribers();
          }
        });
    });
  }

  public getCoinsDecimals() {
    return this.tokensDecimals;
  }

  public loadAccountInfo() {
    const promises = [
      this.updateH2TBalance(),
      this.updateAXNBalance(),
      this.updateETHBalance(),
      this.updateHEXBalance(),
    ];
    Promise.all(promises).then(() => {
      this.callAllAccountsSubscribers();
    });
  }

  private checkTx(tx, resolve, reject) {
    this.web3Service.Web3.eth
      .getTransaction(tx.transactionHash)
      .then((txInfo) => {
        if (txInfo.blockNumber) {
          this.callAllTransactionsSubscribers(txInfo);
          resolve(tx);
        } else {
          setTimeout(() => {
            this.checkTx(tx, resolve, reject);
          }, 2000);
        }
      }, reject);
  }

  private checkTransaction(tx) {
    return new Promise((resolve, reject) => {
      this.checkTx(tx, resolve, reject);
    });
  }

  private checkH2TApproval(amount, address?): Promise<any> {
    return new Promise((resolve, reject) => {
      this.H2TContract.methods
        .allowance(this.account.address, address)
        .call()
        .then((allowance: string) => {
          const allow = new BigNumber(allowance);
          const allowed = allow.minus(amount);
          allowed.isNegative() ? reject() : resolve(null);
        });
    });
  }

  private checkAXNApproval(amount, address?): Promise<any> {
    return new Promise((resolve, reject) => {
      this.AXNContract.methods
        .allowance(this.account.address, address)
        .call()
        .then((allowance: string) => {
          const allow = new BigNumber(allowance);
          const allowed = allow.minus(amount);
          allowed.isNegative() ? reject() : resolve(null);
        });
    });
  }

  public swapH2T(amount) {
    const fromAccount = this.account.address;

    const exchangeTokens = (resolve, reject) => {
      return this.NativeSwapContract.methods
        .deposit(amount)
        .send({
          from: fromAccount,
        })
        .then((res) => {
          return this.checkTransaction(res);
        })
        .then(resolve, reject);
    };

    return new Promise((resolve, reject) => {
      this.checkH2TApproval(
        amount,
        this.NativeSwapContract.options.address
      ).then(
        () => {
          exchangeTokens(resolve, reject);
        },
        () => {
          this.H2TContract.methods
            .approve(this.NativeSwapContract.options.address, MaxUint256)
            .send({
              from: fromAccount,
            })
            .then(() => {
              exchangeTokens(resolve, reject);
            }, reject);
        }
      );
    });
  }

  public swapTokenBalanceOf(noConverted?) {
    return this.NativeSwapContract.methods
      .swapTokenBalanceOf(this.account.address)
      .call()
      .then((balance) => {
        if (noConverted) {
          return balance;
        }

        return {
          value: new BigNumber(balance).div(
            new BigNumber(10).pow(this.tokensDecimals.H2T)
          ),
          fullValue: new BigNumber(balance),
          fullValueNotBN: balance,
          fullValueNumber: Number(balance),
        };
      });
  }

  public withdrawH2T() {
    return this.swapTokenBalanceOf(true).then((value) => {
      return this.NativeSwapContract.methods
        .withdraw(value)
        .send({
          from: this.account.address,
        })
        .then((res) => {
          return this.checkTransaction(res);
        });
    });
  }

  public swapNativeToken() {
    return this.NativeSwapContract.methods
      .swapNativeToken()
      .send({
        from: this.account.address,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  public getContractsInfo() {
    const promises = [
      this.AuctionContract.methods
        .calculateStepsFromStart()
        .call()
        .then((auctionId) => {
          return this.AuctionContract.methods
            .reservesOf(auctionId)
            .call()
            .then((res) => {
              return {
                key: "Auction",
                value: new BigNumber(res[1])
                  .div(Math.pow(10, this.tokensDecimals.AXN))
                  .toString(),
              };
            });
        }),
      this.AXNContract.methods
        .totalSupply()
        .call()
        .then((res) => {
          return {
            key: "totalSupply",
            value: new BigNumber(res)
              .div(Math.pow(10, this.tokensDecimals.AXN))
              .toString(),
          };
        }),
      this.StakingContract.methods
        .sharesTotalSupply()
        .call()
        .then((res) => {
          return {
            key: "staking",
            value: new BigNumber(res)
              .div(Math.pow(10, this.tokensDecimals.AXN))
              .toString(),
          };
        }),
      this.BPDContract.methods
        .getPoolYearAmounts()
        .call()
        .then((res) => {
          return {
            key: "BPDInfo",
            value: res.map((oneBigPayDay) => {
              return new BigNumber(oneBigPayDay)
                .div(Math.pow(10, this.tokensDecimals.AXN))
                .toString();
            }),
          };
        }),
    ];
    return Promise.all(promises).then((results) => {
      const info = {};
      results.forEach((params) => {
        info[params.key] = params.value;
      });
      return info;
    });
  }

  public async getAuctionPool() {
    const currentAuctionId = await this.AuctionContract.methods
      .calculateStepsFromStart()
      .call();

    const auctionReserves = await this.AuctionContract.methods
      .reservesOf(currentAuctionId)
      .call();

    let uniswapAveragePrice: BigNumber
      = new BigNumber(auctionReserves.uniswapMiddlePrice)
        .div(this._1e18);

    if (uniswapAveragePrice.isZero()) {
      const lastAuctionId = currentAuctionId - 1;

      if (lastAuctionId >= 0) {
        const lastAuctionReserves = await this.AuctionContract.methods
          .reservesOf(lastAuctionId)
          .call();

        uniswapAveragePrice
          = new BigNumber(lastAuctionReserves.uniswapMiddlePrice)
            .div(this._1e18);
      }
    }

    const auction = {} as Auction;

    auction.eth = new BigNumber(auctionReserves.eth);

    auction.axn = new BigNumber(auctionReserves.token);

    let auctionPriceFromPool: BigNumber;

    if (auctionReserves.eth === "0" || auctionReserves.token === "0") {
      auctionPriceFromPool = new BigNumber(0);
    } else {
      auctionPriceFromPool = new BigNumber(auctionReserves.token).div(
        auctionReserves.eth
      );
    }

    const amountsOut = await this.getWethToAxionAmountsOutAsync(this._1e18.toString());

    const uniswapPrice = new BigNumber(amountsOut[1]).div(this._1e18);

    auction.uniAxnPerEth = uniswapPrice;

    auction.axnPerEth = this.getCurrentAuctionAxnPerEth(
      auctionPriceFromPool,
      uniswapAveragePrice
    );

    auction.isOverBid = uniswapAveragePrice.times(0.75).isGreaterThan(auction.axnPerEth);

    return auction;
  }

  private getCurrentAuctionAxnPerEth(
    auctionPriceFromPool: BigNumber,
    uniswapAveragePrice: BigNumber
  ): BigNumber {
    const uniswapAdjustedAveragePrice = this.adjustPrice(uniswapAveragePrice);

    if (auctionPriceFromPool.isZero()) {
      return uniswapAdjustedAveragePrice;
    } else {
      return BigNumber.minimum(
        uniswapAdjustedAveragePrice,
        auctionPriceFromPool
      );
    }
  }

  public getEndDateTimeHex3t() {
    return this.ForeignSwapContract.methods
      .stepTimestamp()
      .call()
      .then((secondsInDay) => {
        return this.ForeignSwapContract.methods
          .stakePeriod()
          .call()
          .then((swapDaysPeriod) => {
            const allDaysSeconds = swapDaysPeriod * secondsInDay * 1000;
            return this.ForeignSwapContract.methods
              .start()
              .call()
              .then((startDate) => {
                const fullStartDate = startDate * 1000;
                const endDateTime = fullStartDate + allDaysSeconds;

                this.secondsInDay = secondsInDay;
                this.startDate = startDate;

                const a = new Date(endDateTime).getTime();
                const b = Date.now();

                const leftDays = Math.floor(
                  (a - b) / (this.secondsInDay * 1000)
                );

                const dateEnd = leftDays;
                const showTime = leftDays;

                return {
                  startDate: fullStartDate,
                  endDate: endDateTime,
                  dateEnd,
                  leftDays,
                  showTime,
                };
              });
          });
      });
  }

  public getEndDateTimeHex() {
    return new Promise((resolve) => {
      this.ForeignSwapContract.methods
        .finalClaimedAmount()
        .call()
        .then((amount) => {
          const axnLeftToClaim = Math.round(
            new BigNumber("10000000000000000000000000000")
              .minus(amount)
              .div(new BigNumber(10).pow(18))
              .toNumber()
          );

          const fullStartDate = this.startDate * 1000;
          const endDateTime = this.settingsApp.settings.freeclaimEndTime;

          const a = new Date(endDateTime).getTime();
          const b = Date.now();

          const leftDays = Math.floor((a - b) / (this.secondsInDay * 1000));
          const dateEnd = leftDays;
          const showTime = leftDays;

          resolve({
            startDate: fullStartDate,
            endDate: endDateTime,
            axnLeftToClaim,
            dateEnd,
            leftDays,
            showTime,
          });
        });
    });
  }

  public readSwapNativeToken() {
    return this.swapTokenBalanceOf(true).then((value) => {
      return this.NativeSwapContract.methods
        .calculateDeltaPenalty(value)
        .call()
        .then((res) => {
          return res;
        });
    });
  }

  public calculatePenalty(amount) {
    return this.NativeSwapContract.methods
      .calculateDeltaPenalty(amount.toString())
      .call()
      .then((res) => {
        return res;
      });
  }

  public depositAXN(amount, days) {
    const fromAccount = this.account.address;
    const depositTokens = (resolve, reject) => {
      return this.StakingContract.methods
        .stake(amount, days)
        .send({
          from: fromAccount,
        })
        .then((res) => {
          return this.checkTransaction(res);
        })
        .then(resolve, reject);
    };

    return new Promise((resolve, reject) => {
      this.checkAXNApproval(
        amount,
        this.StakingContract.options.address
      ).then(
        () => {
          depositTokens(resolve, reject);
        },
        () => {
          this.AXNContract.methods
            .approve(this.StakingContract.options.address, MaxUint256)
            .send({
              from: fromAccount,
            })
            .then(() => {
              depositTokens(resolve, reject);
            }, reject);
        }
      );
    });
  }

  public getStakingContractInfo() {
    const promises = [
      this.StakingContract.methods
        .startContract()
        .call()
        .then((startContract) => {
          return this.StakingContract.methods
            .stepTimestamp()
            .call()
            .then((stepTimestamp) => {
              const result =
                (Math.round(Date.now() / 1000) - startContract) / stepTimestamp;
              return {
                key: "StepsFromStart",
                value: result === Infinity ? 0 : result,
              };
            });
        }),
      this.StakingContract.methods
        .shareRate()
        .call()
        .then((result) => {
          return {
            key: "ShareRate",
            value: result,
          };
        }),
      this.SubBalanceContract.methods
        .getClosestYearShares()
        .call()
        .then((result) => {
          return {
            key: "closestYearShares",
            value: result,
          };
        }),
      this.BPDContract.methods
        .getClosestPoolAmount()
        .call()
        .then((result) => {
          return {
            key: "closestPoolAmount",
            value: result,
          };
        }),
    ];
    return Promise.all(promises).then((results) => {
      const values = {};
      results.forEach((v) => {
        values[v.key] = v.value;
      });
      return values;
    });
  }

  public getDaysInYear() {
    return new Promise((resolve) => {
      this.SubBalanceContract.methods
        .basePeriod()
        .call()
        .then((result) => {
          resolve(result);
        });
    });
  }

  public async geBPDInfo() {
    const promises = [
      this.getDaysInYear().then((daysInYear) => {
        return {
          key: "daysInYear",
          value: daysInYear,
        };
      }),
      this.getContractsInfo().then((contracts) => {
        return {
          key: "contracts",
          value: contracts,
        };
      }),
      this.SubBalanceContract.methods
        .getStartTimes()
        .call()
        .then((getStartTimes) => {
          return {
            key: "contractsStartTimes",
            value: getStartTimes,
          };
        }),
      this.getEndDateTimeHex3t().then((dateInfo) => {
        return {
          key: "dateInfo",
          value: dateInfo,
        };
      }),
      this.StakingContract.methods
        .stepTimestamp()
        .call()
        .then((stepTimestamp) => {
          return {
            key: "stepTimestamp",
            value: stepTimestamp,
          };
        }),
    ];

    const results = await Promise.all(promises);
    const values = {} as any;

    results.forEach((v) => {
      values[v.key] = v.value;
    });

    const bpdInfo = values;
    const bpd = [];
    let count = 0;

    bpdInfo.contracts.BPDInfo.map((value) => {
      const data = {
        value: 0,
        year: 0,
        dateEnd: 0,
        daysLeft: 0,
        show: true,
        seconds: 0,
      };

      data.value = value;
      data.year =
        count > 0
          ? bpdInfo.daysInYear * (count + 1)
          : Number(bpdInfo.daysInYear);

      data.dateEnd = bpdInfo.contractsStartTimes[count] * 1000;

      data.daysLeft = Math.round(
        (data.dateEnd - Date.now()) / (bpdInfo.stepTimestamp * 1000)
      );

      const a = moment(new Date(data.dateEnd));
      const b = moment(new Date());

      data.daysLeft = a.diff(
        b,
        this.settingsApp[this.settingsApp.settings.time.display].lowerName
      );
      data.seconds = a.diff(b, "seconds");

      data.show = a.diff(b, "seconds") < 0 ? false : true;

      bpd.push(data);

      count++;
    });

    return bpd;
  }

  public async getWalletStakesAsync(): Promise<{
    closed: Stake[];
    active: Stake[];
    matured: Stake[];
    closedV1: Stake[];
  }> {
    const stakeIds = await this.StakingContract.methods
      .sessionsOf_(this.account.address)
      .call();

    const lastStakeV1Id: number = +(await this.StakingContract.methods
      .lastSessionIdV1()
      .call());

    const stakeV1Ids: string[] = (
      await this.StakingV1Contract.methods
        .sessionsOf_(this.account.address)
        .call()
    ).filter((x) => !stakeIds.includes(x) && x <= lastStakeV1Id);

    const nowMs = Date.now();

    const stakePromises: Promise<Stake>[] = this.getStakePromises(
      stakeIds,
      nowMs
    );
    const stakeV1Promises: Promise<Stake>[] = this.getV1StakePromises(
      stakeV1Ids,
      nowMs
    );

    const stakes = await Promise.all(stakePromises.concat(stakeV1Promises));

    const dayMs = this.secondsInDay * 1000;

    for (const stake of stakes) {
      if (!stake.isWithdrawn) {
        const stakingInterest = await this.StakingContract.methods
          .calculateStakingInterest(
            stake.firstPayout,
            stake.lastPayout,
            stake.shares
          )
          .call();

        stake.interest = new BigNumber(stakingInterest);
      } else if (stake.isWithdrawn && !stake.isV1) {
        stake.payout = new BigNumber(stake.payout).plus(stake.bigPayDay);
        stake.interest = stake.payout.minus(stake.principal);
        stake.targetEnd = new Date(
          new BigNumber(stake.lastPayout)
            .minus(stake.firstPayout)
            .times(dayMs)
            .plus(stake.start.getTime())
            .toNumber()
        );
      }

      if (!(stake.isV1 && stake.isWithdrawn)) {
        const endMs = stake.end.getTime();
        const end = nowMs < endMs ? nowMs : endMs;
        const daysStaked = (end - stake.start.getTime()) / dayMs;

        stake.apy = stake.interest.times(100).div(stake.principal).div(daysStaked).times(365).dp(2).toNumber();
      }
    }

    return {
      closed: stakes.filter((stake: Stake) => {
        return (
          !stake.isV1 &&
          stake.isWithdrawn &&
          (!stake.isBpdWithdraw || stake.isBpdWithdrawn)
        );
      }),
      active: stakes.filter((stake: Stake) => {
        return (
          !stake.isMatured &&
          (!stake.isWithdrawn || (stake.isBpdWithdraw && !stake.isBpdWithdrawn))
        );
      }),
      matured: stakes.filter((stake: Stake) => {
        return (
          stake.isMatured &&
          (!stake.isWithdrawn || (stake.isBpdWithdraw && !stake.isBpdWithdrawn))
        );
      }),
      closedV1: stakes.filter((stake: Stake) => {
        return (
          stake.isV1 &&
          stake.isWithdrawn &&
          (!stake.isBpdWithdraw || stake.isBpdWithdrawn)
        );
      }),
    };
  }

  public async getStakePayoutAndPenalty(stake: Stake, stakingInterest: any) {
    return await this.StakingContract.methods
      .getAmountOutAndPenalty(
        stake.principal,
        stake.startSeconds,
        stake.endSeconds,
        stakingInterest
      )
      .call();
  }

  private getV1StakePromises(stakeV1Ids: any, nowMs: number): Promise<Stake>[] {
    return stakeV1Ids.map(async (stakeId) => {
      const stakeSession = await this.StakingV1Contract.methods
        .sessionDataOf(this.account.address, stakeId)
        .call();

      const bpdSession = await this.SubBalanceV1Contract.methods
        .getSessionStats(stakeId)
        .call();

      const bpdPayDayEligible = await this.SubBalanceV1Contract.methods
        .getSessionEligibility(stakeId)
        .call();

      const bigPayDayPayout = await this.SubBalanceContract.methods
        .calculateSessionPayout(
          bpdSession.start,
          bpdSession.sessionEnd,
          0,
          bpdSession.shares,
          bpdPayDayEligible
        )
        .call();

      const endMs = stakeSession.end * 1000;
      const amount = new BigNumber(stakeSession.amount);
      const bigPayDay = new BigNumber(bigPayDayPayout[0]);

      const stake: Stake = {
        start: new Date(stakeSession.start * 1000),
        startSeconds: stakeSession.start,
        end: new Date(endMs),
        endSeconds: stakeSession.end,
        targetEnd: null,
        shares: new BigNumber(stakeSession.shares),
        principal: amount,
        sessionId: stakeId,
        bigPayDay: bigPayDay,
        interest: null,
        payout: null,
        firstPayout: stakeSession.nextPayout,
        lastPayout:
          (stakeSession.end - stakeSession.start) /
          this.settingsApp.settings.time.seconds +
          +stakeSession.nextPayout,
        isMatured: nowMs > endMs,
        isWithdrawn: stakeSession.shares === "0",
        isBpdWithdraw: stakeSession.withdrawn && !bigPayDay.isZero(),
        isBpdWithdrawn: bpdSession.withdrawn,
        isV1: true,
        apy: 0
      };

      return stake;
    });
  }

  private getStakePromises(stakeIds: any, nowMs: number): Promise<Stake>[] {
    return stakeIds.map(async (stakeId) => {
      const stakeSession = await this.StakingContract.methods
        .sessionDataOf(this.account.address, stakeId)
        .call();

      const bpdSession = await this.SubBalanceContract.methods
        .getStakeSession(stakeId)
        .call();

      const bigPayDayPayout = await this.SubBalanceContract.methods
        .calculateSessionPayout(
          bpdSession.start,
          bpdSession.end,
          bpdSession.finishTime,
          bpdSession.shares,
          bpdSession.payDayEligible
        )
        .call();

      const endMs = stakeSession.end * 1000;
      const amount = new BigNumber(stakeSession.amount);
      const bigPayDay = new BigNumber(bigPayDayPayout[0]);

      const stake: Stake = {
        start: new Date(stakeSession.start * 1000),
        startSeconds: stakeSession.start,
        end: new Date(endMs),
        endSeconds: stakeSession.end,
        targetEnd: null,
        shares: new BigNumber(stakeSession.shares),
        principal: amount,
        sessionId: stakeId,
        bigPayDay: bigPayDay,
        interest: null,
        payout: stakeSession.payout,
        firstPayout: stakeSession.firstPayout,
        lastPayout: stakeSession.lastPayout,
        isMatured: nowMs > endMs,
        isWithdrawn: stakeSession.withdrawn,
        isBpdWithdraw: stakeSession.withdrawn && !bigPayDay.isZero(),
        isBpdWithdrawn: bpdSession.withdrawn,
        isV1: false,
        apy: 0
      };

      return stake;
    });
  }

  public unstake(sessionId) {
    return this.StakingContract.methods
      .unstake(sessionId)
      .send({
        from: this.account.address,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  public unstakeV1(sessionId) {
    return this.StakingContract.methods
      .unstakeV1(sessionId)
      .send({
        from: this.account.address,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  public async restake(stake: Stake, stakeDays: number, topUp: string) {
    if (!topUp) {
      topUp = "0";
    }

    let res: any;

    if (stake.isV1) {
      res = await this.StakingContract.methods
        .restakeV1(stake.sessionId, stakeDays, topUp)
        .send({
          from: this.account.address,
        });

    } else {
      res = await this.StakingContract.methods
        .restake(stake.sessionId, stakeDays, topUp)
        .send({
          from: this.account.address,
        });
    }

    await this.checkTransaction(res);
  }

  public async bpdWithdraw(sessionId) {
    await this.SubBalanceContract.methods.withdrawPayout(sessionId).send({
      from: this.account.address,
    });
  }

  public async sendMaxETHToAuction(amount, ref?) {
    const date = Math.round(
      (new Date().getTime() + 24 * 60 * 60 * 1000) / 1000
    );
    const refLink = ref
      ? ref.toLowerCase()
      : "0x0000000000000000000000000000000000000000".toLowerCase();

    const gasLimit = await this.web3Service.getGasLimit();
    const gasPrice = await this.web3Service.gasPrice();
    const estimatedGas = await this.AuctionContract.methods
      .bid(0, date, refLink)
      .estimateGas({
        from: this.account.address,
        gas: gasLimit,
        value: amount,
      });

    const newAmount = new BigNumber(amount).minus(estimatedGas * gasPrice);
    if (newAmount.isNegative()) {
      throw new Error("Not enough gas");
    }

    const amountOutMin = await this.getAmountOutMinAsync(newAmount.toString());

    return this.AuctionContract.methods
      .bid(amountOutMin, date, refLink)
      .send({
        from: this.account.address,
        value: newAmount,
        gasPrice,
        gasLimit: estimatedGas,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  public async sendETHToAuction(amount, ref?) {
    const date = Math.round(
      (new Date().getTime() + 24 * 60 * 60 * 1000) / 1000
    );
    const refLink = ref
      ? ref.toLowerCase()
      : "0x0000000000000000000000000000000000000000".toLowerCase();

    const amountOutMin = await this.getAmountOutMinAsync(amount);

    return this.AuctionContract.methods
      .bid(amountOutMin, date, refLink)
      .send({
        from: this.account.address,
        value: amount,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  public async sendETHToAuctionV2(amount, ref?) {
    const date = Math.round(
      (new Date().getTime() + 24 * 60 * 60 * 1000) / 1000
    );
    const refLink = ref
      ? ref.toLowerCase()
      : "0x0000000000000000000000000000000000000000".toLowerCase();

    const amountOutMin = await this.getAmountOutMinAsync(amount);

    return this.AuctionContract.methods
      .bid(amountOutMin, date, refLink)
      .send({
        from: this.account.address,
        value: amount,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  public async sendMaxETHToAuctionV2(amount, ref?) {
    const date = Math.round(
      (new Date().getTime() + 24 * 60 * 60 * 1000) / 1000
    );
    const refLink = ref
      ? ref.toLowerCase()
      : "0x0000000000000000000000000000000000000000".toLowerCase();

    const gasLimit = await this.web3Service.getGasLimit();
    const gasPrice = await this.web3Service.gasPrice();
    const estimatedGas = await this.AuctionContract.methods
      .bid(0, date, refLink)
      .estimateGas({
        from: this.account.address,
        gas: gasLimit,
        value: amount,
      });

    const newAmount = new BigNumber(amount).minus(estimatedGas * gasPrice);

    if (newAmount.isNegative()) {
      throw new Error("Not enough gas");
    }

    const amountOutMin = await this.getAmountOutMinAsync(newAmount.toString());

    return this.AuctionContract.methods
      .bid(amountOutMin, date, refLink)
      .send({
        from: this.account.address,
        value: newAmount,
        gasPrice,
        gasLimit: estimatedGas,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  private async getAmountOutMinAsync(amount: string): Promise<string> {
    const reducedAmount: string = this.reduceAmountByPercent(
      amount,
      environment.auctionRecipientPercent
    );

    const amountOut: string = (await this.getWethToAxionAmountsOutAsync(reducedAmount))[1];

    return this.reduceAmountByPercent(
      amountOut,
      environment.slippageTolerancePercent
    );
  }

  private reduceAmountByPercent(amount: string, percent: number): string {
    return new BigNumber(amount)
      .times((100 - percent) / 100)
      .dp(0)
      .toString(10);
  }

  public async getUsdcPerAxnPrice(): Promise<BigNumber> {
    const axnForOneEth = (await this.getWethToAxionAmountsOutAsync(this._1e18))[1];
    const usdcForOneEth = await this.getWethToUsdcAmountsOutAsync(this._1e18);

    return new BigNumber(this._1e18).div(axnForOneEth).times(usdcForOneEth);
  }

  public getUsdcPerEthPrice(): Promise<BigNumber> {
    return this.getWethToUsdcAmountsOutAsync(this._1e18);
  }

  private getWethToAxionAmountsOutAsync(amount: string): Promise<string[]> {
    return this.UniswapV2Router02.methods
      .getAmountsOut(amount, [
        this.CONTRACTS_PARAMS.WETH.ADDRESS,
        this.CONTRACTS_PARAMS.AXN.ADDRESS,
      ])
      .call();
  }

  private async getWethToUsdcAmountsOutAsync(amount: string): Promise<BigNumber> {
    return this.getTokenToUsdcAmountsOutAsync(this.CONTRACTS_PARAMS.WETH.ADDRESS, amount);
  }

  public async getTokenToUsdcAmountsOutAsync(tokenAddress: string, amount: string): Promise<BigNumber> {
    return new BigNumber((await this.UniswapV2Router02.methods
      .getAmountsOut(amount, [
        tokenAddress,
        this.CONTRACTS_PARAMS.USDC.ADDRESS,
      ])
      .call())[1]).div("1000000"); // USDC uses 6 decimal places
  }

  public getAuctionsData(todaysAuctionId: number, start: number) {
    todaysAuctionId = +todaysAuctionId;

    const oneDayInMS = this.secondsInDay * 1000;

    const tomorrowsAuctionId = todaysAuctionId + 1;
    const nextWeeklyAuctionId =
      7 * Math.ceil(todaysAuctionId === 0 ? 1 : todaysAuctionId / 7);

    const auctionIds = [todaysAuctionId, tomorrowsAuctionId];

    for (let i = 1; i <= 7; i++) {
      const previousAuctionId = todaysAuctionId - i;

      if (previousAuctionId >= 0) {
        auctionIds.unshift(previousAuctionId);
      } else {
        break;
      }
    }

    if (
      nextWeeklyAuctionId !== todaysAuctionId &&
      nextWeeklyAuctionId !== tomorrowsAuctionId
    ) {
      auctionIds.push(nextWeeklyAuctionId);
    }

    const nowDateTS = new Date().getTime();
    const auctionsPromises = auctionIds.map((id) => {
      return this.AuctionContract.methods
        .reservesOf(id)
        .call()
        .then((auctionData) => {
          const startDateTS = start + oneDayInMS * id;
          const endDateTS = startDateTS + oneDayInMS;
          const axnInPool = new BigNumber(auctionData.token);
          const ethInPool = new BigNumber(auctionData.eth);

          const auction = {
            id: id,
            isWeekly: id % 7 === 0,
            time: {
              date: moment(startDateTS),
              state:
                nowDateTS > startDateTS && nowDateTS < endDateTS
                  ? "progress"
                  : nowDateTS > endDateTS
                    ? "finished"
                    : "feature",
            },
            data: {
              axnInPool: axnInPool,
              ethInPool: ethInPool,
            },
            axnPerEth: null,
          };

          if (auction.time.state === "finished") {
            auction.axnPerEth = this.getAuctionAxnPerEth(
              axnInPool,
              ethInPool,
              auctionData.uniswapMiddlePrice
            );
          }

          return auction;
        });
    });

    return Promise.all(auctionsPromises).then((results) => {
      return results.sort((auction1, auction2) => {
        return auction1.id < auction2.id
          ? 1
          : auction1.id > auction2.id
            ? -1
            : 0;
      });
    });
  }

  public getAuctions() {
    return new Promise(async (resolve) => {
      const startMs =
        (await this.AuctionContract.methods.start().call()) * 1000;

      const auctionId = await this.AuctionContract.methods
        .calculateStepsFromStart()
        .call();

      resolve(await this.getAuctionsData(auctionId, startMs));
    });
  }

  public async getWalletBidsAsync(): Promise<{
    active: AuctionBid[];
    withdrawn: AuctionBid[];
    withdrawnV1: AuctionBid[];
  }> {
    const start = await this.AuctionContract.methods.start().call();

    const auctionIds: string[] = await this.AuctionContract.methods
      .auctionsOf_(this.account.address)
      .call();

    const lastAuctionV1Id: number = +(await this.AuctionContract.methods
      .lastAuctionEventIdV1()
      .call());

    const auctionV1Ids: string[] = (
      await this.AuctionV1Contract.methods
        .auctionsOf_(this.account.address)
        .call()
    ).filter((x) => !auctionIds.includes(x) && x <= lastAuctionV1Id);

    const bidPromises: Promise<AuctionBid>[] = this.getBidPromises(
      auctionIds,
      start
    );
    const bidV1Promises: Promise<AuctionBid>[] = this.getV1BidPromises(
      auctionV1Ids,
      start
    );

    const bids = (
      await Promise.all(bidPromises.concat(bidV1Promises))
    ).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));

    return {
      active: bids.filter((bid: AuctionBid) => {
        return bid.status !== "complete";
      }),
      withdrawn: bids.filter((bid: AuctionBid) => {
        return !bid.isV1 && bid.status === "complete";
      }),
      withdrawnV1: bids.filter((bid: AuctionBid) => {
        return bid.isV1 && bid.status === "complete";
      }),
    };
  }

  private getBidPromises(auctionIds: any[], start: any): Promise<AuctionBid>[] {
    return auctionIds.map(async (id) => {
      const auctionData = await this.AuctionContract.methods
        .reservesOf(id)
        .call();

      const accountBalance = await this.AuctionContract.methods
        .auctionBidOf(id, this.account.address)
        .call();

      const startTS = (+start + this.secondsInDay * id) * 1000;
      const endTS = moment(startTS + this.secondsInDay * 1000);

      const auctionBid: AuctionBid = this.getAuctionBid(
        id,
        auctionData,
        accountBalance,
        startTS,
        false
      );

      auctionBid.axnPerEth = this.getAuctionAxnPerEth(
        auctionBid.axnInPool,
        auctionBid.ethInPool,
        auctionData.uniswapMiddlePrice
      );

      const b = moment(new Date());
      const check = endTS.diff(b);

      if (check > 0) {
        auctionBid.status = "progress";
      } else {
        if (!accountBalance.withdrawn) {
          auctionBid.status = "withdraw";
        } else {
          auctionBid.status = "complete";
        }
      }

      return auctionBid;
    });
  }

  private getV1BidPromises(
    auctionIds: any[],
    start: any
  ): Promise<AuctionBid>[] {
    return auctionIds.map(async (id) => {
      const auctionData = await this.AuctionV1Contract.methods
        .reservesOf(id)
        .call();

      const accountBalance = await this.AuctionV1Contract.methods
        .auctionBetOf(id, this.account.address)
        .call();

      const startTS = (+start + this.secondsInDay * id) * 1000;
      const endTS = moment(startTS + this.secondsInDay * 1000);

      const auctionBid: AuctionBid = this.getAuctionBid(
        id,
        auctionData,
        accountBalance,
        startTS,
        true
      );

      const b = moment(new Date());
      const check = endTS.diff(b);

      if (check > 0) {
        auctionBid.status = "progress";
      } else {
        if (!auctionBid.ethBid.isZero()) {
          auctionBid.status = "withdraw";
        } else {
          auctionBid.status = "complete";
        }
      }

      if (auctionBid.status !== "complete") {
        auctionBid.axnPerEth = this.getAuctionAxnPerEth(
          auctionBid.axnInPool,
          auctionBid.ethInPool,
          auctionData.uniswapMiddlePrice
        );
      }

      return auctionBid;
    });
  }

  private getAuctionBid(
    id: any,
    auctionData: any,
    accountBalance: any,
    start: number,
    isV1: boolean
  ): AuctionBid {
    const auctionBid: AuctionBid = {
      auctionId: id,
      startDate: null,
      axnInPool: new BigNumber(auctionData.token),
      ethInPool: new BigNumber(auctionData.eth),
      ethBid: null,
      winnings: null,
      hasWinnings: null,
      status: null,
      axnPerEth: null,
      isV1: isV1,
    };

    auctionBid.ethBid = new BigNumber(accountBalance.eth);

    auctionBid.startDate = new Date(start);

    const uniswapPriceWithPercent = this.adjustPrice(
      new BigNumber(auctionData.uniswapMiddlePrice)
    ).div(this._1e18);

    const poolPrice = new BigNumber(auctionData.token).div(auctionData.eth);

    const axnWithoutBorder = poolPrice.times(auctionBid.ethBid);
    const axnAmountWithDiscount = new BigNumber(auctionBid.ethBid).times(
      uniswapPriceWithPercent
    );

    const userWinnings = BigNumber.minimum(
      axnAmountWithDiscount,
      axnWithoutBorder
    );

    auctionBid.winnings = userWinnings.div(this._1e18);
    auctionBid.hasWinnings = auctionBid.winnings.isPositive();

    if (accountBalance.ref !== "0x0000000000000000000000000000000000000000") {
      auctionBid.winnings = auctionBid.winnings.times(1.1);
    }

    return auctionBid;
  }

  private getAuctionAxnPerEth(
    axnInPool: BigNumber,
    ethInPool: BigNumber,
    uniswapMiddlePrice: string
  ) {
    const auctionPriceFromPool = axnInPool.div(
      !ethInPool.isZero() ? ethInPool : 1
    );
    const averagePrice = new BigNumber(uniswapMiddlePrice);

    const uniswapDiscountedAveragePrice = this.adjustPrice(
      averagePrice.div(this._1e18)
    );

    return BigNumber.minimum(
      uniswapDiscountedAveragePrice,
      auctionPriceFromPool
    );
  }

  private adjustPrice(price: BigNumber): BigNumber {
    return price.times(1 + (this.discountPercent - this.premiumPercent) / 100);
  }

  public withdrawFromAuction(auctionId, autoStakeDays) {
    return this.AuctionContract.methods
      .withdraw(auctionId, autoStakeDays)
      .send({
        from: this.account.address,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  public withdrawFromAuctionV1(auctionId, autoStakeDays) {
    return this.AuctionContract.methods
      .withdrawV1(auctionId, autoStakeDays)
      .send({
        from: this.account.address,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  public updateUserSnapshot() {
    this.httpService
      .get(`${environment.freeClaimApi}/addresses/${this.account.address}/`)
      .toPromise()
      .then(
        (result) => {
          this.account.snapshot = result;
          this.account.snapshot.nothingToClaim =
            this.account.snapshot.hex_amount <= 0;
          this.account.snapshot.hexAmount =
            new BigNumber(this.account.snapshot.hex_amount).toNumber() > 0
              ? new BigNumber(
                this.account.snapshot.hex_amount.div(10000000000).toFixed(0)
              )
              : 0;
        },
        () => {
          this.account.snapshot = {
            user_address: this.account.address,
            nothingToClaim: true,
            hex_amount: "0",
            user_hash: "",
            hash_signature: "",
          };
        }
      );
    this.updateClaimableInformationHex();
  }

  private getAccountSnapshot() {
    return new Promise((resolve) => {
      return this.httpService
        .get(`${environment.freeClaimApi}/addresses/${this.account.address}/`)
        .toPromise()
        .then(
          (result) => {
            this.account.snapshot = result;
            this.account.snapshot.nothingToClaim =
              this.account.snapshot.hex_amount <= 0;
            this.account.snapshot.hexAmount = new BigNumber(
              this.account.snapshot.hex_amount
            )
              .div(10000000000)
              .toNumber();
          },
          () => {
            this.account.snapshot = {
              user_address: this.account.address,
              nothingToClaim: true,
              hex_amount: "0",
              user_hash: "",
              hash_signature: "",
            };
          }
        )
        .finally(() => {
          resolve(null);
        });
    });
  }

  public claimFromForeign() {
    return this.ForeignSwapContract.methods
      .claimFromForeign(
        this.account.snapshot.hex_amount,
        this.account.snapshot.hash_signature
      )
      .send({
        from: this.account.address,
      })
      .then((res) => {
        return this.checkTransaction(res);
      });
  }

  private initializeContracts() {
    this.H2TContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.H2T.ABI,
      this.CONTRACTS_PARAMS.H2T.ADDRESS
    );

    this.AXNContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.AXN.ABI,
      this.CONTRACTS_PARAMS.AXN.ADDRESS
    );

    this.NativeSwapContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.NativeSwap.ABI,
      this.CONTRACTS_PARAMS.NativeSwap.ADDRESS
    );

    this.AuctionContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.Auction.ABI,
      this.CONTRACTS_PARAMS.Auction.ADDRESS
    );

    this.AuctionV1Contract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.AuctionV1.ABI,
      this.CONTRACTS_PARAMS.AuctionV1.ADDRESS
    );

    this.StakingContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.Staking.ABI,
      this.CONTRACTS_PARAMS.Staking.ADDRESS
    );

    this.StakingV1Contract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.StakingV1.ABI,
      this.CONTRACTS_PARAMS.StakingV1.ADDRESS
    );

    this.HEXContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.HEX.ABI,
      this.CONTRACTS_PARAMS.HEX.ADDRESS
    );

    this.ForeignSwapContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.ForeignSwap.ABI,
      this.CONTRACTS_PARAMS.ForeignSwap.ADDRESS
    );

    this.BPDContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.BPD.ABI,
      this.CONTRACTS_PARAMS.BPD.ADDRESS
    );

    this.SubBalanceContract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.SubBalance.ABI,
      this.CONTRACTS_PARAMS.SubBalance.ADDRESS
    );

    this.SubBalanceV1Contract = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.SubBalanceV1.ABI,
      this.CONTRACTS_PARAMS.SubBalanceV1.ADDRESS
    );

    this.UniswapV2Router02 = this.web3Service.getContract(
      this.CONTRACTS_PARAMS.UniswapV2Router02.ABI,
      this.CONTRACTS_PARAMS.UniswapV2Router02.ADDRESS
    );

    this.AxnTokenAddress = this.CONTRACTS_PARAMS.HEX.ADDRESS;

    this.getEndDateTimeHex3t();
  }
}
