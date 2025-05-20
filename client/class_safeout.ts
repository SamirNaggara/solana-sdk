import { createMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, ParsedInstruction, PartiallyDecodedInstruction, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createHash } from 'crypto';
import { createMemoInstruction } from '@solana/spl-memo';
import { getPayerKeypair } from './lib/solanaUtils';
import { getBalances } from './get_balance';
import { ChipMetadata } from './schema/metadata';

export interface SafeoutSDKOptions {
    getProducts?: string;
    newProduct?: string;
    updateProduct?: string;
    deleteProduct?: string;
}

export class SafeoutSDK {
    private mintAuthority: PublicKey;
    private owner: PublicKey;

    private getProducts: string;
    private newProduct: string;
    private updateProduct: string;
    private deleteProduct: string;
    private connection: Connection;

    constructor(
        mintAuthority: PublicKey,
        owner: PublicKey,
        options: SafeoutSDKOptions = {}
    ) {
        this.mintAuthority = mintAuthority;
        this.owner = owner;

        this.getProducts = options.getProducts || 'https://default.api/get-products';
        this.newProduct = options.newProduct || 'https://default.api/new-product';
        this.updateProduct = options.updateProduct || 'https://default.api/update-product';
        this.deleteProduct = options.deleteProduct || 'https://default.api/delete-product';
        this.connection = new Connection('https://api.devnet.solana.com', 'confirmed');
    }

    public getMintAuthority(): PublicKey {
        return this.mintAuthority;
    }

    public getOwner(): PublicKey {
        return this.owner;
    }

    public getEndpoints(): Record<string, string> {
        return {
            getProducts: this.getProducts,
            newProduct: this.newProduct,
            updateProduct: this.updateProduct,
            deleteProduct: this.deleteProduct,
        };
    }

    public stableStringify(obj: ChipMetadata): string {
        const allKeys = Object.keys(obj).sort();
        const sortedObj: Record<string, unknown> = {};

        for (const key of allKeys) {
            const value = obj[key as keyof ChipMetadata];
            sortedObj[key] = value instanceof PublicKey ? value.toBase58() : value;
        }

        return JSON.stringify(sortedObj);
    }

    public hashObject(obj: ChipMetadata): string {
        const json = this.stableStringify(obj);
        const hash = createHash('sha256');
        hash.update(json);
        return hash.digest('hex');
    }

    public async createToken(privateMetadata: ChipMetadata): Promise<string | undefined> {
        const payer = await getPayerKeypair();

        const mint = await createMint(this.connection, payer, this.mintAuthority, null, 0);
        console.log('Token created with mint:', mint.toBase58());

        const associatedTokenAccount = await getAssociatedTokenAddress(
            mint,
            this.owner,
            false,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        console.log('Associated token account:', associatedTokenAccount.toBase58());
        const hashData = this.hashObject(privateMetadata).toString();
        console.log('Hash of private metadata:', hashData);

        const ataInstruction = createAssociatedTokenAccountInstruction(
            payer.publicKey,
            associatedTokenAccount,
            this.owner,
            mint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        );

        const memoInstruction = createMemoInstruction(hashData, [payer.publicKey]);

        const transaction = new Transaction()
            .add(ataInstruction)
            .add(memoInstruction);

        try {
            const signature = await sendAndConfirmTransaction(this.connection, transaction, [payer], {
                skipPreflight: false,
                commitment: 'confirmed',
            });
            console.log('Transaction successful! Signature:', signature);

            // await getBalances(payer.publicKey, this.owner, mint);

            return signature;
        } catch (error) {
            console.error('Transaction failed:', error);
        }
    }

    public isParsedInstruction(instruction: ParsedInstruction | PartiallyDecodedInstruction): instruction is ParsedInstruction {
        return (instruction as ParsedInstruction).parsed !== undefined;
    }
    public async getMemoFromSignature(signature: string): Promise<string | null> {
        const tx = await this.connection.getParsedTransaction(signature, {
            commitment: "confirmed",
        });

        if (!tx) {
            console.log("Transaction not found.");
            return null;
        }

        const memoProgramId = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
        const memopublicKey = new PublicKey(memoProgramId);

        for (const inner of tx.transaction.message.instructions) {
            if (inner.programId.equals(memopublicKey)) {
                if (this.isParsedInstruction(inner)) {
                    return inner.parsed;
                }
            }
        }
        return null;
    }
};

const sdk = new SafeoutSDK(new PublicKey('4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1'), new PublicKey('9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ'))
const metadata: ChipMetadata = {
    name: "Safeout Jacket 001",
    description: "Limited edition jacket",
    isStolen: false,
    extraInfo: "Batch #A12, waterproof",
    owner: new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ"),
};

const hash = sdk.hashObject(metadata).toString();
sdk.createToken(metadata).then(signature => {
    if (signature) {
        sdk.getMemoFromSignature(signature).then(memo => {
            if (memo === hash)
                console.log("Valided by blockchain");
            else
                console.log("hash dindt match");
        }).catch(error => {
            console.error("Error fetching memo:", error);
        });
    } else {
        console.error("Signature is undefined. Cannot fetch memo.");
    }
}).catch(error => {
    console.error("Error creating token:", error);
});
