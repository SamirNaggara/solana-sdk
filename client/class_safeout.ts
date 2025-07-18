// Imports for Solana
import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";

// Internal imports
import { getPayerKeypair } from "./lib/solanaUtils";
import { PrismaManager } from "./src/prisma-manager";
import { ValidationUtils } from "./src/validation";
import { MintManager } from "./src/mint-manager";
import { TokenManager } from "./src/token-manager";
import { HistoryManager } from "./src/history-manager";
import { ProductInput, CompleteProduct, MintResult } from "./src/types";

// Re-export types for external use
export type { ProductInput, CompleteProduct, MintResult } from "./src/types";

/**
 * SafeoutSDK - Main SDK class for managing digital product passports (DPP) on Solana blockchain
 */
export class SafeoutSDK {
  private connection: Connection;
  private mintAuthority: PublicKey;
  private owner: PublicKey;
  private mint: PublicKey | null = null;
  private hashAlgo: string = "sha256";

  // Manager instances
  private prismaManager: PrismaManager;
  private mintManager: MintManager;
  private tokenManager: TokenManager | null = null;
  private historyManager: HistoryManager | null = null;

  /**
   * Create a new SafeoutSDK instance
   * @param connection - Solana connection instance
   * @param mintAuthority - PublicKey of the mint authority
   * @param owner - PublicKey of the token owner
   */
  constructor(connection: Connection, mintAuthority: PublicKey, owner: PublicKey) {
    this.connection = connection;
    this.mintAuthority = mintAuthority;
    this.owner = owner;
    
    // Initialize managers
    this.prismaManager = new PrismaManager("");
    this.mintManager = new MintManager(connection, mintAuthority);
  }

  /**
   * Initialize the SDK - must be called before using other methods
   */
  public async init(): Promise<void> {
    try {
      // Setup Prisma with environment variable
      const databaseUrl = process.env.DATABASE_URL || "";
      if (!databaseUrl) {
        throw new Error("DATABASE_URL environment variable is required");
      }
      await this.prismaManager.setupPrisma(databaseUrl);
      
      // Initialize mint
      this.mint = await this.mintManager.initializeMint();
      
      // Initialize managers that need the mint
      this.tokenManager = new TokenManager(
        this.connection,
        this.mint, // Use the actual mint, not mintAuthority
        this.owner,
        this.hashAlgo,
        this.prismaManager.getPrisma()
      );
      
      this.historyManager = new HistoryManager(this.prismaManager.getPrisma());
      
      console.log('SafeoutSDK initialized successfully');
    } catch (error) {
      console.error('Failed to initialize SafeoutSDK:', error);
      throw error;
    }
  }

  /* ----------------------------------------------------------------------- */
  /*                              Product CRUD                               */
  /* ----------------------------------------------------------------------- */

  /**
   * Create a new DPP product
   */
  public async createDppProduct(
    productData: ProductInput,
    changedBy?: string
  ): Promise<CompleteProduct> {
    if (!this.tokenManager || !this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }

    // Validate input data
    const validatedInfo = ValidationUtils.validateProductData(productData.info);

    // Check if product already exists
    const existingProduct = await this.prismaManager.getPrisma().productDPP.findUnique({
      where: { id: productData.productUid }
    });
    
    if (existingProduct) {
      throw new Error(`Product with ID ${productData.productUid} already exists.`);
    }

    // Reconstruct complete ProductInput object with validated data
    const validatedProductInput: ProductInput = {
      productUid: productData.productUid,
      info: validatedInfo
    };

    // Create product in database
    const product = await this.prismaManager.createProductWithRelations(validatedProductInput);

    // Create blockchain token
    const mintResult = await this.tokenManager.createMintToken(product.id);

    // Record in history
    await this.historyManager.recordProductHistory(
      product.id,
      'CREATE',
      null,
      product,
      ValidationUtils.normalizeUserName(changedBy),
      'Product created'
    );

    return {
      ...product,
      signature: mintResult.signature,
      hash: mintResult.hash,
    };
  }

