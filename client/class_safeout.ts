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
import { createMemoInstruction, MEMO_PROGRAM_ID } from "@solana/spl-memo";
import { getPayerKeypair } from "./lib/solanaUtils";
import { writeFileSync, mkdtempSync } from 'fs';
import { PrismaClient } from "@prisma/client";
import DppProductSchema from "./SchemaZod";
import { execSync } from 'child_process';
import Bottleneck from "bottleneck";
import { createHash } from "crypto";
import { join } from 'path';
import z from "zod";



/** Supported Solana cluster names */
export type NetworkValue = "Mainnet" | "Testnet" | "Devnet";

/* -------------------------------------------------------------------------- */
/*                                Helper types                                */
/* -------------------------------------------------------------------------- */



/** Runtime‑validated shape of a memo object stored on‑chain */
const SignatureSchema = z.object({
  hash: z.string().min(1, "Hash is required"),
});

export type ProductInput = {
  productUid: string;
  info: z.infer<typeof DppProductSchema>;
};

// Type for the complete product with relations
export type CompleteProduct = {
  id: string;
  productName: string;
  dateOfManufacture: Date;
  placeOfManufacture: string;
  productCategory: string;
  repairabilityScore?: number;
  endOfLifeInstructions: string;
  digitalLink: string;
  signature: string;
  manufacturer: {
    name: string;
    address: string;
    contactEmail: string;
  };
  materialComposition: Array<{
    material: string;
    percentage: number;
  }>;
  hazardousSubstances: Array<{
    substance: string;
    casNumber: string;
    concentration: number;
  }>;
};

