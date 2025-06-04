import { createMint, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Connection, Keypair, ParsedInstruction, PartiallyDecodedInstruction, PublicKey, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createHash } from 'crypto';
import { createMemoInstruction } from '@solana/spl-memo';
import { getPayerKeypair } from './lib/solanaUtils';
import { getBalances } from './get_balance';
import { ChipMetadata } from './schema/metadata';
import { request } from 'https';
import fetch from 'node-fetch';


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
type networkValue = 'Mainnet' | 'Testnet' | 'Devnet';

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

	/**
	 * Create class for Solana-Mint-SDK
	 *
	 * @param networkValue - network you want to use Devnet / Testnet / Mainnet
	 * @param hashAlgo - The Algorim for the hash function (sha256 ...)
	 * @param mintAuthority - The Publickey for your Mint
	 * @param owner - The owner PublicKey
	 * @param options - Options object for all API route
	 */
	constructor(
		network: networkValue,
		hashAlgo: string,
		mintAuthority: PublicKey,
		owner: PublicKey,
		options: SafeoutSDKOptions = {}
	) {
		this.mintAuthority = mintAuthority;
		this.hashAlgo = hashAlgo;
		this.owner = owner;
		let url: string = '';
		this.getProducts = options.getProducts || 'http://localhost:4000/RestApi/get/';
		this.newProduct = options.newProduct || 'http://localhost:4000/RestApi/new';
		this.updateProduct = options.updateProduct || 'http://localhost:4000/RestApi/update';
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

	public getMintAuthority(): PublicKey {
		return this.mintAuthority;
	}

	public gethashAlgo(): string {
		return this.hashAlgo;
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
			getPayerkeypair: this.getPayerKeypair!,
		};
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
	* then hashed using the algorithm specified by `gethashAlgo()` (e.g., 'sha256').
	* 
	* @param obj - The metadata object to hash.
	* @returns A hexadecimal string representing the hash of the metadata.
	*/
	public hashObject(obj: ChipMetadata): string {
		const json = this.stableStringify(obj);
		const hash = createHash(this.gethashAlgo());
		hash.update(json);
		return hash.digest('hex');
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
	* @param privateMetadata - The metadata to hash and embed in the transaction memo.
	* @returns A string containing the transaction signature.
	* @throws If the transaction fails, it throws an error with details.
	*/
	public async createToken(privateMetadata: ChipMetadata): Promise<string> {

		let payer: Keypair;
		if (this.getEndpoints().getPayerKeypair == null)
			payer = await getPayerKeypair();
		else
			payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(request(this.getEndpoints().getPayerKeypair).toString())));
		const mint = await createMint(this.connection, payer, this.mintAuthority, null, 0);
		console.log('Token created with mint:', mint.toBase58());

		const associatedTokenAccount = await getAssociatedTokenAddress(
			mint,
			this.owner,
			false, // Voir PDA
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		);
		console.log('Associated token account:', associatedTokenAccount.toBase58());
		const hashData = this.hashObject(privateMetadata);
		console.log('Hash of private metadata:', hashData);

		const ataInstruction = createAssociatedTokenAccountInstruction(
			payer.publicKey,
			associatedTokenAccount,
			this.owner,
			mint,
			TOKEN_PROGRAM_ID,
			ASSOCIATED_TOKEN_PROGRAM_ID
		);

		const memoInstruction = createMemoInstruction(hashData, [payer.publicKey]); // Public / Owner / Brand TODO

		const transaction = new Transaction()
			.add(ataInstruction)
			.add(memoInstruction);
		const latestBlockhash = await this.connection.getLatestBlockhash('confirmed');
		transaction.recentBlockhash = latestBlockhash.blockhash;
		transaction.feePayer = payer.publicKey;
		try {
			const signature = await sendAndConfirmTransaction(this.connection, transaction, [payer], {
				skipPreflight: false,
				commitment: 'confirmed',
			});
			console.log('Transaction successful! Signature:', signature);

			return signature;
		} catch (error) {
			throw ('Transaction failed:' + error);
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
	* @param signature - The signature of the transaction.
	* @returns The memo string stored in the transaction.
	* @throws If the transaction is not found or does not contain a memo instruction.
	*/
	public async getMemoFromSignature(signature: string): Promise<string> {
		const tx = await this.connection.getParsedTransaction(signature, {
			commitment: "confirmed",
		});

		if (!tx) {
			throw ("Transaction not found.")
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
		throw ("Memo Not found");
	}

	public async getMetadataFromId(ProductId: string): Promise<ChipMetadata> {
		let Data:ChipMetadata;

		const response = await fetch(this.getProducts + ProductId);
		if (response.status != 200)
			throw new Error("Error get Metadata");
		let data = await response.json()
		Data = {
		name: data.product.name,
		description: data.product.attributes.description.value,
		isStolen: false,
		extraInfo: "",
		owner: new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ"),
		};
		return (Data)
	}
};

async function check() {
	const sdk = new SafeoutSDK('Devnet',
		'sha256',
		new PublicKey('4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1'),
		new PublicKey('9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ'))
	const metadata: ChipMetadata = await (sdk.getMetadataFromId('abb9a98e-55f8-466e-81ee-248d41114658'))
	const hash = sdk.hashObject(metadata).toString();
	try {
		let signature = await sdk.createToken(metadata)
		let memo = await sdk.getMemoFromSignature(signature);
		if (memo == hash)
			console.log("Valided by blockchain");
		else
			console.log("hash didnt match");
	}
	catch (error) {
		console.error(error);
	}
}
async function test() {
	const sdk = new SafeoutSDK('Devnet',
		'sha256',
		new PublicKey('4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1'),
		new PublicKey('9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ'))
	console.log(await sdk.getMetadataFromId('abb9a98e-55f8-466e-81ee-248d41114658'));
}
// check()
test()