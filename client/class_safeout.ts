import { createMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, ParsedInstruction, PartiallyDecodedInstruction, PublicKey, Transaction, sendAndConfirmTransaction, Signer, TransactionInstruction } from '@solana/web3.js';

import { createHash } from 'crypto';
import { createMemoInstruction, MEMO_PROGRAM_ID } from '@solana/spl-memo';
import { getPayerKeypair } from './lib/solanaUtils';
import { ChipMetadata } from './schema/metadata';
import { request } from 'https';
import fetch from 'node-fetch';
import z from 'zod';


/**
* Interface for Solana-Mint-SDK for route.
* If you don't have API just don't create the SDK whit options and its will use Safeout API
*
* @param getProducts - Route API for get Product value on your database (ChipMetadata)
* @param newProduct - Route API for create a new Product on your database
* @param updateProduct -  Route API for update a Product on your database
* @param deleteProduct - Route API for delete a Product on your database
* @param getPayerKeypair - Route API for get your Payerkeypair if not provide it take ./keypair.json
*/
export interface SafeoutSDKOptions {
	getProducts?: string;
	newProduct?: string;
	updateProduct?: string;
	deleteProduct?: string;
	getPayerKeypair?: string | null;
}

/**
* Type for network values used in the SDK.
* This type defines the possible networks that can be used with the SDK.
* It includes 'Mainnet', 'Testnet', and 'Devnet'.
*/
type NetworkValue = 'Mainnet' | 'Testnet' | 'Devnet';

/**
* Schema for validating ISO date strings.
*
* This schema checks if a string is a valid ISO date format.
* It uses the `zod` library to ensure that the date can be parsed correctly.
* If the date is invalid, it throws an error with a custom message.
*/
const isoDateString = z.string().refine(val => !isNaN(Date.parse(val)), {
	message: "Must be a valid ISO date string",
});

/**
* Schema for validating a signature object.
*
* This schema requires a `hash` string, an `updatedAt` ISO date string,
* and an optional `lastUpdate` array of strings.
* The `hash` must be a non-empty string, and `updatedAt` must be a valid ISO date.
* The `lastUpdate` is optional and can be an array of non-empty strings.
*/
const signatureString = z.string().min(1, "Signature must be a non-empty string");

/**
* Schema for validating a signature object.
*
* This schema requires a `hash` string, an `updatedAt` ISO date string,
* and an optional `lastUpdate` array of strings.
* The `hash` must be a non-empty string, and `updatedAt` must be a valid ISO date.
* The `lastUpdate` is optional and can be an array of non-empty strings.
*/
const SignatureSchema = z.object({
	hash: z.string().min(1, "Hash is required"),
	updatedAt: isoDateString,
	lastUpdate: z.array(signatureString).optional(), // facultatif au premier enregistrement
});

/**
* Class representing the Safeout SDK.
*
* This class provides methods to interact with the Safeout API and the Solana blockchain.
* It allows you to create, update, and check products on the blockchain,
* as well as manage token mints and associated token accounts.
*
* @class SafeoutSDK
* @param network - The network to use (Mainnet, Testnet, or Devnet).
* @param hashAlgo - The algorithm to use for hashing (e.g., 'sha256').
* @param JWToken - The JSON Web Token for authentication with the Safeout API.
* @param mintAuthority - The public key of the mint authority.
* @param owner - The public key of the owner of the tokens.
* @param options - Optional parameters for API endpoints.
* @property {PublicKey} mintAuthority - The public key of the mint authority.
* @property {PublicKey} owner - The public key of the owner of the tokens.
* @property {string} hashAlgo - The algorithm used for hashing.
* @property {string} getProducts - The API endpoint for getting products.
* @property {string} newProduct - The API endpoint for creating a new product.
* @property {string} updateProduct - The API endpoint for updating a product.
* @property {string} deleteProduct - The API endpoint for deleting a product.
* @property {string | null} getPayerKeypair - The API endpoint for getting the payer keypair, or null if not provided.
* @property {Connection} connection - The Solana connection object.
* @property {string} JWToken - The JSON Web Token for authentication with the Safeout API.
* @example
* const sdk = new SafeoutSDK('Devnet', 'sha256', 'your-jwt-token', new PublicKey('your-mint-authority'), new PublicKey('your-owner-public-key'), {
*   getProducts: 'http://website.com/API/get/',
*   newProduct: 'http://website.com/API/new',
*   updateProduct: 'http://website.com/API/update/',
*   deleteProduct: 'http://website.com/API/delete/',
*   getPayerKeypair: 'http://website.com/API/getPayerKeypair',
* });
*/
export class SafeoutSDK {
	private mintAuthority: PublicKey;
	private owner: PublicKey;
	private hashAlgo: string;

