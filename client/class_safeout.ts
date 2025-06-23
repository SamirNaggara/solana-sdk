import { createMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, ParsedInstruction, PartiallyDecodedInstruction, PublicKey, Transaction, sendAndConfirmTransaction, Signer, TransactionInstruction } from '@solana/web3.js';
import { createHash } from 'crypto';
import { createMemoInstruction, MEMO_PROGRAM_ID } from '@solana/spl-memo';
import { getPayerKeypair } from './lib/solanaUtils';
import z from 'zod';
import { PrismaClient } from '@prisma/client';
import Bottleneck from "bottleneck";
import { GetIDProductDPP } from './GetIdProuctDPP';

type NetworkValue = 'Mainnet' | 'Testnet' | 'Devnet';

const isoDateString = z.string().refine(val => !isNaN(Date.parse(val)), {
	message: "Must be a valid ISO date string",
});

const signatureString = z.string().min(1, "Signature must be a non-empty string");

const SignatureSchema = z.object({
	hash: z.string().min(1, "Hash is required"),
	updatedAt: isoDateString,
	lastUpdate: z.array(signatureString).optional(),
});


export class SafeoutSDK {
	private mintAuthority: PublicKey;
	private owner: PublicKey;
	private hashAlgo: string;
	private connection: Connection;
	private prisma: PrismaClient;
	private mint: PublicKey | null;
	constructor(
		network: NetworkValue,
		hashAlgo: string,
		mintAuthority: PublicKey,
		owner: PublicKey,
	) {
		this.prisma = new PrismaClient();
		this.mintAuthority = mintAuthority;
		this.hashAlgo = hashAlgo;
		this.owner = owner;
		let url: string = '';
		if (network == 'Mainnet')
			url = 'https://api.mainnet-beta.solana.com';
		else if (network == 'Testnet')
			url = 'https://api.testnet.solana.com';
		else if (network == 'Devnet')
			url = 'https://api.devnet.solana.com';
		this.connection = new Connection(url, 'confirmed');
		this.mint = null;
	}

	/**
	* Creates a token for a given Product ID.
	* @param ProductId - The ID of the product to create a token for.
	* @returns The signature of the transaction that created the token.
	* @throws Will throw an error if a token has already been created for the given Product ID or if the transaction fails.
	*/
	public async createToken(ProductId: string): Promise<string> {

		if (this.mint === null) {
			this.mint = await this.initializeMint();
		}
		let payer: Keypair = await this.getPayer();

		const privateMetadata = await this.getMetadataFromId(ProductId)
		if (await this.getSignatureFromId(ProductId)) {
			throw new Error("Token already created for this Product ID: " + ProductId);
		}
		const hashData = this.hashObject(privateMetadata);

		const ataInstruction = await this.createIntruction(payer)
		const memodata = JSON.stringify({
			hash: hashData,
			updatedAt: new Date().toISOString(),
			lastUpdate: [],
		});

		try {
			const signature = await this.sendTransactionWithMemo(payer, ataInstruction, memodata);
			this.SetSignatureFromId(ProductId, signature);
			return signature;
		} catch (error) {
			throw new Error('Transaction failed:' + error);
		}
	}

	/**
	*  Updates the token for a given Product ID based on the signature.
	* @param {string} ProductId - The ID of the product to update the token for.
	* @returns {Promise<string>} - The signature of the transaction that updated the token.
	* @throws {Error} - If no memo or signature is found for the given Product ID, or if no update is needed.
	*/
	public async UpdateTokenfromID(ProductId: string): Promise<string> {

		if (this.mint === null) {
			this.mint = await this.initializeMint();
		}
		const memo = await this.getMemoFromSignature(ProductId);
		if (!memo) {
			throw new Error("No memo found for the given Product ID.");
		}
		let signature = await this.getSignatureFromId(ProductId);
		if (!signature) {
			throw new Error("No signature found for the given Product ID.");
		}
		const memoData = SignatureSchema.parse(JSON.parse(memo));
		const metadata = await this.getMetadataFromId(ProductId);
		const newhashData = this.hashObject(metadata);
		if (memoData.hash === newhashData) {
			throw new Error("No update needed, hash is the same.");
		}
		memoData.hash = newhashData;
		memoData.updatedAt = new Date().toISOString();
		if (!memoData.lastUpdate) {
			memoData.lastUpdate = [];
		}
		memoData.lastUpdate.push(signature);

		let payer: Keypair = await this.getPayer();

		const ataInstruction = await this.createIntruction(payer)
		const memodata = JSON.stringify({
			hash: memoData.hash,
			updatedAt: memoData.updatedAt,
			lastUpdate: memoData.lastUpdate || [],
		});
		try {
			const signature = await this.sendTransactionWithMemo(payer, ataInstruction, memodata);
			this.SetSignatureFromId(ProductId, signature);
			return signature;
		} catch (error) {
			throw new Error('Transaction failed:' + error);
		}
	}


