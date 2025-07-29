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
    const hashes = await this.getVisibilityHashes(productId);

    if (await this.getSignatureFromId(productId)) {
      throw new Error(`Token already created for product ID ${productId}`);
    }

    const ataInstruction = await this.createInstruction(payer);
    const memoPayload = JSON.stringify({
      public: hashes.publicHash,
      owner: hashes.ownerHash,
      brand: hashes.brandHash,
    });
    try {
      const signature = await this.sendTransactionWithMemo(
        payer,
        ataInstruction,
        memoPayload
      );
      await this.setSignatureFromId(productId, signature);
      return { signature, hash: hashes.brandHash }; // Return brand hash as main hash
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
    const currentSignature = await this.getSignatureFromId(productUid);
    if (!currentSignature)
      throw new Error("No signature found for the given product UID.");

    let existingMemo: string;
    let memoData: any;
    
    try {
      existingMemo = await this.getMemoFromSignature(productUid);
      if (!existingMemo)
        throw new Error("No memo found for the given product UID.");
      memoData = JSON.parse(existingMemo);
    } catch (error) {
      // If we can't get the memo from blockchain (signature invalid/not found),
      // we'll treat this as a case where we need to create a new token
      console.warn(`Could not retrieve memo from blockchain for product ${productUid}:`, error);
      // Create new hashes and proceed with transaction
      const hashes = await this.getVisibilityHashes(productUid);
      const payer = await this.getPayer();
      const ataInstruction = await this.createInstruction(payer);
      const memoPayload = JSON.stringify({
        public: hashes.publicHash,
        owner: hashes.ownerHash,
        brand: hashes.brandHash,
      });

      try {
        const newSignature = await this.sendTransactionWithMemo(
          payer,
          ataInstruction,
          memoPayload
        );
        await this.setSignatureFromId(productUid, newSignature);
        return { signature: newSignature, hash: hashes.brandHash };
      } catch (err) {
        throw new Error(`Transaction failed: ${err}`);
      }
    }

    const hashes = await this.getVisibilityHashes(productUid);

    // Check if any hash has changed
    if (memoData.public === hashes.publicHash && 
        memoData.owner === hashes.ownerHash && 
        memoData.brand === hashes.brandHash)
      throw new Error("Metadata has not changed; no update needed.");

    const payer = await this.getPayer();
    const ataInstruction = await this.createInstruction(payer);
    const memoPayload = JSON.stringify({
      public: hashes.publicHash,
      owner: hashes.ownerHash,
      brand: hashes.brandHash,
    });

    try {
      const newSignature = await this.sendTransactionWithMemo(
        payer,
        ataInstruction,
        memoPayload
      );
      await this.setSignatureFromId(productUid, newSignature);
      return { signature: newSignature, hash: hashes.brandHash };
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
    const hashes = await this.getVisibilityHashes(productId);
    const memo = await this.getMemoFromSignature(productId);
    const memoData = JSON.parse(memo);

    // Check if all hashes match
    if (memoData.public !== hashes.publicHash)
      return { isValid: false, reason: "Public hash mismatch" };
    if (memoData.owner !== hashes.ownerHash)
      return { isValid: false, reason: "Owner hash mismatch" };
    if (memoData.brand !== hashes.brandHash)
      return { isValid: false, reason: "Brand hash mismatch" };
    
    return { isValid: true, reason: "All hashes verified successfully" };
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
   * Get visibility-based hashes for public, owner, and brand levels
   */
  private async getVisibilityHashes(productId: string): Promise<{
    publicHash: string;
    ownerHash: string;
    brandHash: string;
  }> {
    // Get product data with visibility information
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
      include: {
        manufacturer: true,
        materialComposition: true,
        hazardousSubstances: true,
        extendedData: true // This is the DppProductVisibility relation
      },
    });
    
    if (!product) throw new Error(`Product with ID ${productId} not found.`);

    // Get the visibility data
    const visibilityData = product.extendedData?.[0]; // Assuming one visibility record per product
    
    if (!visibilityData) {
      throw new Error(`No visibility data found for product ID ${productId}`);
    }

    // Helper function to build data object based on visible fields
    const buildDataFromVisibility = (visibleFields: any, fullProduct: any) => {
      if (!visibleFields || visibleFields === null) return {};
      
      const data: any = {};
      const fieldsArray = Array.isArray(visibleFields) ? visibleFields : [];
      
      fieldsArray.forEach((field: string) => {
        switch (field) {
          case 'id':
            data.id = fullProduct.id;
            break;
          case 'productName':
            data.productName = fullProduct.productName;
            break;
          case 'dateOfManufacture':
            data.dateOfManufacture = fullProduct.dateOfManufacture.toISOString().split('T')[0];
            break;
          case 'placeOfManufacture':
            data.placeOfManufacture = fullProduct.placeOfManufacture;
            break;
          case 'productCategory':
            data.productCategory = fullProduct.productCategory;
            break;
          case 'repairabilityScore':
            data.repairabilityScore = fullProduct.repairabilityScore;
            break;
          case 'endOfLifeInstructions':
            data.endOfLifeInstructions = fullProduct.endOfLifeInstructions;
            break;
          case 'digitalLink':
            data.digitalLink = fullProduct.digitalLink;
            break;
          case 'manufacturerId':
            data.manufacturerId = fullProduct.manufacturerId;
            break;
          case 'signature':
            data.signature = fullProduct.signature;
            break;
          case 'manufacturer':
            data.manufacturer = {
              name: fullProduct.manufacturer.name,
              address: fullProduct.manufacturer.address,
              contactEmail: fullProduct.manufacturer.contactEmail,
            };
            break;
          case 'materialComposition':
            data.materialComposition = fullProduct.materialComposition.map((mc: any) => ({
              material: mc.material,
              percentage: mc.percentage,
            }));
            break;
          case 'hazardousSubstances':
            data.hazardousSubstances = fullProduct.hazardousSubstances.map((hs: any) => ({
              substance: hs.substance,
              casNumber: hs.casNumber,
              concentration: hs.concentration,
            }));
            break;
        }
      });
      
      return data;
    };

    // Public hash - uses fields defined in public visibility
    const publicData = buildDataFromVisibility(visibilityData.public, product);
    const publicHash = this.hashObject(JSON.stringify(publicData));

    // Owner hash - uses fields defined in owner visibility
    const ownerData = buildDataFromVisibility(visibilityData.owner, product);
    const ownerHash = this.hashObject(JSON.stringify(ownerData));

    // Brand hash - uses fields defined in brand visibility
    const brandData = buildDataFromVisibility(visibilityData.brand, product);
    const brandHash = this.hashObject(JSON.stringify(brandData));

    return {
      publicHash,
      ownerHash,
      brandHash
    };
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
    tx.sign(payer);
    const isValid = tx.verifySignatures();
    console.log('Signature valide ? :', isValid);
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