	private getProducts: string;
	private newProduct: string;
	private updateProduct: string;
	private deleteProduct: string;
	private getPayerKeypair: string | null;
	private connection: Connection;
	private JWToken: string;
	/**
	 * Create class for Solana-Mint-SDK
	 *
	 * @param networkValue - network you want to use Devnet / Testnet / Mainnet
	 * @param hashAlgo - The Algorim for the hash function (sha256 ...)
	 * @param mintAuthority - The Publickey for your Mint
	 * @param owner - The owner PublicKey
	 * @param options - Options object for all API route (optionnal)
	 */
	constructor(
		network: NetworkValue,
		hashAlgo: string,
		JWToken: string,
		mintAuthority: PublicKey,
		owner: PublicKey,
		options: SafeoutSDKOptions = {}
	) {
		this.mintAuthority = mintAuthority;
		this.hashAlgo = hashAlgo;
		this.JWToken = JWToken;
		this.owner = owner;
		let url: string = '';
		this.getProducts = options.getProducts || 'http://localhost:4000/RestApi/get/';
		this.newProduct = options.newProduct || 'http://localhost:4000/RestApi/new';
		this.updateProduct = options.updateProduct || 'http://localhost:4000/RestApi/update/';
		this.deleteProduct = options.deleteProduct || 'http://localhost:4000/RestApi/delete/';
		this.getPayerKeypair = options.getPayerKeypair || null;
		if (network == 'Mainnet')
			url = 'https://api.mainnet-beta.solana.com';
		else if (network == 'Testnet')
			url = 'https://api.testnet.solana.com';
		else if (network == 'Devnet')
			url = 'https://api.devnet.solana.com';
		this.connection = new Connection(url, 'confirmed');
	}