  /**
   * Create multiple DPP products in batch
   */
  public async createBatchDppProducts(
    productsData: ProductInput[],
    changedBy?: string
  ): Promise<CompleteProduct[]> {
    if (!this.tokenManager || !this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }

    // Validate all products and reconstruct ProductInput objects
    const validatedProducts = productsData.map(data => {
      const validatedInfo = ValidationUtils.validateProductData(data.info);
      return {
        productUid: data.productUid,
        info: validatedInfo
      };
    });

    // Create all products in database
    const createdProducts = await Promise.all(
      validatedProducts.map((productInput: ProductInput) => 
        this.prismaManager.createProductWithRelations(productInput)
      )
    );

    // Mint tokens for all products
    const productIds = createdProducts.map((p: any) => p.id);
    const mintResults = await this.tokenManager.batchMintToken(productIds);

    // Record history for all products
    const normalizedUser = ValidationUtils.normalizeUserName(changedBy);
    await Promise.all(
      createdProducts.map((product: any) =>
        this.historyManager!.recordProductHistory(
          product.id,
          'CREATE',
          null,
          product,
          normalizedUser,
          'Batch product creation'
        )
      )
    );

    // Combine results
    return createdProducts.map((product: any, index: number) => {
      const mintResult = mintResults.find(r => r.productUid === product.id);
      return {
        ...product,
        signature: mintResult?.signature || null,
        hash: mintResult?.hash || null,
      };
    });
  }

  /**
   * Update an existing DPP product
   */
  public async updateDppProduct(
    productId: string,
    updateData: Partial<ProductInput>,
    changedBy?: string
  ): Promise<CompleteProduct> {
    if (!this.tokenManager || !this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }

    // Get existing product for history
    const existingProduct = await this.prismaManager.getFullProductData(productId);
    if (!existingProduct) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    // Validate update data if info is provided
    let validatedData;
    if (updateData.info) {
      validatedData = ValidationUtils.validateProductData(updateData.info);
    } else {
      validatedData = updateData;
    }

    // Update product in database
    const updatedProduct = await this.prismaManager.updateProductById(
      productId,
      validatedData
    );

    // Update blockchain token
    const mintResult = await this.tokenManager.updateMintToken(productId);

    // Record in history
    await this.historyManager.recordProductHistory(
      productId,
      'UPDATE',
      existingProduct,
      updatedProduct,
      ValidationUtils.normalizeUserName(changedBy),
      'Product updated'
    );

    return {
      ...updatedProduct,
      signature: mintResult.signature,
      hash: mintResult.hash,
    };
  }

  /**
   * Update multiple DPP products in batch
   */
  public async updateBatchDppProducts(
    updates: Array<{ productId: string; updateData: Partial<ProductInput> }>,
    changedBy?: string
  ): Promise<CompleteProduct[]> {
    if (!this.tokenManager || !this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }

    const results: CompleteProduct[] = [];
    const normalizedUser = ValidationUtils.normalizeUserName(changedBy);

    // Process updates sequentially to avoid conflicts
    for (const { productId, updateData } of updates) {
      try {
        // Get existing product for history
        const existingProduct = await this.prismaManager.getFullProductData(productId);
        if (!existingProduct) {
          console.warn(`Product with ID ${productId} not found, skipping.`);
          continue;
        }

        // Validate and update
        let validatedData;
        if (updateData.info) {
          validatedData = ValidationUtils.validateProductData(updateData.info);
        } else {
          validatedData = updateData;
        }
        const updatedProduct = await this.prismaManager.updateProductById(
          productId,
          validatedData
        );

        // Update blockchain token
        const mintResult = await this.tokenManager.updateMintToken(productId);

        // Record in history
        await this.historyManager.recordProductHistory(
          productId,
          'UPDATE',
          existingProduct,
          updatedProduct,
          normalizedUser,
          'Batch product update'
        );

        results.push({
          ...updatedProduct,
          signature: mintResult.signature,
          hash: mintResult.hash,
        });
      } catch (error) {
        console.error(`Error updating product ${productId}:`, error);
      }
    }

    return results;
  }