export interface MintResult {
  productUid: string;
  signature: string;
  hash: string;
}




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

  /* ---------------------------- Validation helpers ------------------------ */

  /**
   * Validates product data using Zod schema
   * @param productData - The product data to validate
   * @throws ZodError if validation fails
   */
  private validateProductData(productData: any): z.infer<typeof DppProductSchema> {
    try {
      return DppProductSchema.parse(productData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw error;
      }
      throw new Error(`Validation failed: ${error}`);
    }
  }

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
    let url;
    if (network == "Mainnet")
      url = "https://api.mainnet-beta.solana.com";
    if (network == "Testnet")
      url = "https://api.testnet.solana.com"
    else
      url = "https://api.devnet.solana.com";

    this.connection = new Connection(url, "confirmed");
    this.mint = null;
  }

  /**
   * Initializes the SDK by setting up Prisma and mint.
   * @throws Error if Prisma setup fails or mint initialization fails
   * This method must be called before any other SDK methods.
   */
  public async init(): Promise<void> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
    if (!this.mint) {
      this.mint = await this.initializeMint();
    }
  }
  /* ----------------------------------------------------------------------- */
  /*                           Initialization Prisma                         */
  /* ----------------------------------------------------------------------- */
  /**
   * Sets up Prisma client and database schema.
   * @param databaseUrl - The URL of the database to connect to
   * @returns PrismaClient instance
   * @throws Error if Prisma setup fails
   */
  private async setupPrisma(databaseUrl: string): Promise<PrismaClient> {
    const schemaPath = join("prisma/", 'schema.prisma');

    const schema = `
    datasource db {
      provider = "postgresql"
      url      = "${databaseUrl}"
    }

 
    generator client {
      provider = "prisma-client-js"
    }

    model productDPP {
      id                    String              @id @default(uuid()) @map("productId")
      productName           String
      dateOfManufacture     DateTime
      placeOfManufacture    String
      productCategory       String
      repairabilityScore    Float?              // Optional
      endOfLifeInstructions String
      digitalLink           String

      manufacturer          Manufacturer        @relation(fields: [manufacturerId], references: [id])
      manufacturerId        String

      materialComposition   MaterialComposition[]
      hazardousSubstances   HazardousSubstance[]
      signature             String
      history               DppProductHistory[]

      @@map("dpp_products")
    }
    model Manufacturer {
      id           String       @id @default(uuid())
      name         String
      address      String
      contactEmail String

      products     productDPP[]

      @@map("manufacturers")
    }

    model MaterialComposition {
      id          String      @id @default(uuid())
      material    String
      percentage  Float

      product     productDPP  @relation(fields: [productId], references: [id])
      productId   String

      @@map("material_compositions")
    }

    model HazardousSubstance {
      id            String      @id @default(uuid())
      substance     String
      casNumber     String
      concentration Float

      product       productDPP  @relation(fields: [productId], references: [id])
      productId     String

      @@map("hazardous_substances")
    }

    model DppProductHistory {
      id                    String      @id @default(uuid())
      productId             String
      action                String      // CREATE, UPDATE, DELETE
      changedBy             String      // User identifier
      changeTimestamp       DateTime    @default(now())
      previousData          Json?       // Previous state of the product
      newData               Json?       // New state of the product
      changeDescription     String?     // Optional description of the change

      product               productDPP  @relation(fields: [productId], references: [id], onDelete: Cascade)

      @@map("dpp_product_history")
      @@index([productId])
      @@index([changeTimestamp])
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
  /*                             Helper functions                            */
  /* ----------------------------------------------------------------------- */

  /**
   * Create or find a manufacturer in the database
   * @param manufacturerData - Manufacturer data to create or find
   * @returns The ID of the existing or newly created manufacturer
   */
  private async createOrFindManufacturer(manufacturerData: {
    name: string;
    address: string;
    contactEmail: string;
  }): Promise<string> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const existingManufacturer = await this.prisma.manufacturer.findFirst({
      where: {
        name: manufacturerData.name,
        contactEmail: manufacturerData.contactEmail
      }
    });

    if (existingManufacturer) {
      return existingManufacturer.id;
    }

    const newManufacturer = await this.prisma.manufacturer.create({
      data: manufacturerData
    });

    return newManufacturer.id;
  }

  /**
   * Convert ProductInput to Prisma create data
   * @param productInput - ProductInput object containing product data
   * @returns Prisma create data object
   */
  private async convertToCreateData(productInput: ProductInput) {
    const manufacturerId = await this.createOrFindManufacturer(productInput.info.manufacturer as {
      name: string;
      address: string;
      contactEmail: string;
    });

    return {
      id: productInput.productUid,
      productName: productInput.info.productName,
      dateOfManufacture: new Date(productInput.info.dateOfManufacture),
      placeOfManufacture: productInput.info.placeOfManufacture,
      productCategory: productInput.info.productCategory,
      repairabilityScore: productInput.info.repairabilityScore,
      endOfLifeInstructions: productInput.info.endOfLifeInstructions,
      digitalLink: productInput.info.digitalLink,
      manufacturerId: manufacturerId,
      signature: "",
      materialComposition: {
        create: productInput.info.materialComposition.map(mc => ({
          material: mc.material,
          percentage: mc.percentage
        }))
      },
      hazardousSubstances: {
        create: productInput.info.hazardousSubstances.map(hs => ({
          substance: hs.substance,
          casNumber: hs.casNumber,
          concentration: hs.concentration
        }))
      }
    };
  }

  /**
   * Get full product data including relations
   * @param productId - The ID of the product to retrieve
   * @returns CompleteProduct object or null if not found
   */
  private async getFullProductData(productId: string): Promise<any | null> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
      include: {
        manufacturer: true,
        materialComposition: true,
        hazardousSubstances: true,
      },
    });

    if (!product) return null;

    return {
      id: product.id,
      productName: product.productName,
      dateOfManufacture: product.dateOfManufacture,
      placeOfManufacture: product.placeOfManufacture,
      productCategory: product.productCategory,
      repairabilityScore: product.repairabilityScore,
      endOfLifeInstructions: product.endOfLifeInstructions,
      digitalLink: product.digitalLink,
      signature: product.signature,
      manufacturer: product.manufacturer,
      materialComposition: product.materialComposition,
      hazardousSubstances: product.hazardousSubstances,
    };
  }

  /* ----------------------------------------------------------------------- */
  /*                             Product creation                            */
  /* ----------------------------------------------------------------------- */

  /**
   * Create a single DPP product and immediately mint its token.
   * @param productInput – `{ productUid, info }` structure.
   * @throws Error if a product with the same UID already exists.
   * @throws ZodError if product validation fails.
   */
  public async createDppProduct(
    productInput: ProductInput,
    changedBy?: string
  ): Promise<MintResult> {
    this.validateProductData(productInput.info);

    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const exists = await this.prisma.productDPP.findUnique({
      where: { id: productInput.productUid },
    });
    if (exists) {
      throw new Error(
        `Product with ID ${productInput.productUid} already exists.`
      );
    }

    const createData = await this.convertToCreateData(productInput);
    const createdProduct = await this.prisma.productDPP.create({
      data: createData,
      include: {
        manufacturer: true,
        materialComposition: true,
        hazardousSubstances: true,
      },
    });

    const { signature, hash } = await this.createMintToken(
      productInput.productUid
    );

    await this.recordProductHistory(
      productInput.productUid,
      'CREATE',
      null,
      createdProduct,
      changedBy || 'system',
      'Product created'
    );

    return { productUid: productInput.productUid, signature, hash };
  }

  /**
   * Create several DPP products in one pass and mint their tokens in batch.
   * @param products     Array of `{ productUid, info }` objects.
   * @param concurrency  Maximum parallel mints handled by the rate‑limiter.
   * @throws Error if all given products already exist.
   * @throws ZodError if any product validation fails.
   */
  public async createBatchDppProducts(
    products: ProductInput[],
    concurrency = 10,
    changedBy?: string
  ): Promise<MintResult[]> {
    products.forEach(product => {
      this.validateProductData(product.info);
    });

    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }
    const ids = products.map((p) => p.productUid);
    const existing = await this.prisma.productDPP.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));

    // Filter products which truly need to be created
    const toInsert = products.filter((p) => !existingIds.has(p.productUid));
    if (toInsert.length === 0) throw new Error("Every product already exists.");

    // Create products one by one due to complex relations
    const createdProducts = [];
    for (const product of toInsert) {
      const createData = await this.convertToCreateData(product);
      const createdProduct = await this.prisma.productDPP.create({
        data: createData,
        include: {
          manufacturer: true,
          materialComposition: true,
          hazardousSubstances: true,
        },
      });
      createdProducts.push(createdProduct);
    }

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

    // Record batch creation in history
    await Promise.all(
      createdProducts.map(product =>
        this.recordProductHistory(
          product.id,
          'CREATE',
          null,
          product,
          changedBy || 'system',
          'Batch product creation'
        )
      )
    );

    return minted;
  }

  /* ----------------------------------------------------------------------- */
  /*                          Product update – single                        */
  /* ----------------------------------------------------------------------- */

  /**
   * Update a single product's metadata and refresh its on‑chain token.
   * @param product – Product data with new information.
   * @throws ZodError if product validation fails.
   */
  public async updateDppProduct(product: ProductInput, changedBy?: string): Promise<MintResult> {
    // Validate product data using Zod schema
    this.validateProductData(product.info);

    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    // Get existing product data for history
    const existingProduct = await this.getFullProductData(product.productUid);

    if (!existingProduct) {
      throw new Error(`Product with ID ${product.productUid} not found.`);
    }

    // Update the product with new data
    await this.updateProductWithRelations(product);

    // Get updated product data for history
    const updatedProduct = await this.getFullProductData(product.productUid);

    // Record update in history
    await this.recordProductHistory(
      product.productUid,
      'UPDATE',
      existingProduct,
      updatedProduct,
      changedBy || 'system',
      'Product updated'
    );

    // Refresh on‑chain representation
    const { signature, hash } = await this.updateMintToken(product.productUid);

    return { productUid: product.productUid, signature, hash };
  }

  /**
   * Update product with all its relations
   * @param product - ProductInput object containing product data
   * @throws Error if Prisma client is not initialized
   */
  private async updateProductWithRelations(product: ProductInput): Promise<void> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const manufacturerId = await this.createOrFindManufacturer(product.info.manufacturer);

    await this.prisma.productDPP.update({
      where: { id: product.productUid },
      data: {
        productName: product.info.productName,
        dateOfManufacture: new Date(product.info.dateOfManufacture),
        placeOfManufacture: product.info.placeOfManufacture,
        productCategory: product.info.productCategory,
        repairabilityScore: product.info.repairabilityScore,
        endOfLifeInstructions: product.info.endOfLifeInstructions,
        digitalLink: product.info.digitalLink,
        manufacturerId: manufacturerId,
        materialComposition: {
          deleteMany: {},
          create: product.info.materialComposition.map(mc => ({
            material: mc.material,
            percentage: mc.percentage
          }))
        },
        hazardousSubstances: {
          deleteMany: {},
          create: product.info.hazardousSubstances.map(hs => ({
            substance: hs.substance,
            casNumber: hs.casNumber,
            concentration: hs.concentration
          }))
        }
      },
    });
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
    concurrency = 10,
    changedBy?: string
  ): Promise<MintResult[]> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    // Validate all products before processing
    products.forEach(product => {
      this.validateProductData(product.info);
    });

    const ids = products.map((p) => p.productUid);
    const existing = await this.prisma.productDPP.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((p) => p.id));

    const toCreate = products.filter((p) => !existingIds.has(p.productUid));
    const toUpdate = products.filter((p) => existingIds.has(p.productUid));

    // Get existing data for updates before modifying
    const existingUpdateData = await Promise.all(
      toUpdate.map(product => this.getFullProductData(product.productUid))
    );

    // Create new products
    const createdProducts = [];
    for (const product of toCreate) {
      const createData = await this.convertToCreateData(product);
      const createdProduct = await this.prisma.productDPP.create({
        data: createData,
        include: {
          manufacturer: true,
          materialComposition: true,
          hazardousSubstances: true,
        },
      });
      createdProducts.push(createdProduct);
    }

    // Update existing products
    for (const product of toUpdate) {
      await this.updateProductWithRelations(product);
    }

    // Get updated data for history
    const updatedProductData = await Promise.all(
      toUpdate.map(product => this.getFullProductData(product.productUid))
    );

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

    // Record batch operations in history
    // Record creations
    await Promise.all(
      createdProducts.map(product =>
        this.recordProductHistory(
          product.id,
          'CREATE',
          null,
          product,
          changedBy || 'system',
          'Batch product creation (upsert)'
        )
      )
    );

    // Record updates
    await Promise.all(
      toUpdate.map((product, index) =>
        this.recordProductHistory(
          product.productUid,
          'UPDATE',
          existingUpdateData[index],
          updatedProductData[index],
          changedBy || 'system',
          'Batch product update (upsert)'
        )
      )
    );

    return minted;
  }

  /* ----------------------------------------------------------------------- */
  /*                          Product deletion                               */
  /* ----------------------------------------------------------------------- */

  /**
   * Delete a single product and record the deletion in history.
   * @param productId - The ID of the product to delete
   * @param changedBy - The user who initiated the deletion
   * @throws Error if product not found
   */
  public async deleteDppProduct(productId: string, changedBy?: string): Promise<void> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    // Get existing product data for history
    const existingProduct = await this.getFullProductData(productId);

    if (!existingProduct) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    // Record deletion in history before actually deleting
    await this.recordProductHistory(
      productId,
      'DELETE',
      existingProduct,
      null,
      changedBy || 'system',
      'Product deleted'
    );

    // Delete the product and all related data
    await this.prisma.$transaction([
      this.prisma.materialComposition.deleteMany({
        where: { productId },
      }),
      this.prisma.hazardousSubstance.deleteMany({
        where: { productId },
      }),
      this.prisma.productDPP.delete({
        where: { id: productId },
      }),
    ]);
  }

  /**
   * Delete multiple products in batch and record each deletion in history.
   * @param productIds - Array of product IDs to delete
   * @param changedBy - The user who initiated the deletion
   */
  public async deleteBatchDppProducts(productIds: string[], changedBy?: string): Promise<void> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    // Get existing products data for history
    const existingProducts = await Promise.all(
      productIds.map(id => this.getFullProductData(id))
    );

    // Filter out non-existent products
    const validProducts = existingProducts.filter((p: any) => p !== null);
    const validProductIds = validProducts.map((p: any) => p.id);

    if (validProductIds.length === 0) {
      throw new Error("No valid products found to delete.");
    }

    // Record deletions in history before actually deleting
    await Promise.all(
      validProducts.map((product: any) =>
        this.recordProductHistory(
          product.id,
          'DELETE',
          product,
          null,
          changedBy || 'system',
          'Batch product deletion'
        )
      )
    );

    // Delete all products and related data in a transaction
    await this.prisma.$transaction([
      this.prisma.materialComposition.deleteMany({
        where: { productId: { in: validProductIds } },
      }),
      this.prisma.hazardousSubstance.deleteMany({
        where: { productId: { in: validProductIds } },
      }),
      this.prisma.productDPP.deleteMany({
        where: { id: { in: validProductIds } },
      }),
    ]);
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
   * Get metadata for a product by its ID.
   * @param productId - The ID of the product
   * @returns Metadata object
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
   * Get the memo associated with a product's signature.
   * @param productId - The ID of the product
   * @returns Memo string or null if not found
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

  /**
   * Send a transaction with a memo instruction.
   * @param payer - The payer Keypair
   * @param ataInstruction - Optional associated token account instruction
   * @param memoPayload - The memo content to include
   * @returns Transaction signature
   */
  private async initializeMint(): Promise<PublicKey> {
    const payer = await getPayerKeypair();
    return createMint(this.connection, payer, this.mintAuthority, null, 0);
  }

  /**
   * Get the signature for a product by its ID.
   * @returns Payer Keypair for transaction fees
   * @throws Error if unable to get payer keypair
   */
  private async getPayer(): Promise<Keypair> {
    return getPayerKeypair();
  }

  /** Hash arbitrary JSON using the configured algorithm */
  private hashObject(obj: string): string {
    return createHash(this.hashAlgo).update(obj).digest("hex");
  }

  /**
   * Check if a signature exists for a product ID.
   * @param productId - The ID of the product
   * @returns True if signature exists, false otherwise
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

    try {
      // Ajout d'un timeout et d'une gestion d'erreur pour éviter les boucles infinies
      const info = await Promise.race([
        this.connection.getAccountInfo(ata, "confirmed"),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout getting account info")), 10000)
        )
      ]);
      
      if (info) {
        console.log(`ATA already exists for owner: ${this.owner.toString()}`);
        return null; // already exists
      }
    } catch (error) {
      console.warn(`Error checking ATA existence, proceeding with creation: ${error}`);
      // Si on ne peut pas vérifier l'existence, on procède avec la création
      // L'instruction échouera de manière gracieuse si l'ATA existe déjà
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

  /* ----------------------------- DB helpers ------------------------------ */
  /**
   * Check if a signature exists for a product ID.
   * @param productId - The ID of the product
   * @returns True if signature exists, false otherwise
   */
  private async getMetadataFromId(productId: string): Promise<string> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
      include: {
        manufacturer: true,
        materialComposition: true,
        hazardousSubstances: true,
      },
    });
    if (!product) throw new Error(`Product with ID ${productId} not found.`);

    // Convert Prisma data to the format expected by the schema
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
   * @param productIdArray - Array of product IDs
   * @returns Array of metadata objects
   * @throws Error if no products found for the provided IDs
   */
  private async getMetadataFromIdArray(
    productIdArray: string[]
  ): Promise<object[]> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }
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
   * @param productId - The ID of the product
   * @returns Memo string
   * @throws Error if no signature or memo found
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
        return ix.parsed as unknown as string; // spl‑memo stores raw string in parsed field
      }
    }
    throw new Error("Memo not found");
  }

  /**
   * Send a transaction with a memo instruction.
   * @param payer - The payer Keypair
   * @param ataInstruction - Optional associated token account instruction
   * @param memo - The memo content to include
   * @returns Transaction signature
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
   * @param productId - The ID of the product
   * @returns Signature string or null if not found
   * @throws Error if product not found
   */
  private async getSignatureFromId(productId: string): Promise<string | null> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }
    const product = await this.prisma.productDPP.findUnique({
      where: { id: productId },
      select: { signature: true },
    });
    if (!product) throw new Error(`Product with ID ${productId} not found.`);
    return product.signature ?? null;
  }

  /**
   * Set the signature for a product by its ID.
   * @param productId - The ID of the product
   * @param signature - The signature to set
   * @throws Error if product not found or Prisma client not initialized
   */
  private async setSignatureFromId(
    productId: string,
    signature: string
  ): Promise<void> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }
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
   * @param productId - The ID of the product
   * @returns True if signature exists, false otherwise
   */
  private async checkSignatureById(productId: string): Promise<boolean> {
    const sig = await this.getSignatureFromId(productId);
    return !!sig;
  }

  /* ------------------------- Instruction type guard ---------------------- */

  /**
   * Type guard to check if an instruction is a ParsedInstruction.
   * @param instruction - The instruction to check
   * @returns True if the instruction is a ParsedInstruction, false otherwise
   */
  private isParsedInstruction(
    instruction: ParsedInstruction | PartiallyDecodedInstruction
  ): instruction is ParsedInstruction {
    return (instruction as ParsedInstruction).parsed !== undefined;
  }

  /**
   * Record a change in product history
   * @param productId - The ID of the product
   * @param action - The action performed (CREATE, UPDATE, DELETE)
   * @param previousData - Previous product data (if applicable)
   * @param newData - New product data (if applicable)
   * @param changedBy - The user who made the change (default: 'system')
   * @param changeDescription - Optional description of the change
   * @throws Error if Prisma client is not initialized
   * @throws Error if productId is not provided
   * @throws Error if action is not one of CREATE, UPDATE, DELETE
   * @throws Error if previousData or newData is not an object
   * @throws Error if changedBy is not a string
   * @throws Error if changeDescription is not a string
   * @returns Promise<void>
   */
  private async recordProductHistory(
    productId: string,
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    previousData: any = null,
    newData: any = null,
    changedBy: string = 'system',
    changeDescription?: string
  ): Promise<void> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    await this.prisma.dppProductHistory.create({
      data: {
        productId,
        action,
        previousData: previousData ? JSON.parse(JSON.stringify(previousData)) : null,
        newData: newData ? JSON.parse(JSON.stringify(newData)) : null,
        changedBy,
        changeDescription,
      },
    });
  }

  /**
   * Get the history of a specific product by its ID
   * @param productId - The ID of the product
   * @returns Array of history records for the product
   * @throws Error if Prisma client is not initialized
   */
  public async getProductHistory(productId: string): Promise<any[]> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const history = await this.prisma.dppProductHistory.findMany({
      where: { productId },
      orderBy: { changeTimestamp: 'desc' },
    });

    return history;
  }

  /**
    * Get all product history with pagination
    * @param page - Page number for pagination (default: 1)
    * @param limit - Number of records per page (default: 50)
    * @returns Object containing history records, total count, and total pages
    * @throws Error if Prisma client is not initialized
    * @throws Error if page or limit is not a positive integer
    * @throws Error if page or limit is less than 1
    * @throws Error if page or limit is greater than 1000
    * @throws Error if page or limit is not a number
   */
  public async getAllProductHistory(
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.dppProductHistory.findMany({
        orderBy: { changeTimestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.dppProductHistory.count(),
    ]);

    return {
      history,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get product history filtered by action (CREATE, UPDATE, DELETE)
   * @param action - The action to filter by
   * @param page - Page number for pagination (default: 1)
   * @param limit - Number of records per page (default: 50)
   * @returns Object containing history records, total count, and total pages
   * @throws Error if Prisma client is not initialized
   */
  public async getProductHistoryByAction(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.dppProductHistory.findMany({
        where: { action },
        orderBy: { changeTimestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.dppProductHistory.count({ where: { action } }),
    ]);

    return {
      history,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get product history by user who made the changes
   * @param changedBy - The user who made the changes
   * @param page - Page number for pagination (default: 1)
   * @param limit - Number of records per page (default: 50)
   * @returns Object containing history records, total count, and total pages
   * @throws Error if Prisma client is not initialized
   */
  public async getProductHistoryByUser(
    changedBy: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.dppProductHistory.findMany({
        where: { changedBy },
        orderBy: { changeTimestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.dppProductHistory.count({ where: { changedBy } }),
    ]);

    return {
      history,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get product history filtered by date range
   * @param startDate - Start date for filtering
   * @param endDate - End date for filtering
   * @param page - Page number for pagination (default: 1)
   * @param limit - Number of records per page (default: 50)
   * @returns Object containing history records, total count, and total pages
   * @throws Error if Prisma client is not initialized
   */
  public async getProductHistoryByDateRange(
    startDate: Date,
    endDate: Date,
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const offset = (page - 1) * limit;

    const [history, total] = await Promise.all([
      this.prisma.dppProductHistory.findMany({
        where: {
          changeTimestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
        orderBy: { changeTimestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.dppProductHistory.count({
        where: {
          changeTimestamp: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    return {
      history,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get statistics about product history
   * @returns Object containing total changes, create count, update count,
   * delete count, unique products, and unique users
   * @throws Error if Prisma client is not initialized
   */
  public async getProductHistoryStats(): Promise<{
    totalChanges: number;
    createCount: number;
    updateCount: number;
    deleteCount: number;
    uniqueProducts: number;
    uniqueUsers: number;
  }> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }

    const [
      totalChanges,
      createCount,
      updateCount,
      deleteCount,
      uniqueProductsResult,
      uniqueUsersResult,
    ] = await Promise.all([
      this.prisma.dppProductHistory.count(),
      this.prisma.dppProductHistory.count({ where: { action: 'CREATE' } }),
      this.prisma.dppProductHistory.count({ where: { action: 'UPDATE' } }),
      this.prisma.dppProductHistory.count({ where: { action: 'DELETE' } }),
      this.prisma.dppProductHistory.groupBy({
        by: ['productId'],
        _count: true,
      }),
      this.prisma.dppProductHistory.groupBy({
        by: ['changedBy'],
        _count: true,
      }),
    ]);

    return {
      totalChanges,
      createCount,
      updateCount,
      deleteCount,
      uniqueProducts: uniqueProductsResult.length,
      uniqueUsers: uniqueUsersResult.length,
    };
  }

}
