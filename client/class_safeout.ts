// Imports for Solana
import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";

// Internal imports
import { DatabaseManager } from "./src/database-manager";
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
  private databaseManager: DatabaseManager;
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
    this.databaseManager = new DatabaseManager("");
    this.mintManager = new MintManager(connection, mintAuthority);
  }

  /**
   * Initialize the SDK - must be called before using other methods
   */
  public async init(databaseUrl?: string): Promise<void> {
    try {
      const dbUrl = databaseUrl || "postgresql://sdk:pide@localhost:5454/sdk-1?schema=public";
      if (!dbUrl) {
        throw new Error('DATABASE_URL environment variable is required');
      }
      
      // Initialize database connection
      this.databaseManager = new DatabaseManager(dbUrl);
      await this.databaseManager.init();
      
      // Initialize mint
      this.mint = await this.mintManager.initializeMint();
      
      // Initialize managers that need the database pool
      this.tokenManager = new TokenManager(
        this.connection,
        this.mint,
        this.owner,
        this.hashAlgo,
        this.databaseManager.getPool()
      );
      
      this.historyManager = new HistoryManager(this.databaseManager.getPool());
      
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
    const existingProduct = await this.databaseManager.getFullProductData(productData.productUid);
    
    if (existingProduct) {
      throw new Error(`Product with ID ${productData.productUid} already exists.`);
    }

    // Reconstruct complete ProductInput object with validated data
    const validatedProductInput: ProductInput = {
      productUid: productData.productUid,
      info: validatedInfo
    };

    // Create product in database
    const product = await this.databaseManager.createProductWithRelations(validatedProductInput);

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
        this.databaseManager.createProductWithRelations(productInput)
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
    const existingProduct = await this.databaseManager.getFullProductData(productId);
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
    const updatedProduct = await this.databaseManager.updateProductById(
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
        const existingProduct = await this.databaseManager.getFullProductData(productId);
        if (!existingProduct) {
          console.warn(`Product with ID ${productId} not found, skipping.`);
          continue;
        }

        // Validate and update
        let validatedData;
        if (updateData.info) {
          const validatedInfo = ValidationUtils.validateProductData(updateData.info);
          validatedData = {
            productUid: updateData.productUid || productId,
            info: validatedInfo
          };
        } else {
          validatedData = updateData;
        }
        const updatedProduct = await this.databaseManager.updateProductById(
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
    const existingProduct = await this.databaseManager.getFullProductData(productId);
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
    await this.databaseManager.deleteProductWithRelations(productId);
  }

  /**
   * Delete multiple products in batch
   */
  public async deleteBatchDppProducts(productIds: string[], changedBy?: string): Promise<void> {
    if (!this.historyManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }

    // Get existing products data for history
    const existingProducts = await Promise.all(
      productIds.map(id => this.databaseManager.getFullProductData(id))
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

    // Delete all products and related data
    for (const productId of validProductIds) {
      await this.databaseManager.deleteProductWithRelations(productId);
    }
  }

  /**
   * Get a complete DPP product with all related data by ID
   * Returns a JSON object with the product and all its sub-tables (manufacturer, materialComposition, hazardousSubstances, history, visibility)
   */
  public async getDppProductById(productId: string): Promise<any> {
    if (!this.databaseManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }

    // Get the basic product data
    const product = await this.databaseManager.getFullProductData(productId);

    if (!product) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    // Get history data
    const history = await this.historyManager?.getProductHistory(productId) || [];

    // Get visibility data
    const pool = this.databaseManager.getPool();
    const client = await pool.connect();
    let visibility: any = {};
    
    try {
      const visibilityResult = await client.query(
        'SELECT public, owner, brand FROM dpp_product_visibility WHERE product_id = $1',
        [productId]
      );
      
      if (visibilityResult.rows.length > 0) {
        visibility = visibilityResult.rows[0];
      }
    } finally {
      client.release();
    }
    // Transform the result to a clean JSON structure
    return {
      product: {
        id: product.id,
        productName: product.productName,
        dateOfManufacture: product.dateOfManufacture.toISOString(),
        placeOfManufacture: product.placeOfManufacture,
        productCategory: product.productCategory,
        repairabilityScore: product.repairabilityScore,
        endOfLifeInstructions: product.endOfLifeInstructions,
        digitalLink: product.digitalLink,
        manufacturerId: product.manufacturer.id,
        signature: product.signature
      },
      manufacturer: {
        id: product.manufacturer.id,
        name: product.manufacturer.name,
        address: product.manufacturer.address,
        contactEmail: product.manufacturer.contactEmail
      },
      materialComposition: product.materialComposition.map((mc: any) => ({
        material: mc.material,
        percentage: mc.percentage
      })),
      hazardousSubstances: product.hazardousSubstances.map((hs: any) => ({
        substance: hs.substance,
        casNumber: hs.casNumber,
        concentration: hs.concentration
      })),
      history: history.map((h: any) => ({
        id: h.id,
        action: h.action,
        changed_by: h.changed_by,
        change_timestamp: h.change_timestamp,
        previous_data: h.previous_data,
        new_data: h.new_data,
        change_description: h.change_description
      })),
      visibility: {
        public: visibility.public,
        owner: visibility.owner,
        brand: visibility.brand
      }
    };
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

  /**
   * Updates the visibility data for a product
   * @param type - The type of data to update: "public", "owner", or "brand"
   * @param productId - The ID of the product
   * @param data - The JSON data to set (e.g., ["name", "productName", ...])
   * @returns The updated visibility record
   */
  public async updateProductVisibility(
    type: "public" | "owner" | "brand", 
    productId: string, 
    data: any
  ): Promise<any> {
    return this.databaseManager.updateProductVisibility(type, productId, data);
  }

  /**
   * Get visibility hashes for a product
   * @param productId - The ID of the product
   * @returns Object containing public, owner, and brand hashes
   */
  public async getProductVisibilityHashes(
    productId: string
  ): Promise<{ publicHash: string; ownerHash: string; brandHash: string }> {
    if (!this.tokenManager) {
      throw new Error("SDK is not initialized. Call init() first.");
    }
    return (this.tokenManager as any).getVisibilityHashes(productId);
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
    return new Promise((resolve) => {
      // This method is no longer needed with direct PostgreSQL connection
      resolve(this.databaseManager.getPool());
    });
  }
}
