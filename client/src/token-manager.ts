import {
  Connection,
  Keypair,
  ParsedInstruction,
  PartiallyDecodedInstruction,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  Signer,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createMemoInstruction, MEMO_PROGRAM_ID } from "@solana/spl-memo";
import { createHash } from "crypto";
import Bottleneck from "bottleneck";
import { getPayerKeypair } from "../lib/solanaUtils";
import { SignatureSchema, MintResult } from './types';
import { PrismaClient } from "@prisma/client";

export class TokenManager {
  private connection: Connection;
  private mint: PublicKey;
  private owner: PublicKey;
  private hashAlgo: string;
  private prisma: PrismaClient;

  constructor(
    connection: Connection, 
    mint: PublicKey, 
    owner: PublicKey, 
    hashAlgo: string,
    prisma: PrismaClient
  ) {
    this.connection = connection;
    this.mint = mint;
    this.owner = owner;
    this.hashAlgo = hashAlgo;
    this.prisma = prisma;
  }

  /**
   * Mint a token for a newly‑created product.
   * @throws Error if a signature already exists for the product.
   */
  async createMintToken(
    productId: string
  ): Promise<{ signature: string; hash: string }> {
    const payer = await this.getPayer();
    const metadata = await this.getMetadataFromId(productId);

    if (await this.getSignatureFromId(productId)) {
      throw new Error(`Token already created for product ID ${productId}`);
    }

    const hashData = this.hashObject(metadata);
    const ataInstruction = await this.createInstruction(payer);
    const memoPayload = JSON.stringify({
      hash: hashData,
    });
    try {
      const signature = await this.sendTransactionWithMemo(
        payer,
        ataInstruction,
        memoPayload
      );
      await this.setSignatureFromId(productId, signature);
      return { signature, hash: hashData };
    } catch (err) {
      throw new Error(`Transaction failed: ${err}`);
    }
  }

  /**
   * Update mint token for existing product
   */
  async updateMintToken(
    productUid: string
  ): Promise<{ signature: string; hash: string }> {
    const existingMemo = await this.getMemoFromSignature(productUid);
    if (!existingMemo)
      throw new Error("No memo found for the given product UID.");

    const currentSignature = await this.getSignatureFromId(productUid);
    if (!currentSignature)
      throw new Error("No signature found for the given product UID.");

    const memoData = SignatureSchema.parse(JSON.parse(existingMemo));
    const metadata = await this.getMetadataFromId(productUid);
    const newHash = this.hashObject(metadata);

    if (memoData.hash === newHash)
      throw new Error("Metadata has not changed; no update needed.");

    memoData.hash = newHash;

    const payer = await this.getPayer();
    const ataInstruction = await this.createInstruction(payer);
    const memoPayload = JSON.stringify({
      hash: memoData.hash,
    });

    try {
      const newSignature = await this.sendTransactionWithMemo(
        payer,
        ataInstruction,
        memoPayload
      );
      await this.setSignatureFromId(productUid, newSignature);
      return { signature: newSignature, hash: memoData.hash };
    } catch (err) {
      throw new Error(`Transaction failed: ${err}`);
    }
  }

  /**
   * Mint or update tokens for several products concurrently, preserving order.
   * @param productIds  Array of product UIDs.
   * @param concurrency Maximum parallel jobs handled by Bottleneck.
   */
  async batchMintToken(
    productIds: string[],
    concurrency = 10
  ): Promise<MintResult[]> {
    const metadataArray = await this.getMetadataFromIdArray(productIds);
    
    const limiter = new Bottleneck({
      maxConcurrent: concurrency,
      minTime: 100,
      reservoir: 20,
      reservoirRefreshAmount: 20,
      reservoirRefreshInterval: 10 * 100,
    });
    const results: (MintResult | undefined)[] = new Array(productIds.length);

    const tasks = productIds.map((id, idx) =>
      limiter.schedule(async () => {
        try {
          let signature: string, hash: string;
          if (!(await this.checkSignatureById(id))) {
            ({ signature, hash } = await this.createMintToken(id));
          } else {
            ({ signature, hash } = await this.updateMintToken(id));
          }

          results[idx] = { productUid: id, signature, hash };
        } catch (err: any) {
          console.error(
            `Error on product ${id} (${idx + 1}/${productIds.length}):`,
            err?.message ?? err
          );
        }
      })
    );

    await Promise.all(tasks);
    return results.filter(Boolean) as MintResult[];
  }

  /**
   * Check authenticity on blockchain
   */
  async checkAuthenticityOnBlockchain(
    productId: string
  ): Promise<{ isValid: boolean; reason?: string }> {
    const metadata = await this.getMetadataFromId(productId);
    const localHash = this.hashObject(metadata);
    const memo = await this.getMemoFromSignature(productId);
    const memoData = SignatureSchema.parse(JSON.parse(memo));

    if (memoData.hash !== localHash)
      return { isValid: false, reason: "Hash mismatch" };
    return { isValid: true };
  }

  /** Hash arbitrary JSON using the configured algorithm */
  private hashObject(obj: string): string {
    return createHash(this.hashAlgo).update(obj).digest("hex");
  }

  /**
   * Get the signature for a product by its ID.
   * @returns Payer Keypair for transaction fees
   * @throws Error if unable to get payer keypair
   */
  private async getPayer(): Promise<Keypair> {
    return getPayerKeypair();
  }

