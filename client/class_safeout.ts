import { createMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, ParsedInstruction, PartiallyDecodedInstruction, PublicKey, Transaction, sendAndConfirmTransaction, Signer, TransactionInstruction } from '@solana/web3.js';

import { createHash } from 'crypto';
import { createMemoInstruction, MEMO_PROGRAM_ID } from '@solana/spl-memo';
import { getPayerKeypair } from './lib/solanaUtils';
import { ChipMetadata } from './schema/metadata';
import z from 'zod';
import { PrismaClient } from '@prisma/client';


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
	private JWToken: string;
	private prisma: PrismaClient;
	constructor(
		network: NetworkValue,
		hashAlgo: string,
		JWToken: string,
		mintAuthority: PublicKey,
		owner: PublicKey,
	) {
		this.prisma = new PrismaClient();
		this.mintAuthority = mintAuthority;
		this.hashAlgo = hashAlgo;
		this.JWToken = JWToken;
		this.owner = owner;
		let url: string = '';
		if (network == 'Mainnet')
			url = 'https://api.mainnet-beta.solana.com';
		else if (network == 'Testnet')
			url = 'https://api.testnet.solana.com';
		else if (network == 'Devnet')
			url = 'https://api.devnet.solana.com';
		this.connection = new Connection(url, 'confirmed');
	}
	/// UTILS

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
	public hashObject(obj: string): string {
		const hash = createHash(this.hashAlgo);
		hash.update(obj);
		return hash.digest('hex');
	}
	// Blockchain only

	/**
	*  Creates a transaction instruction to create an associated token account for the owner.
	* @param {Signer} payer - The signer who will pay for the transaction.
	* @returns {Promise<TransactionInstruction>} - A transaction instruction to create the associated token account.
	* @throws {Error} - If the mint creation fails or if the associated token account cannot be created.
	*/
	private async createIntruction(payer: Signer): Promise<TransactionInstruction> {
		const mint = await createMint(this.connection, payer, this.mintAuthority, null, 0);
		const associatedTokenAccount = await getAssociatedTokenAddress(
			mint,
			this.owner,
			false,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		);
		const ataInstruction = createAssociatedTokenAccountInstruction(
			payer.publicKey,
			associatedTokenAccount,
			this.owner,
			mint,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		);
		return ataInstruction;
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
		ataInstruction: TransactionInstruction,
		memo: string
	): Promise<string> {
		const memoInstruction = createMemoInstruction(memo, [payer.publicKey]);
		const transaction = new Transaction()
			.add(ataInstruction)
			.add(memoInstruction);

		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = payer.publicKey;

		return await sendAndConfirmTransaction(this.connection, transaction, [payer], {
			skipPreflight: false,
			commitment: 'confirmed',
		});
	}
	// DATABASE

	/**
	*  Creates a new product in the database.
	* @param {string} ProductId - The ID of the product to create.
	* @param {object} info - The metadata information for the product.
	* @returns {Promise<void>} - A promise that resolves when the product is created.
	* @throws {Error} - If a product with the given ID already exists.
	*/
	public async createProduct(ProductId: string, info: object): Promise<void> {
		const existingProduct = await this.prisma.product.findUnique({
			where: { id: ProductId },
		});
		if (existingProduct) {
			throw new Error(`Product with ID ${ProductId} already exists.`);
		}
		await this.prisma.product.create({
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
	public async getMetadataFromId(ProductId: string): Promise<string> {
		const product = await this.prisma.product.findUnique({
			where: { id: ProductId },
		});
		if (!product) {
			throw new Error(`Product with ID ${ProductId} not found.`);
		}
		return JSON.stringify(product.info);
	}

	/**
	*  Sets the signature for a product based on its ID.
	* @param {string} ProductId - The ID of the product to set the signature for.
	* @param {string} signature - The signature to set for the product.
	* @returns {Promise<void>} - A promise that resolves when the signature is set.
	* @throws {Error} - If the product with the given ID does not exist or if a signature already exists for that product.
	*/
	public async SetSignatureFromId(ProductId: string, signature: string): Promise<void> {
		const product = await this.prisma.product.findUnique({
			where: { id: ProductId },
		});
		if (!product) {
			throw new Error(`Product with ID ${ProductId} not found.`);
		}
		if (product.signature) {
			throw new Error(`Signature already exists for Product ID ${ProductId}.`);
		}
		await this.prisma.product.update({
			where: { id: ProductId },
			data: { signature: signature },
		});
	}

	/**
	*  Retrieves the memo associated with a given product signature.
	* @param {string} ProductId - The ID of the product to retrieve the memo for.
	* @returns {Promise<string | null>} - The memo associated with the product signature, or null if not found.
	* @throws {Error} - If the product with the given ID does not exist.
	*/
	public async getSignatureFromId(ProductId: string): Promise<string | null> {
		const product = await this.prisma.product.findUnique({
			where: { id: ProductId },
			select: { signature: true },
		});
		if (!product) {
			throw new Error(`Product with ID ${ProductId} not found.`);
		}
		return product.signature || null;
	}

	/**
	*  Retrieves the memo associated with a given product signature.
	* @param {string} ProductId - The ID of the product to retrieve the memo for.
	* @returns {Promise<string | null>} - The memo associated with the product signature, or null if not found.
	* @throws {Error} - If the product with the given ID does not exist or if no memo is found.
	*/
	public async getMetadataFromIdArray(ProductIdArray: string[]): Promise<object[]> {
		const products = await this.prisma.product.findMany({
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

	// OTHER

	/**
	* Creates a token for a given Product ID.
	* @param ProductId - The ID of the product to create a token for.
	* @returns The signature of the transaction that created the token.
	* @throws Will throw an error if a token has already been created for the given Product ID or if the transaction fails.
	*/
	public async createToken(ProductId: string): Promise<string> {

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
	public async UpdateTokenfromSignature(ProductId: string): Promise<string> {

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
		if (memoData.hash !== newhashData) {
			memoData.hash = newhashData;
			memoData.updatedAt = new Date().toISOString();
			if (!memoData.lastUpdate) {
				memoData.lastUpdate = [];
			}
			memoData.lastUpdate.push(signature);
		}
		else {
			throw new Error("No update needed, hash is the same.");
		}
		let payer: Keypair = await this.getPayer();

		const ataInstruction = await this.createIntruction(payer)
		const memodata = JSON.stringify({
			hash: memoData.hash,
			updatedAt: memoData.updatedAt,
			lastUpdate: memoData.lastUpdate || [],
		});
		try {
			const signature = await this.sendTransactionWithMemo(payer, ataInstruction, memodata);
			this.SetSignatureFromId(signature, ProductId);
			return signature;
		} catch (error) {
			throw new Error('Transaction failed:' + error);
		}
	}

	// public async batchMint(ProductIdArray: string[]): Promise<string[]> {
	// 	const ProductDataArray: object[] = await this.getMetadataFromIdArray(ProductIdArray);
	// 	const signatures: string[] = [];
	// 	for (const Product of ProductDataArray) {
	// 		try {
	// 			const sortedEntries = Object.entries(Product).sort(([keyA], [keyB]) =>
	// 				keyA.localeCompare(keyB));
	// 			const sortedJson = Object.fromEntries(sortedEntries);
	// 			const sortedJsonString = JSON.stringify(sortedJson, null, 2);
	// 			if (!this.checkifSignatureExist(Product)) {
	// 				const signature = await this.createToken(sortedJsonString);
	// 				signatures.push(signature);
	// 			}
	// 			else {
	// 				const signature = await this.UpdateTokenfromSignature(sortedJsonString);
	// 				signatures.push(signature);
	// 			}
	// 		} catch (error) {
	// 			console.error(`Failed to mint token for Product ID ${Product}:`, error);
	// 		}
	// 	}
	// 	return signatures;
	// }

    /**
	* Checks if the instruction is a parsed instruction.
	* @param instruction - The instruction to check.
	* @returns True if the instruction is a parsed instruction, false otherwise.
	*/
	public isParsedInstruction(instruction: ParsedInstruction | PartiallyDecodedInstruction): instruction is ParsedInstruction {
		return (instruction as ParsedInstruction).parsed !== undefined;
	}

	/**
	* Retrieves the memo from a transaction signature.
	* @param IdProduct - The ID of the product to retrieve the memo for.
	* @returns The memo associated with the product ID.
	* @throws Will throw an error if no signature is found for the product ID or if the memo is not found in the transaction.
	*/
	public async getMemoFromSignature(IdProduct: string): Promise<string> {
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
	* Checks if the product is valid on the blockchain by verifying the hash in the memo against the metadata.
	* @param ProductId - The ID of the product to check.
	* @returns An object indicating whether the product is valid and, if not, the reason for its invalidity.
	*/
	public async CheckOnBlockChain(ProductId: string): Promise<{ valid: boolean, reason?: string }> {
		const metadata: string = await (this.getMetadataFromId(ProductId))
		const hash = this.hashObject(metadata);
		const memo = await this.getMemoFromSignature(ProductId);
		const memoData = SignatureSchema.parse(JSON.parse(memo));
		if (memoData.hash !== hash) {
			return { valid: false, reason: "Hash mismatch" };
		}
		return { valid: true };
	}
};

const sdk = new SafeoutSDK('Devnet',
	'sha256',
	"eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJjb21wYW55Ijp7ImlkIjoic2FmZW91dCIsImltYWdlVXJsIjpudWxsLCJjcmVhdGVkQXQiOiIyMDI1LTA2LTE2VDExOjA1OjMzLjk2NFoiLCJ1cGRhdGVkQXQiOiIyMDI1LTA2LTE2VDExOjA1OjMzLjk2NFoiLCJuYW1lIjoiU2FmZW91dCIsImNyZWRpdHMiOjAsInN1YmRvbWFpbiI6bnVsbCwidXNlcnMiOltdLCJyZWdpc3RyYXRpb25OdW1iZXIiOm51bGwsInRheElkIjpudWxsLCJjb21wYW55VHlwZSI6bnVsbCwiaW5kdXN0cnkiOm51bGwsInNvY2lhbE5ldHdvcmtzIjpudWxsLCJ0ZW1wbGF0ZSI6bnVsbCwid2hpdGVsYWJlbENvbmZpZyI6bnVsbCwid2hpbGFiZWxDb25maWciOm51bGwsInNlY3VyZU1vZGUiOmZhbHNlLCJzdGF0ZVNlY3VyaXR5IjpmYWxzZX0sImlhdCI6MTc1MDA3ODgzNywiZXhwIjoxNzUwMTY1MjM3fQ.DMqyQTTD5kO2zgKJuM4sO9UhXTiEvubkW0Wg6cby5t8vA5nt35PFcju3bho3tRTuv1nk4WO5MwRi8i-ZnCPe-uaGvAUAxhD6Kgd_rOURCpagOIoEkQjDeDPjtTVvF4ckhIY6xSRYqGujf_-9iiEie8LggRyGwB4k_tXk1nmdvrlcWJizAvcjaXjTPl6na-XuDzzkdjwfKaX1PYtyFOmqJcshvX87ldy8Iih55aKDjAUPfVrmnICSvk8kvmyUDx0pgUVJQ6s9HtIgLk_A_OsBj-EZRA_kqoZOvj2wUKgFUR-r86duIGIrful0w1dnHfh7OhDlLJYN0rpS_iQTNFlpGOkDg1Y4IaooIWsxMN5y6meT9ICl0dsg-BAJ0HDHDCTagEQnAHl6NlRLKEjQtECl8d2Zgp1jxH9S7LJaMjU8ElVTCllC2vwvEb_kncZmQYwtOpmJtDe7NP33pXRnT6K5TXZX0sB9VGNa6mlesMq703Zfq2T5xIpbVhPVXAv_trft0acxUE8-t-GWqaVot1JkJeC6AIU_vVzQFjiHz-N_qV3Wi9cZUfONxOBV_qJH7VCAZKbN6MJbrVAUTZlsXDf7ukefKdYeRR4Zt3cvu9Sfaz42TVONAGuj0KQG6Y4UV_2m6BkXLvHHgnUtoTFy41_UJfPmQkKp9_Oxs8cl55CNce0",
	new PublicKey('4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1'),
	new PublicKey('9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ'))

import readline from 'node:readline';
async function main() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	rl.question('check or create or update token or batch ?\n', async (answer: string) => {
		switch (answer.toLowerCase()) {
			case 'check':
				console.log(await sdk.CheckOnBlockChain('abb9a98e-55f8-466e-81ee-248d41114658'));
				break;
			case 'create':
				await sdk.createToken('abb9a98e-55f8-466e-81ee-248d41114658')
				break;
			case 'update':
				await sdk.UpdateTokenfromSignature('abb9a98e-55f8-466e-81ee-248d41114658');
				break;
			case 'cc':
				await sdk.createProduct('abb9a98e-55f8-466e-81ee-248d41114658', {
					name: 'Test Product',
					description: 'This is a test product',
				});
				break;
			// case 'batch':
			// 	await sdk.batchMint(['abb9a98e-55f8-466e-81ee-248d41114658', 'afdsqfd98e-55f8-466e-81ee-248d41114659'])
			default:
				console.log('Invalid answer!');
		}
		rl.close();
	}
	)
};

main()