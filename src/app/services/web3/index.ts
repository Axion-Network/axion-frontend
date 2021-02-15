import { Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { AppConfig } from "src/app/appconfig";
import Web3 from "web3";
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: "root",
})
export class MetamaskService {
  private metaMaskWeb3: any;

  private usedNetworkVersion: number;
  private net: string;

  private networks = {
    production: "mainnet",
    testnet: "ropsten",
  };

  constructor(config: AppConfig) {
    const settingsApp = config.getConfig();

    this.networks.testnet = settingsApp.settings.network;

    this.usedNetworkVersion = environment.production
      ? 1
      : settingsApp.settings.net;
    this.net =
      this.usedNetworkVersion === 1 ? "mainnet" : settingsApp.settings.network;

    this.providers = {};
    this.providers.metamask = Web3.givenProvider;
    this.Web3 = new Web3(Web3.givenProvider)
    this.metaMaskWeb3 = window["ethereum"];
  }

  private providers;
  public Web3;

  public getContract(abi, address) {
    return new this.Web3.eth.Contract(abi, address);
  }

  public subscribeToNewBlocks(callback) {
    return this.Web3.eth.subscribe("newBlockHeaders")
      .on("data", () => callback());
  }

  public encodeFunctionCall(name, type, inputs, params) {
    return this.Web3.eth.abi.encodeFunctionCall(
      {
        name,
        type,
        inputs,
      },
      params
    );
  }

  public gasPrice() {
    return this.Web3.eth.getGasPrice().then((res) => {
      return res;
    });
  }

  public async getGasLimit(): Promise<string> {
    const block = await this.Web3.eth.getBlock("latest");
    return block.gasLimit;
  }

  public async addToken(tokenOptions) {
    try {
      const wasAdded = await this.metaMaskWeb3.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC20",
          options: tokenOptions,
        },
      });

      if (wasAdded) {
        console.log("Complete");
      }
    } catch (error) {
      console.log(error);
    }
  }

  public getBalance(address) {
    return this.Web3.eth.getBalance(address);
  }

  public getBlock() {
    return this.Web3.eth.getBlock("latest");
  }

  public getAccounts(noEnable?) {
    const onAuth = (observer, address) => {
      if (this.Web3) {
        this.Web3.setProvider(this.providers.metamask);
      } else {
        this.Web3 = new Web3(this.providers.metamask);
      }
      observer.next({
        address,
        network: this.net,
      });
      if (noEnable) {
        observer.complete();
      }
    };

    const onError = (observer, errorParams) => {
      // this.Web3.setProvider(this.providers.infura);
      observer.error(errorParams);
      if (noEnable) {
        observer.complete();
      }
    };

    const isValidMetaMaskNetwork = (observer, chain?) => {
      return new Promise((resolve, reject) => {
        this.metaMaskWeb3
          .request({
            method: "net_version",
          })
          .then((result) => {
            if (this.usedNetworkVersion !== Number(result)) {
              if (chain) {
                onError(observer, {
                  code: 3,
                  msg: "Not authorized",
                });
              }

              observer.error({
                code: 2,
                msg: "Please choose " + this.net + " network in Metamask.",
              });
              reject();
            }
            resolve(null);
          });
      });
    };

    return new Observable((observer) => {
      if (this.metaMaskWeb3 && this.metaMaskWeb3.isMetaMask) {
        this.metaMaskWeb3.on("chainChanged", (chainId) => {
          isValidMetaMaskNetwork(observer)
            .then(() => {
              // onAuth(observer, this.metaMaskWeb3.selectedAddress);
              window.location.reload();
            })
            .catch((err) => {
              console.log(err);
              onError(observer, {
                code: 3,
                msg: "Not authorized",
              });
            });
        });

        isValidMetaMaskNetwork(observer).then(() => {
          this.metaMaskWeb3.on("accountsChanged", (accounts) => {
            if (accounts.length) {
              onAuth(observer, accounts[0]);
            } else {
              onError(observer, {
                code: 3,
                msg: "Not authorized",
              });
            }
          });

          if (!this.metaMaskWeb3.selectedAddress && !noEnable) {
            this.metaMaskWeb3.enable().catch(() => {
              onError(observer, {
                code: 3,
                msg: "Not authorized",
              });
            });
          } else {
            if (this.metaMaskWeb3.selectedAddress) {
              onAuth(observer, this.metaMaskWeb3.selectedAddress);
            } else {
              onError(observer, {
                code: 3,
                msg: "Not authorized",
              });
            }
          }
        });
      } else {
        onError(observer, {
          code: 1,
          msg:
            'Metamask extension is not found. You can install it from <a href="https://metamask.io" target="_blank">metamask.io</a>',
        });
      }
      return {
        unsubscribe() {},
      };
    });
  }

  public toChecksumAddress(address: string) {
    return Web3.utils.toChecksumAddress(address)
  }
}