	/**
	* Retrieves the payer keypair from the specified API endpoint or local file.
	*
	* If `this.getPayerKeypair` is provided, it fetches the keypair from that URL.
	* If not provided, it defaults to using the `getPayerKeypair` function to read from a local file.
	*
	* @returns A Promise that resolves to a Keypair object representing the payer's keypair.
	* @throws If the request fails or the response cannot be parsed as a Keypair.
	*/
	private async getPayer(): Promise<Keypair> {
		if (!this.getPayerKeypair) {
			return await getPayerKeypair();
		}

		const response = await request(this.getPayerKeypair);
		return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(response.toString())));
	}

	/**
	* Converts a ChipMetadata object into a stable, deterministic JSON string.
	* 
	* The object keys are sorted alphabetically to ensure consistent output regardless of key order.
	* If any value is a `PublicKey`, it is automatically converted to its base58 string representation.
	* 
	* This is useful when consistent string output is required, e.g., for hashing.
	* 
	* @param obj - The metadata object to stringify.
	* @returns A stable JSON string representation of the object.
	*/
	public stableStringify(obj: ChipMetadata): string {
		const allKeys = Object.keys(obj).sort();
		const sortedObj: Record<string, unknown> = {};

		for (const key of allKeys) {
			const value = obj[key as keyof ChipMetadata];
			sortedObj[key] = value instanceof PublicKey ? value.toBase58() : value;
		}

		return JSON.stringify(sortedObj);
	}

	/**
	* Generates a SHA hash from a ChipMetadata object.
	* 
	* The metadata is first converted into a stable JSON string (sorted keys, `PublicKey`s serialized),
	* then hashed using the algorithm specified by `this.hashAlgo` (e.g., 'sha256').
	* 
	* @param obj - The metadata object to hash.
	* @returns A hexadecimal string representing the hash of the metadata.
	*/
	public hashObject(obj: ChipMetadata): string {
		const json = this.stableStringify(obj);
		const hash = createHash(this.hashAlgo);
		hash.update(json);
		return hash.digest('hex');
	}

	/**
	* Set the signature of the transaction in the product data in data base
	* 
	* Apply a PATCH throw the API
	* 
	* @param privateMetadata - The object you want to update.
	* @param signature - The Signature of the transaction
	*/
	public async Setsignature(privateMetadata: ChipMetadata, signature: string) {
		const updates = { "signature": signature };

		const response = await fetch(this.updateProduct + privateMetadata.id, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': 'Bearer ' + this.JWToken
			},
			body: JSON.stringify(updates),
		});
		if (response.status !== 200) {
			const data = await response.json() as { message: string };;
			console.error(response.status + " " + response.statusText + " " + data.message);
			throw new Error("Update object for signature failed");
		}
	}

	/**
	* Creates a transaction instruction to create an associated token account for the owner.
	*
	* This method generates a new mint, creates an associated token account for the owner,
	* and returns a transaction instruction that can be used to execute this operation.
	*
	* @param payer - The Signer who will pay for the transaction and sign it.
	* @returns A Promise that resolves to a TransactionInstruction for creating the associated token account.
	* @throws If the mint creation fails, it throws an error with details.
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
	* Sends a transaction to create an associated token account and attach a memo.
	*
	* This method constructs a transaction that includes an instruction to create an associated token account
	* and a memo instruction containing the provided memo string.
	*
	* @param payer - The Keypair of the payer who will sign and pay for the transaction.
	* @param ataInstruction - The instruction to create the associated token account.
	* @param memo - The memo string to be included in the transaction.
	* @returns A promise that resolves to the transaction signature.
	* @throws If the transaction fails, it throws an error with details.
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


	/**
	* Creates a new token mint and associated token account, then stores a hash of the provided metadata using a memo instruction.
	* 
	* The function:
	*  - Creates a new SPL token mint.
	*  - Creates an associated token account (ATA) for the owner.
	*  - Hashes the provided private metadata and stores it on-chain in a memo.
	* 
	* This is useful for securely attaching off-chain metadata to an on-chain token without revealing the data itself.
	* 
	* @param Product - The Product ID you want to hash and embed in the transaction memo.
	* @returns A string containing the transaction signature.
	* @throws If the transaction fails, it throws an error with details.
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
			this.Setsignature(privateMetadata, signature);
			return signature;
		} catch (error) {
			throw new Error('Transaction failed:' + error);
		}
	}

	/**
	* Updates the token's memo with the latest metadata hash and transaction signature.
	*
	* This function retrieves the memo associated with a product ID, updates it with the latest metadata hash,
	* and sends a new transaction to the Solana blockchain to update the memo.
	*
	* @param ProductId - The ID of the product for which the token memo is being updated.
	* @returns A promise that resolves to the transaction signature of the update.
	* @throws If no memo or signature is found for the given Product ID, or if the transaction fails.
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
			memoData.lastUpdate.push(memoData.hash);
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
			this.Setsignature(await this.getMetadataFromId(ProductId), signature);
			return signature;
		} catch (error) {
			throw new Error('Transaction failed:' + error);
		}
	}

	/**
	* Type guard to check whether an instruction is a `ParsedInstruction`.
	* 
	* This helps safely access the `parsed` field in transactions.
	* 
	* @param instruction - The instruction to check.
	* @returns `true` if the instruction is a `ParsedInstruction`, otherwise `false`.
	*/
	public isParsedInstruction(instruction: ParsedInstruction | PartiallyDecodedInstruction): instruction is ParsedInstruction {
		return (instruction as ParsedInstruction).parsed !== undefined;
	}

	/**
	* Extracts the memo from a transaction given its signature.
	* 
	* Searches through the instructions in a parsed transaction and returns the content of the memo.
	* 
	* @param IdProduct - The product Id you want the Memo.
	* @returns The memo string stored in the transaction.
	* @throws If the transaction is not found or does not contain a memo instruction.
	*/
	public async getMemoFromSignature(IdProduct: string): Promise<string> {
		let signature = await this.getSignatureFromId(IdProduct);
		if (!signature)
			throw new Error("No signature for" + IdProduct);
		const tx = await this.connection.getParsedTransaction(signature, {
			commitment: "confirmed",
		});

		if (!tx) {
			throw new Error("Transaction not found.")
		}

		const memopublicKey = MEMO_PROGRAM_ID;

		for (const inner of tx.transaction.message.instructions) {
			if (inner.programId.equals(memopublicKey)) {
				if (this.isParsedInstruction(inner)) {
					return inner.parsed;
				}
			}
		}
		throw new Error("Memo Not found");
	}

	/**
	* Verifies if a product's metadata matches the hash stored on the blockchain.
	* 
	* Retrieves the metadata of a product using its ID, generates a hash from this metadata,
	* and compares it with the memo field stored on-chain (retrieved using the product's signature).
	* 
	* @param ProductId - The ID of the product to verify on the blockchain.
	* @returns A promise that resolves to a string indicating whether the data is valid or not.
	* @throws If fetching metadata or the memo fails internally.
	*/
	public async CheckOnBlockChain(ProductId: string): Promise<{ valid: boolean, reason?: string }> {
		const metadata: ChipMetadata = await (this.getMetadataFromId(ProductId))
		const hash = this.hashObject(metadata).toString();
		let memo = await this.getMemoFromSignature(ProductId);
		let memoData = SignatureSchema.parse(JSON.parse(memo));
		if (memoData.hash !== hash) {
			return { valid: false, reason: "Hash mismatch" };
		}

		return { valid: true };
	}

	/**
	* Retrieves the transaction signature associated with a given product ID.
	* 
	* Sends a request to the product endpoint and extracts the transaction signature
	* from the response data.
	* 
	* @param ProductId - The ID of the product to retrieve the signature for.
	* @returns A promise that resolves to the transaction signature string.
	* @throws If the HTTP request fails or the response status is not 200.
	*/
	public async getSignatureFromId(ProductId: string): Promise<string | null> {
		let signature;

		const response = await fetch(this.getProducts + ProductId, {
			headers: {
				'Authorization': 'Bearer ' + this.JWToken,
			}
		});
		if (response.status != 200)
			throw new Error("Error get Metadata");
		let data: any = await response.json();
		try {
			signature = data.product.additionalInfo.signature.value;
			return (signature);
		}
		catch (error) {
			return (null)
		}
	}

	/**
	* Retrieves the chip metadata associated with a given product ID.
	* 
	* Fetches the product data and constructs a ChipMetadata object based on the response.
	* Useful for displaying product information such as name, description, and default ownership.
	* 
	* @param ProductId - The ID of the product to retrieve metadata for.
	* @returns A promise that resolves to a ChipMetadata object containing the product's details.
	* @throws If the HTTP request fails or the response status is not 200.
	*/
	public async getMetadataFromId(ProductId: string): Promise<ChipMetadata> {
		let Data: ChipMetadata;

		const response = await fetch(this.getProducts + ProductId, {
			headers: {
				'Authorization': 'Bearer ' + this.JWToken,
			}
		});
		if (response.status != 200)
			throw new Error("Error get Metadata");
		let data: any = await response.json()
		Data = {
			id: ProductId,
			name: data.product.name,
			description: data.product.attributes.description.value,
			isStolen: false,
			extraInfo: "",
			owner: new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ"),
		};
		return (Data)
	}
};

const sdk = new SafeoutSDK('Devnet',
	'sha256',
	"JWTOKEN",
	new PublicKey('4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1'),
	new PublicKey('9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ'))

import readline from 'node:readline';
async function main() {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});
	rl.question('check or create or update token ?\n', async (answer: string) => {
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
			default:
				console.log('Invalid answer!');
		}
		rl.close();
	}
	)
};

main()