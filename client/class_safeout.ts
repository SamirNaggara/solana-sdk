import {
  createMint,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
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
  EpochSchedule,
} from "@solana/web3.js";
import { createHash } from "crypto";
import { createMemoInstruction, MEMO_PROGRAM_ID } from "@solana/spl-memo";
import { getPayerKeypair } from "./lib/solanaUtils";
import z from "zod";
import { PrismaClient } from "@prisma/client";
import Bottleneck from "bottleneck";
import { GetIDProductDPP } from "./GetIdProuctDPP";
import { execSync } from 'child_process';
import { writeFileSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/** Supported Solana cluster names */
export type NetworkValue = "Mainnet" | "Testnet" | "Devnet";

/* -------------------------------------------------------------------------- */
/*                                Helper types                                */
/* -------------------------------------------------------------------------- */

/**
 * Runtime‑validated shape of a product metadata object.
 * This is a placeholder and should be replaced with actual metadata schema.
 * The metadata can be anything, but it must be a valid JSON object.
 */
const isoDateString = z.string().refine((val) => !isNaN(Date.parse(val)), {
  message: "Must be a valid ISO‑8601 string",
});

const signatureString = z
  .string()
  .min(1, "Signature must be a non‑empty string");

/** Runtime‑validated shape of a memo object stored on‑chain */
const SignatureSchema = z.object({
  hash: z.string().min(1, "Hash is required"),
});

export type ProductInput = {  productUid: string;
  info: {
    [key: string]: string;
  };
};

export interface MintResult {
  productUid: string;
  signature: string;
  hash: string;
}

type FieldHistory = {
  value: string;
  date: string;
};

type VersionedProduct = {
  productUid: string;
  info: {
    [key: string]: FieldHistory[];
  };
  dateReference: {key: string; value: string}[];
};


/* -------------------------------------------------------------------------- */
/*                                Safeout SDK                                 */
/* -------------------------------------------------------------------------- */

export class SafeoutSDK {
  /* ---------------------------- instance fields --------------------------- */
  private mintAuthority: PublicKey;
  private owner: PublicKey;
  private hashAlgo: string;
  private connection: Connection;
  private prisma: PrismaClient | null;
  private databaseUrl: string;
  private mint: PublicKey | null;

  constructor(
    network: NetworkValue,
    hashAlgo: string,
    mintAuthority: PublicKey,
    owner: PublicKey,
    databaseUrl: string
  ) {

    this.mintAuthority = mintAuthority;
    this.hashAlgo = hashAlgo;
    this.owner = owner;
    this.databaseUrl = databaseUrl;
    this.prisma = null;
    /* Select RPC endpoint based on the cluster name */
    const url =
      network === "Mainnet"
        ? "https://api.mainnet-beta.solana.com"
        : network === "Testnet"
          ? "https://api.testnet.solana.com"
          : "https://api.devnet.solana.com";

    this.connection = new Connection(url, "confirmed");
    this.mint = null; // lazy‑initialised on first mint
  }

  /* ----------------------------------------------------------------------- */
  /*                           Initialization Prisma                         */
  /* ----------------------------------------------------------------------- */
  private async setupPrisma(databaseUrl: string): Promise<PrismaClient> {
    const tempDir = mkdtempSync('prisma');
    const schemaPath = join(tempDir, 'schema.prisma');

    const schema = `
    datasource db {
      provider = "postgresql"
      url      = "${databaseUrl}"
    }

    generator client {
      provider = "prisma-client-js"
    }

    model ProductDPP {
      id        String   @id
      info      Json
      dateReference Json
      signature String?
    }
  `;

    writeFileSync(schemaPath, schema);

    try {
      execSync(`npx prisma db push --schema="${schemaPath}"`, {
        stdio: 'inherit',
      });
    } catch (err) {
      throw new Error(`Prisma setup failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    await prisma.$connect();
    return prisma;
  }

  /* ----------------------------------------------------------------------- */
  /*                             Formating product                           */
  /* ----------------------------------------------------------------------- */

  private isVersionedProductInfo(info: any): info is VersionedProduct['info'] {
    if (!info || typeof info !== 'object') return false;
    
    for (const [key, value] of Object.entries(info)) {
      if (!Array.isArray(value)) return false;
      
      for (const item of value) {
        if (!item || typeof item !== 'object' || 
            typeof item.value !== 'string' || 
            typeof item.date !== 'string') {
          return false;
        }
      }
    }
    
    return true;
  }

  private safeConvertToVersionedProduct(productId: string, dbInfo: any, dateReference: any): VersionedProduct {
    if (this.isVersionedProductInfo(dbInfo)) {
      return {
        productUid: productId,
        info: dbInfo,
        dateReference: dateReference
      };
    }
    if (dbInfo && typeof dbInfo === 'object' && !Array.isArray(dbInfo)) {
      const date = "date " + dateReference.length;
      const versionedInfo: VersionedProduct['info'] = {};
      
      for (const [key, value] of Object.entries(dbInfo)) {
        if (typeof value === 'string') {
          versionedInfo[key] = [{ value, date }];
        }
      }
      
      return {
        productUid: productId,
        info: versionedInfo,
        dateReference: dateReference
      };
    }
    
    // If we can't convert, throw an error
    throw new Error(`Cannot convert product ${productId} info to versioned format`);
  }

  /* ----------------------------------------------------------------------- */
  /*                             Product creation                            */
  /* ----------------------------------------------------------------------- */

  /**
   * Create a single DPP product and immediately mint its token.
   * @param productInput – `{ productUid, info }` structure.
   * @throws Error if a product with the same UID already exists.
   */
  public async createDppProduct(
    productInput: ProductInput
  ): Promise<MintResult> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    const exists = await this.prisma.productDPP.findUnique({
      where: { id: productInput.productUid },
    });
    if (exists) {
      throw new Error(
        `Product with ID ${productInput.productUid} already exists.`
      );
    }
    const product = this.formatToVersionedProduct(productInput);
    await this.prisma.productDPP.create({
      data: {
        id: product.productUid,
        info: product.info,
        signature: "", // filled right after minting
        dateReference: product.dateReference
      },
    });

    const { signature, hash } = await this.createMintToken(
      product.productUid
    );

    return { productUid: product.productUid, signature, hash };
  }

  /**
   * Create several DPP products in one pass and mint their tokens in batch.
   * @param products     Array of `{ productUid, info }` objects.
   * @param concurrency  Maximum parallel mints handled by the rate‑limiter.
   * @throws Error if all given products already exist.
   */
  public async createBatchDppProducts(
    products: ProductInput[],
    concurrency = 10
  ): Promise<MintResult[]> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    // Fetch existing IDs in a single query for efficiency
    const ids = products.map((p) => p.productUid);
    const existing = await this.prisma.productDPP.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));

    // Filter products which truly need to be created
    const toInsert = products.filter((p) => !existingIds.has(p.productUid));
    if (toInsert.length === 0) throw new Error("Every product already exists.");

    // Format products to versioned format before storing
    const formattedProducts = toInsert.map((p) => this.formatToVersionedProduct(p));

    await this.prisma.productDPP.createMany({
      data: formattedProducts.map((p) => ({
        id: p.productUid,
        info: p.info,
        signature: "",
        dateReference: p.dateReference
      })),
    });

    const minted = await this.batchMintToken(
      toInsert.map((p) => p.productUid),
      concurrency
    );

    // Persist signatures in a single transaction for atomicity
    await this.prisma.$transaction(
      minted.map((m) =>
        this.prisma!.productDPP.update({
          where: { id: m.productUid },
          data: { signature: m.signature },
        })
      )
    );

    return minted;
  }

  /* ----------------------------------------------------------------------- */
  /*                          Product update – single                        */
  /* ----------------------------------------------------------------------- */

  /**
   * Update a single product’s metadata and refresh its on‑chain token.
   * @param productUid – Unique identifier of the product.
   * @param info       – New metadata object.
   */
  public async updateDppProduct(product: ProductInput): Promise<MintResult> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    
    // Get existing product
    const existingProduct = await this.prisma.productDPP.findUnique({
      where: { id: product.productUid },
    });
    
    if (!existingProduct) {
      throw new Error(`Product with ID ${product.productUid} not found.`);
    }

    // Convert existing product to versioned format
    const currentVersioned = this.safeConvertToVersionedProduct(
      existingProduct.id, 
      existingProduct.info,
      existingProduct.dateReference
    );

    // Check if current and incoming data are equal
    if (this.areProductInfosEqual(currentVersioned, product)) {
      throw new Error(`Product ${product.productUid} has no changes - current and incoming data are identical`);
    }

    // Update with new data using versioned logic
    const updatedProduct = this.updateVersionedProduct(currentVersioned, product);

    // 1️⃣ Update metadata in the database
    await this.prisma.productDPP.update({
      where: { id: product.productUid },
      data: { info: updatedProduct.info },
    });

    // 2️⃣ Refresh on‑chain representation
    const { signature, hash } = await this.updateMintToken(product.productUid);

    // 3️⃣ Persist the new signature in the DB
    await this.prisma.productDPP.update({
      where: { id: product.productUid },
      data: { signature },
    });

    return { productUid: product.productUid, signature, hash };
  }

  /* ----------------------------------------------------------------------- */
  /*                          Product update – batch                         */
  /* ----------------------------------------------------------------------- */

  /**
   * Upsert multiple products: create those that are missing, update others,
   * then (re)mint tokens for the whole batch.
   * @param products     Array of product objects `{ productUid, info }`.
   * @param concurrency  Maximum parallel mints.
   */
  public async updateBatchDppProducts(
    products: ProductInput[],
    concurrency = 10
  ): Promise<MintResult[]> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    const ids = products.map((p) => p.productUid);
    const existing = await this.prisma.productDPP.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));

    const toCreate = products.filter((p) => !existingIds.has(p.productUid));
    const toUpdate = products.filter((p) => existingIds.has(p.productUid));

    if (toCreate.length) {
      // Format new products to versioned format
      const formattedNewProducts = toCreate.map((p) => this.formatToVersionedProduct(p));
      
      await this.prisma.productDPP.createMany({
        data: formattedNewProducts.map((p) => ({
          id: p.productUid,
          info: p.info,
          signature: "",
          dateReference: p.dateReference || [{ key: "date 0", value: new Date().toISOString() }],
        })),
      });
    }

    if (toUpdate.length) {
      // Get existing products and update them with versioned logic
      const existingProducts = await this.prisma.productDPP.findMany({
        where: { id: { in: toUpdate.map(p => p.productUid) } },
      });

      const updateOperations = toUpdate.map((incomingProduct) => {
        const existingProduct = existingProducts.find(ep => ep.id === incomingProduct.productUid);
        if (!existingProduct) {
          throw new Error(`Product ${incomingProduct.productUid} not found`);
        }

        // Convert existing product to versioned format
        const currentVersioned = this.safeConvertToVersionedProduct(
          existingProduct.id,
          existingProduct.info,
          existingProduct.dateReference
        );

        // Check if current and incoming data are equal
        if (this.areProductInfosEqual(currentVersioned, incomingProduct) && !existingProduct.signature) {
          console.error(`Product ${incomingProduct.productUid} has no changes - current and incoming data are identical`);
          return null;
        }

        // Update with new data
        const updatedProduct = this.updateVersionedProduct(currentVersioned, incomingProduct);

        return this.prisma!.productDPP.update({
          where: { id: incomingProduct.productUid },
          data: { info: updatedProduct.info , dateReference: updatedProduct.dateReference },
        });
      }).filter((op): op is ReturnType<PrismaClient['productDPP']['update']> => op !== null);

      await this.prisma.$transaction(updateOperations);
    }

    const minted = await this.batchMintToken(
      products.map((p) => p.productUid),
      concurrency
    );

    await this.prisma.$transaction(
      minted.map((m) =>
        this.prisma!.productDPP.update({
          where: { id: m.productUid },
          data: { signature: m.signature },
        })
      )
    );

    return minted;
  }

  /* ----------------------------------------------------------------------- */
  /*                              Token helpers                              */
  /* ----------------------------------------------------------------------- */

  /**
   * Mint a token for a newly‑created product.
   * @throws Error if a signature already exists for the product.
   */
  private async createMintToken(
    productId: string
  ): Promise<{ signature: string; hash: string }> {
    if (!this.mint) this.mint = await this.initializeMint();

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
   * Update an existing product token after metadata has changed.
   */
  private async updateMintToken(
    productUid: string
  ): Promise<{ signature: string; hash: string }> {
    if (!this.mint) this.mint = await this.initializeMint();

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

  /* ----------------------------------------------------------------------- */
  /*                              Batch helper                               */
  /* ----------------------------------------------------------------------- */

  /**
   * Mint or update tokens for several products concurrently, preserving order.
   * @param productIds  Array of product UIDs.
   * @param concurrency Maximum parallel jobs handled by Bottleneck.
   */
  private async batchMintToken(
    productIds: string[],
    concurrency = 10
  ): Promise<MintResult[]> {
    const metadataArray = await this.getMetadataFromIdArray(productIds);
    if (!this.mint) {
      this.mint = await this.initializeMint();
    }
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
          /* — optional: sort metadata keys to obtain deterministic hashing — */
          const sortedEntries = Object.entries(metadataArray[idx]).sort(
            ([a], [b]) => a.localeCompare(b)
          );
          JSON.stringify(Object.fromEntries(sortedEntries)); // computed but unused; kept for parity with original code

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

  /* ----------------------------------------------------------------------- */
  /*                         Authenticity verification                       */
  /* ----------------------------------------------------------------------- */

  /**
   * Compare local metadata with the on‑chain hash stored in the memo.
   */
  public async checkAuthenticityOnBlockchain(
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

  /* ----------------------------------------------------------------------- */
  /*                              Low‑level utils                            */
  /* ----------------------------------------------------------------------- */

  private async initializeMint(): Promise<PublicKey> {
    const payer = await getPayerKeypair();
    return createMint(this.connection, payer, this.mintAuthority, null, 0);
  }

  /** Obtain the payer Keypair used for all write transactions */
  private async getPayer(): Promise<Keypair> {
    return getPayerKeypair();
  }

  /** Hash arbitrary JSON using the configured algorithm */
  private hashObject(obj: string): string {
    return createHash(this.hashAlgo).update(obj).digest("hex");
  }

  /**
   * Build (or skip) an `createAssociatedTokenAccountInstruction` for the owner.
   * Returns `null` if the ATA already exists.
   */
  private async createInstruction(
    payer: Signer
  ): Promise<TransactionInstruction | null> {
    if (!this.mint) this.mint = await this.initializeMint();

    const ata = await getAssociatedTokenAddress(
      this.mint,
      this.owner,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const info = await this.connection.getAccountInfo(ata);
    if (info) return null; // already exists

    return createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      this.owner,
      this.mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
  }

  /* ----------------------------- DB helpers ------------------------------ */

  private async getMetadataFromId(productId: string): Promise<string> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
    });
    if (!product) throw new Error(`Product with ID ${productId} not found.`);
    return JSON.stringify(product.info);
  }

  private async getMetadataFromIdArray(
    productIdArray: string[]
  ): Promise<object[]> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    const products = await this.prisma.productDPP.findMany({
      where: { id: { in: productIdArray } },
      select: { info: true },
    });
    if (!products.length)
      throw new Error("No products found for the provided IDs.");
    return products
      .map((p) => p.info)
      .filter(
        (info): info is object => info !== null && typeof info === "object"
      );
  }

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
        return ix.parsed as unknown as string; // spl‑memo stores raw string in parsed field
      }
    }
    throw new Error("Memo not found");
  }

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

  private async getSignatureFromId(productId: string): Promise<string | null> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
      select: { signature: true },
    });
    if (!product) throw new Error(`Product with ID ${productId} not found.`);
    return product.signature ?? null;
  }

  private async setSignatureFromId(
    productId: string,
    signature: string
  ): Promise<void> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
    });
    if (!product) throw new Error(`Product with ID ${productId} not found.`);
    if (product.signature)
      throw new Error(`Signature already exists for product ID ${productId}.`);

    await this.prisma.productDPP.update({
      where: { id: productId },
      data: { signature },
    });
  }

  private async checkSignatureById(productId: string): Promise<boolean> {
    const sig = await this.getSignatureFromId(productId);
    return !!sig;
  }

  /* ------------------------- Instruction type guard ---------------------- */

  private isParsedInstruction(
    instruction: ParsedInstruction | PartiallyDecodedInstruction
  ): instruction is ParsedInstruction {
    return (instruction as ParsedInstruction).parsed !== undefined;
  }

  private formatToVersionedProduct(data: ProductInput): VersionedProduct {
    const date ="date 0";
    const formattedInfo: VersionedProduct["info"] = {};

    for (const [key, value] of Object.entries(data.info)) {
      formattedInfo[key] = [{ value, date }];
    }

    return {
      productUid: data.productUid,
      info: formattedInfo,
      dateReference: [{ key: "date 0", value: new Date().toISOString() }],
    };
  }

  private updateVersionedProduct(
    current: VersionedProduct,
    incoming: ProductInput
  ): VersionedProduct {
    const date = "date " + (current.dateReference.length + 1);
    const updatedInfo: VersionedProduct["info"] = { ...current.info };
    current.dateReference.push({ key: date, value: new Date().toISOString()});
    for (const [key, newValue] of Object.entries(incoming.info)) {
      if (!updatedInfo[key]) {
        updatedInfo[key] = [{ value: newValue, date }];
        continue;
      }

      const history = updatedInfo[key];
      const lastEntry = history[history.length - 1];

      if (lastEntry.value !== newValue) {
        history.push({ value: newValue, date });
      }
    }

    return {
      productUid: current.productUid,
      info: updatedInfo,
      dateReference: current.dateReference,
    };
  }

  private areProductInfosEqual(currentVersioned: VersionedProduct, incomingProduct: ProductInput): boolean {
    // Get the latest values from the current versioned product
    const currentLatestValues: { [key: string]: string } = {};
    
    for (const [key, history] of Object.entries(currentVersioned.info)) {
      if (history.length > 0) {
        const latestEntry = history[history.length - 1];
        currentLatestValues[key] = latestEntry.value;
      }
    }

    // Compare with incoming product info
    const currentKeys = Object.keys(currentLatestValues);
    const incomingKeys = Object.keys(incomingProduct.info);

    // Check if they have the same number of keys
    if (currentKeys.length !== incomingKeys.length) {
      return false;
    }

    // Check if all keys and values match
    for (const key of incomingKeys) {
      if (currentLatestValues[key] !== incomingProduct.info[key]) {
        return false;
      }
    }

    return true;
  }
}
