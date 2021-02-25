import {Component, Inject} from '@angular/core';
import {MatDialogRef, MAT_DIALOG_DATA} from '@angular/material/dialog';

@Component({
  selector: 'app-metamask-error',
  templateUrl: './metamask-error.component.html'
})
export class MetamaskErrorComponent {
    public err: string;
    public technicalError: string;

    constructor(
        public dialogRef: MatDialogRef<MetamaskErrorComponent>,
        @Inject(MAT_DIALOG_DATA) public data: any
    ) {
        this.err = data.msg;

        if (this.err.toLowerCase().includes("transaction was not mined within 50 blocks")) {
            this.err = `Your transaction is taking longer than usual due to a below average gas price that was set. 
                        Please check your wallet address on Etherscan and click on the pending transaction for an estimated transaction time. 
                        Do not cancel the transaction yet. Alternatively, you can try to 'speed up' the transaction in the 'Activity' section of Metamask.`;
        }

        if (this.err.toString().includes("Transaction has been reverted by the EVM")) {
            this.technicalError = data.msg;
            this.err = "Transaction has been reverted by Ethereum. Please try the action again, or get in contact with support for further information.";
        }
    }

    public closeModal() {
        this.dialogRef.close();
    }
}