	/**
	* Batch mints tokens for multiple products concurrently.
	* @param {string[]} ProductIdArray - An array of product IDs to mint tokens for.
	* @param {number} concurrency - The number of concurrent minting operations to perform (default is 5).
	* @returns {Promise<string[]>} - A promise that resolves to an array of signatures for the minted tokens.
	* @throws {Error} - If any minting operation fails, it will log the error and continue with the next product.
	*/
	public async batchMint(ProductIdArray: string[], concurrency: number = 10): Promise<string[]> {
		const ProductDataArray: object[] = await this.getMetadataFromIdArray(ProductIdArray);
		const results: string[] = [];
	
		if (this.mint === null) {
			this.mint = await this.initializeMint();
		}
		const limiter = new Bottleneck({
			maxConcurrent: concurrency,
			minTime: 100,
			reservoir: 20,
			reservoirRefreshAmount: 20,
			reservoirRefreshInterval: 10 * 100,
		});
		const tasks = ProductDataArray.map((product, i) => {
			const ProductId = ProductIdArray[i];

			return limiter.schedule(async () => {
				try {
					const sortedEntries = Object.entries(product).sort(([a], [b]) => a.localeCompare(b));
					const sortedJson = Object.fromEntries(sortedEntries);
					const sortedJsonString = JSON.stringify(sortedJson, null, 2);

					let signature: string | null;
					if (!(await this.checkSignaturebyID(ProductId))) {
						signature = await this.createToken(ProductId);
					} else {
						signature = await this.UpdateTokenfromID(ProductId);
					}

					if (signature) {
						results.push(signature);
					}
				} catch (error: any) {
					console.error(`Error processing product ${ProductId} (${i + 1}/${ProductDataArray.length}):`, error.message || error);
				}
			});
		});
		await Promise.all(tasks);
		return results;
	}

	/**
	* Check if the local datas of the product match the hash in the blockchain.
	* @param ProductId - The ID of the product to check.
	* @returns An object indicating whether the product is valid and, if not, the reason for its invalidity.
	*/
	public async CheckAuthenticityOnBlockchain(ProductId: string): Promise<{ isValid: boolean, reason?: string }> {
		const metadata: string = await (this.getMetadataFromId(ProductId))
		const hash = this.hashObject(metadata);
		const memo = await this.getMemoFromSignature(ProductId);
		const memoData = SignatureSchema.parse(JSON.parse(memo));
		if (memoData.hash !== hash) {
			return { isValid: false, reason: "Hash mismatch" };
		}
		return { isValid: true };
	}

	private async initializeMint(): Promise<PublicKey> {
		const payer = await getPayerKeypair();
		const mint = await createMint(this.connection, payer, this.mintAuthority, null, 0);
		return mint
	}

	/**
	* Retrieves the payer keypair for the transaction.
	* @async
	* @function getPayer
	* @description This function retrieves the payer keypair from the local environment.
	* It is used to sign transactions and pay for fees on the Solana network.
	* @throws Will throw an error if the payer keypair cannot be retrieved.
	*/
	private async getPayer(): Promise<Keypair> {
		return await getPayerKeypair();
	}

	/**
   * Hashes a given object using the specified hashing algorithm.
   * @param {string} obj - The object to hash, represented as a string.
   * @returns {string} - The hexadecimal representation of the hash.
   * @throws {Error} - If the hashing algorithm is not supported.
   */
	private hashObject(obj: string): string {
		const hash = createHash(this.hashAlgo);
		hash.update(obj);
		return hash.digest('hex');
	}