  /**
   * Delete a DPP product
   */
  public async deleteDppProduct(productId: string, changedBy?: string): Promise<void> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }

    // Get existing product for history
    const existingProduct = await this.prismaManager.getFullProductData(productId);
    if (!existingProduct) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    // Record deletion in history before deleting
    await this.historyManager.recordProductHistory(
      productId,
      'DELETE',
      existingProduct,
      null,
      ValidationUtils.normalizeUserName(changedBy),
      'Product deleted'
    );

    // Delete from database
    await this.prismaManager.deleteProductWithRelations(productId);
  }

  /**
   * Delete multiple products in batch
   */
  public async deleteBatchDppProducts(productIds: string[], changedBy?: string): Promise<void> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }

    const prisma = this.prismaManager.getPrisma();

    // Get existing products data for history
    const existingProducts = await Promise.all(
      productIds.map(id => this.prismaManager.getFullProductData(id))
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
        this.historyManager!.recordProductHistory(
          product.id,
          'DELETE',
          product,
          null,
          ValidationUtils.normalizeUserName(changedBy),
          'Batch product deletion'
        )
      )
    );

    // Delete all products and related data in a transaction
    await prisma.$transaction([
      prisma.materialComposition.deleteMany({
        where: { productId: { in: validProductIds } },
      }),
      prisma.hazardousSubstance.deleteMany({
        where: { productId: { in: validProductIds } },
      }),
      prisma.productDPP.deleteMany({
        where: { id: { in: validProductIds } },
      }),
    ]);
  }

  /* ----------------------------------------------------------------------- */
  /*                         Authenticity verification                       */
  /* ----------------------------------------------------------------------- */

  /**
   * Check authenticity on blockchain
   */
  public async checkAuthenticityOnBlockchain(
    productId: string
  ): Promise<{ isValid: boolean; reason?: string }> {
    if (!this.tokenManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }
    
    return this.tokenManager.checkAuthenticityOnBlockchain(productId);
  }

  /* ----------------------------------------------------------------------- */
  /*                              Public utilities                            */
  /* ----------------------------------------------------------------------- */

  /**
   * Check and top up SOL balance if needed
   */
  public async checkAndTopUpBalance(minBalance: number = 0.1): Promise<boolean> {
    return this.mintManager.checkAndTopUpBalance(minBalance);
  }

  /**
   * Get current mint information
   */
  public getMintInfo(): { mintAddress: string | null; mintAuthority: string } {
    return {
      mintAddress: this.mint?.toString() || null,
      mintAuthority: this.mintAuthority.toString()
    };
  }

  /**
   * Get current SOL balance
   */
  public async getBalance(): Promise<number> {
    return this.mintManager.getBalance();
  }

  /**
   * Get the history of a specific product by its ID
   */
  public async getProductHistory(productId: string): Promise<any[]> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }
    return this.historyManager.getProductHistory(productId);
  }

  /**
   * Get all product history with pagination
   */
  public async getAllProductHistory(
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }
    return this.historyManager.getAllProductHistory(page, limit);
  }

  /**
   * Get product history filtered by action (CREATE, UPDATE, DELETE)
   */
  public async getProductHistoryByAction(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }
    return this.historyManager.getProductHistoryByAction(action, page, limit);
  }

  /**
   * Get product history by user who made the changes
   */
  public async getProductHistoryByUser(
    changedBy: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }
    return this.historyManager.getProductHistoryByUser(changedBy, page, limit);
  }

  /**
   * Get product history filtered by date range
   */
  public async getProductHistoryByDateRange(
    startDate: Date,
    endDate: Date,
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }
    return this.historyManager.getProductHistoryByDateRange(startDate, endDate, page, limit);
  }

  /**
   * Get statistics about product history
   */
  public async getProductHistoryStats(): Promise<{
    totalChanges: number;
    createCount: number;
    updateCount: number;
    deleteCount: number;
    uniqueProducts: number;
    uniqueUsers: number;
  }> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }
    return this.historyManager.getProductHistoryStats();
  }

  /**
   * Normalize user name (for testing access)
   */
  public normalizeUserName(userName?: string): string {
    return ValidationUtils.normalizeUserName(userName);
  }

  // Testing methods - accessing manager methods for test compatibility
  private saveMintConfig(mintAddress: PublicKey): void {
    return this.mintManager.saveMintConfig(mintAddress);
  }

  private loadMintConfig(): PublicKey | null {
    return this.mintManager.loadMintConfig();
  }

  private async mintExists(mintAddress: PublicKey): Promise<boolean> {
    return this.mintManager.mintExists(mintAddress);
  }

  private async initializeMint(): Promise<PublicKey> {
    return this.mintManager.initializeMint();
  }

  private async setupPrisma(): Promise<any> {
    return this.prismaManager.setupPrisma(process.env.DATABASE_URL || "");
  }
}