  /**
   * Create instruction for associated token account
   */
  private async createInstruction(
    payer: Signer
  ): Promise<TransactionInstruction | null> {
    const ata = await getAssociatedTokenAddress(
      this.mint,
      this.owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    try {
      const info = await Promise.race([
        this.connection.getAccountInfo(ata, "confirmed"),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout getting account info")), 10000)
        )
      ]);
      
      if (info) {
        console.log(`ATA already exists for owner: ${this.owner.toString()}`);
        return null;
      }
    } catch (error) {
      console.warn(`Error checking ATA existence, proceeding with creation: ${error}`);
    }

    return createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      this.owner,
      this.mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }

  /**
   * Get metadata for a product by its ID.
   */
  private async getMetadataFromId(productId: string): Promise<string> {
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
      include: {
        manufacturer: true,
        materialComposition: true,
        hazardousSubstances: true,
      },
    });
    if (!product) throw new Error(`Product with ID ${productId} not found.`);

    const productData = {
      productId: product.id,
      productName: product.productName,
      manufacturer: {
        name: product.manufacturer.name,
        address: product.manufacturer.address,
        contactEmail: product.manufacturer.contactEmail,
      },
      dateOfManufacture: product.dateOfManufacture.toISOString().split('T')[0],
      placeOfManufacture: product.placeOfManufacture,
      productCategory: product.productCategory,
      materialComposition: product.materialComposition.map(mc => ({
        material: mc.material,
        percentage: mc.percentage,
      })),
      hazardousSubstances: product.hazardousSubstances.map(hs => ({
        substance: hs.substance,
        casNumber: hs.casNumber,
        concentration: hs.concentration,
      })),
      repairabilityScore: product.repairabilityScore,
      endOfLifeInstructions: product.endOfLifeInstructions,
      digitalLink: product.digitalLink,
    };

    return JSON.stringify(productData);
  }

  /**
   * Get metadata for multiple products by their IDs.
   */
  private async getMetadataFromIdArray(
    productIdArray: string[]
  ): Promise<object[]> {
    const products = await this.prisma.productDPP.findMany({
      where: { id: { in: productIdArray } },
      include: {
        manufacturer: true,
        materialComposition: true,
        hazardousSubstances: true,
      },
    });
    if (!products.length)
      throw new Error("No products found for the provided IDs.");

    return products.map(product => ({
      productId: product.id,
      productName: product.productName,
      manufacturer: {
        name: product.manufacturer.name,
        address: product.manufacturer.address,
        contactEmail: product.manufacturer.contactEmail,
      },
      dateOfManufacture: product.dateOfManufacture.toISOString().split('T')[0],
      placeOfManufacture: product.placeOfManufacture,
      productCategory: product.productCategory,
      materialComposition: product.materialComposition.map(mc => ({
        material: mc.material,
        percentage: mc.percentage,
      })),
      hazardousSubstances: product.hazardousSubstances.map(hs => ({
        substance: hs.substance,
        casNumber: hs.casNumber,
        concentration: hs.concentration,
      })),
      repairabilityScore: product.repairabilityScore,
      endOfLifeInstructions: product.endOfLifeInstructions,
      digitalLink: product.digitalLink,
    }));
  }

  /**
   * Get the memo from a product's signature.
   */
  private async getMemoFromSignature(productId: string): Promise<string> {
    const signature = await this.getSignatureFromId(productId);
    if (!signature) throw new Error(`No signature for ${productId}`);

    const tx = await this.connection.getParsedTransaction(signature, {
      commitment: "confirmed",
    });
    if (!tx) throw new Error("Transaction not found.");

    for (const ix of tx.transaction.message.instructions) {
      if (
        ix.programId.equals(MEMO_PROGRAM_ID) &&
        this.isParsedInstruction(ix)
      ) {
        return ix.parsed as unknown as string;
      }
    }
    throw new Error("Memo not found");
  }

  /**
   * Send a transaction with a memo instruction.
   */
  private async sendTransactionWithMemo(
    payer: Keypair,
    ataInstruction: TransactionInstruction | null,
    memo: string
  ): Promise<string> {
    const tx = new Transaction();
    if (ataInstruction) tx.add(ataInstruction);
    tx.add(createMemoInstruction(memo, [payer.publicKey]));

    const { blockhash } = await this.connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer.publicKey;

    return sendAndConfirmTransaction(this.connection, tx, [payer], {
      skipPreflight: false,
      commitment: "confirmed",
    });
  }

  /**
   * Get the signature for a product by its ID.
   */
  private async getSignatureFromId(productId: string): Promise<string | null> {
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
      select: { signature: true },
    });
    if (!product) throw new Error(`Product with ID ${productId} not found.`);
    return product.signature ?? null;
  }

  /**
   * Set the signature for a product by its ID.
   */
  private async setSignatureFromId(
    productId: string,
    signature: string
  ): Promise<void> {
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
    });
    if (!product) throw new Error(`Product with ID ${productId} not found.`);

    await this.prisma.productDPP.update({
      where: { id: productId },
      data: { signature },
    });
  }

  /**
   * Check if a signature exists for a product ID.
   */
  private async checkSignatureById(productId: string): Promise<boolean> {
    const sig = await this.getSignatureFromId(productId);
    return !!sig;
  }

  /**
   * Type guard to check if an instruction is a ParsedInstruction.
   */
  private isParsedInstruction(
    instruction: ParsedInstruction | PartiallyDecodedInstruction
  ): instruction is ParsedInstruction {
    return (instruction as ParsedInstruction).parsed !== undefined;
  }
}