	/**
	*  Creates a transaction instruction to create an associated token account for the owner.
	* @param {Signer} payer - The signer who will pay for the transaction.
	* @returns {Promise<TransactionInstruction>} - A transaction instruction to create the associated token account.
	* @throws {Error} - If the mint creation fails or if the associated token account cannot be created.
	*/
	private async createIntruction(payer: Signer): Promise<TransactionInstruction | null> {
		if (this.mint === null) {
			this.mint = await this.initializeMint();
		}

		const associatedTokenAccount = await getAssociatedTokenAddress(
			this.mint,
			this.owner,
			false,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		);

		const accountInfo = await this.connection.getAccountInfo(associatedTokenAccount);
		if (accountInfo) {
			return null; // Associated token account already exists, no need to create it.
		}
		const ataInstruction = createAssociatedTokenAccountInstruction(
			payer.publicKey,
			associatedTokenAccount,
			this.owner,
			this.mint,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		);

		return ataInstruction;
	}

	/**
	*  Creates a new product in the database.
	* @param {string} ProductId - The ID of the product to create.
	* @param {object} info - The metadata information for the product.
	* @returns {Promise<void>} - A promise that resolves when the product is created.
	* @throws {Error} - If a product with the given ID already exists.
	*/
	public async createProduct(ProductId: string, info: object): Promise<void> {
		const existingProduct = await this.prisma.productDPP.findUnique({
			where: { id: ProductId },
		});
		if (existingProduct) {
			throw new Error(`Product with ID ${ProductId} already exists.`);
		}
		await this.prisma.productDPP.create({
			data: {
				id: ProductId,
				info: info,
				signature: "",
			},
		});
	}

	/**
	*  Retrieves the memo associated with a given product signature.
	* @param {string} ProductId - The ID of the product to retrieve the memo for.
	* @returns {Promise<string | null>} - The memo associated with the product signature, or null if not found.
	* @throws {Error} - If the product with the given ID does not exist.
	*/
	private async getMetadataFromId(ProductId: string): Promise<string> {
		const product = await this.prisma.productDPP.findUnique({
			where: { id: ProductId },
		});
		if (!product) {
			throw new Error(`Product with ID ${ProductId} not found.`);
		}
		return JSON.stringify(product.info);
	}

	/**
	*  Retrieves the memo associated with a given product signature.
	* @param {string} ProductId - The ID of the product to retrieve the memo for.
	* @returns {Promise<string | null>} - The memo associated with the product signature, or null if not found.
	* @throws {Error} - If the product with the given ID does not exist or if no memo is found.
	*/
	private async getMetadataFromIdArray(ProductIdArray: string[]): Promise<object[]> {
		const products = await this.prisma.productDPP.findMany({
			where: {
				id: {
					in: ProductIdArray,
				},
			},
			select: { info: true },
		});
		if (!products || products.length === 0) {
			throw new Error(`No products found for the provided IDs.`);
		}
		return products
			.map(product => product.info)
			.filter((info): info is object => info !== null && typeof info === 'object');
	}

	/**
	* Retrieves the memo from a transaction signature.
	* @param IdProduct - The ID of the product to retrieve the memo for.
	* @returns The memo associated with the product ID.
	* @throws Will throw an error if no signature is found for the product ID or if the memo is not found in the transaction.
	*/
	private async getMemoFromSignature(IdProduct: string): Promise<string> {
		const signature = await this.getSignatureFromId(IdProduct);
		if (!signature) {
			throw new Error("No signature for " + IdProduct);
		}

		const tx = await this.connection.getParsedTransaction(signature, {
			commitment: "confirmed",
		});

		if (!tx) {
			throw new Error("Transaction not found.");
		}

		for (const inner of tx.transaction.message.instructions) {
			if (inner.programId.equals(MEMO_PROGRAM_ID)) {
				if (this.isParsedInstruction(inner)) {
					return inner.parsed;
				}
			}
		}
		throw new Error("Memo Not found");
	}

	/**
	*  Sends a transaction with a memo instruction.
	* @param {Keypair} payer - The payer keypair who will sign the transaction.
	* @param {TransactionInstruction} ataInstruction - The instruction to create the associated token account.
	* @param {string} memo - The memo to include in the transaction.
	* @returns {Promise<string>} - The signature of the confirmed transaction.
	* @throws {Error} - If the transaction fails to send or confirm.
	*/
	private async sendTransactionWithMemo(
		payer: Keypair,
		ataInstruction: TransactionInstruction | null,
		memo: string
	): Promise<string> {
		const memoInstruction = createMemoInstruction(memo, [payer.publicKey]);
		const transaction = new Transaction();

		if (ataInstruction) {
			transaction.add(ataInstruction);
		}
		transaction.add(memoInstruction);

		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = payer.publicKey;

		return await sendAndConfirmTransaction(this.connection, transaction, [payer], {
			skipPreflight: false,
			commitment: 'confirmed',
		});
	}

	/**
	*  Retrieves the memo associated with a given product signature.
	* @param {string} ProductId - The ID of the product to retrieve the memo for.
	* @returns {Promise<string | null>} - The memo associated with the product signature, or null if not found.
	* @throws {Error} - If the product with the given ID does not exist.
	*/
	private async getSignatureFromId(ProductId: string): Promise<string | null> {
		const product = await this.prisma.productDPP.findUnique({
			where: { id: ProductId },
			select: { signature: true },
		});
		if (!product) {
			throw new Error(`Product with ID ${ProductId} not found.`);
		}
		return product.signature || null;
	}

	/**
	*  Sets the signature for a product based on its ID.
	* @param {string} ProductId - The ID of the product to set the signature for.
	* @param {string} signature - The signature to set for the product.
	* @returns {Promise<void>} - A promise that resolves when the signature is set.
	* @throws {Error} - If the product with the given ID does not exist or if a signature already exists for that product.
	*/
	private async SetSignatureFromId(ProductId: string, signature: string): Promise<void> {
		const product = await this.prisma.productDPP.findUnique({
			where: { id: ProductId },
		});
		if (!product) {
			throw new Error(`Product with ID ${ProductId} not found.`);
		}
		if (product.signature) {
			throw new Error(`Signature already exists for Product ID ${ProductId}.`);
		}
		await this.prisma.productDPP.update({
			where: { id: ProductId },
			data: { signature: signature },
		});
	}

	/**
	* Checks if a signature exists for a given Product ID.
	* @param {string} ProductId - The ID of the product to check.
	* @returns {Promise<boolean>} - A promise that resolves to true if a signature exists, false otherwise.
	* @throws {Error} - If the product with the given ID does not exist.
	*/
	private async checkSignaturebyID(ProductId: string): Promise<boolean> {
		const signature = await this.getSignatureFromId(ProductId);
		if (!signature) {
			return false;
		}
		return true;
	}

	/**
	* Checks if the instruction is a parsed instruction.
	* @param instruction - The instruction to check.
	* @returns True if the instruction is a parsed instruction, false otherwise.
	*/
	private isParsedInstruction(instruction: ParsedInstruction | PartiallyDecodedInstruction): instruction is ParsedInstruction {
		return (instruction as ParsedInstruction).parsed !== undefined;
	}

};

const sdk = new SafeoutSDK('Testnet',
	'sha256',
	new PublicKey('4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1'),
	new PublicKey('9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ'))

import readline from 'node:readline';
import { fi } from 'zod/v4/locales';
const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
})

function askQuestion(question: string): Promise<string> {
	return new Promise((resolve) => {
		rl.question(question, resolve)
	})
}

async function mainLoop() {
	while (true) {
		const answer = await askQuestion('check or create or update or batch ?\n')
		try {
			switch (answer.toLowerCase()) {
				case 'check':
					console.log(await sdk.CheckAuthenticityOnBlockchain('26358076-bd39-4775-b714-d253de5da8c8'))
					break
				case 'create':
					await sdk.createToken('afdsqfd98e-55f8-466e-81ee-248d41114658')
					break
				case 'update':
					await sdk.UpdateTokenfromID('afdsqfd98e-55f8-466e-81ee-248d41114658')
					break
				case 'cc':
					await sdk.createProduct('afdsqfd98e-55f8-466e-81ee-248d41114658', {
						name: 'Test Product',
						description: 'This is a test product',
					})
					break
				case 'batch': {
					const ids = await GetIDProductDPP();
					console.log('Batch minting for :', ids.length, 'products');
					if (Array.isArray(ids) && ids.length > 0) {
						await sdk.batchMint(ids);
					} else {
						console.error('No product IDs found for batch mint.');
					}
					break;
				}
				case 'exit':
					console.log('Bye!')
					rl.close()
					process.exit(0)
				default:
					console.log('Invalid answer!')
			}
		} catch (error) {
			console.error('An error occurred:', error);
		}
	}
}

mainLoop()

