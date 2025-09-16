// Imports for Solana
import {
  Connection,
  PublicKey,
  Keypair,
} from "@solana/web3.js";
import { createHash } from "crypto";

// Internal imports
import { DatabaseManager } from "./src/database-manager";
import { ValidationUtils } from "./src/validation";
import { MintManager } from "./src/mint-manager";
import { TokenManager } from "./src/token-manager";
import { HistoryManager } from "./src/history-manager";
import { ProductInput, CompleteProduct, MintResult, AuthenticityResult } from "./src/types";

// Re-export types for external use
export type { ProductInput, CompleteProduct, MintResult, AuthenticityResult } from "./src/types";

/**
 * Configuration interface for SafeoutSDK initialization
 */
export interface SafeoutConfig {
  databaseUrl: string;
  rpcUrl?: string; // default: 'https://api.devnet.solana.com'
  mintAuthorityPrivateKey?: string;
  ownerPrivateKey?: string;
}

/**
 * SafeoutSDK - Main SDK class for managing digital product passports (DPP) on Solana blockchain
 */
export class SafeoutSDK {
  // Simple parameters with defaults
  private rpcUrl: string = 'https://api.devnet.solana.com';
  private hashAlgo: string = "sha256";

  // Complex objects created from simple parameters
  private connection: Connection | null = null;
  private mintAuthorityKeypair: Keypair | null = null;
  private ownerKeypair: Keypair | null = null;
  private mint: PublicKey | null = null;

  // Manager instances
  private databaseManager: DatabaseManager | null = null;
  private mintManager: MintManager | null = null;
  private tokenManager: TokenManager | null = null;
  private historyManager: HistoryManager | null = null;

  /**
   * Create a new SafeoutSDK instance
   */
  constructor() {
    // Empty constructor - all configuration happens in init()
  }

  /**
   * Initialize the SDK with configuration
   * @param config - Configuration object
   */
  public async init(config: SafeoutConfig): Promise<void> {
    // Set simple parameters with defaults
    this.rpcUrl = config.rpcUrl || this.rpcUrl;

    // Create complex objects from simple parameters
    this.connection = new Connection(this.rpcUrl, 'confirmed');

    // Handle mint authority - from private key only (public key is derived)
    if (config.mintAuthorityPrivateKey) {
      this.mintAuthorityKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(config.mintAuthorityPrivateKey))
      );
    } else {
      // Generate random keypair as default
      this.mintAuthorityKeypair = Keypair.generate();
    }

    // Handle owner - from private key only (public key is derived)
    if (config.ownerPrivateKey) {
      this.ownerKeypair = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(config.ownerPrivateKey))
      );
    } else {
      // Use mint authority as default owner
      this.ownerKeypair = this.mintAuthorityKeypair;
    }

    // Initialize managers
    this.databaseManager = new DatabaseManager(config.databaseUrl);
    this.mintManager = new MintManager(this.connection, this.mintAuthorityKeypair.publicKey);

    // Initialize database connection
    await this.databaseManager.init();

    // Initialize mint
    this.mint = await this.mintManager.initializeMint(this.mintAuthorityKeypair);

    // Initialize managers that need the database pool
    this.tokenManager = new TokenManager(
      this.connection,
      this.mint,
      this.ownerKeypair.publicKey,
      this.hashAlgo,
      config.databaseUrl
    );

    this.historyManager = new HistoryManager(this.databaseManager!.getPool());

    console.log('SafeoutSDK initialized successfully');
  }

  /**
   * Ensure SDK is initialized
   */
  private ensureInitialized(): void {
    if (!this.connection || !this.mintAuthorityKeypair || !this.ownerKeypair || !this.databaseManager || !this.mintManager) {
      throw new Error('SDK not initialized. Please call init() first.');
    }
  }


  /* ----------------------------------------------------------------------- */
  /*                              Product CRUD                               */
  /* ----------------------------------------------------------------------- */

  /**
   * Validate DPP product data structure and types
   * @param productData - The product data to validate
   * @returns Validated product data
   * @throws Error if validation fails
   */
  public validateDppProductData(productData: ProductInput): ProductInput {
    try {
      const validatedInfo = ValidationUtils.validateProductData(productData.info);
      return {
        productUid: productData.productUid,
        info: validatedInfo
      };
    } catch (error) {
      throw new Error(`DPP validation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate product hash for verification purposes
   * Uses the same algorithm as blockchain verification based on DPPField accessibilityLevel
   * @param productData - The product data to hash (must contain DPPField structures)
   * @returns Object containing public, owner, and brand hashes
   */
  public calculateProductHash(productData: ProductInput): {
    publicHash: string;
    ownerHash: string;
    brandHash: string;
  } {
    const hashAlgo = "sha256";

    // Helper function to hash an object
    const hashObject = (obj: any): string => {
      return createHash(hashAlgo).update(JSON.stringify(obj)).digest("hex");
    };

    // Convert ProductInput format to include the productId as 'id'
    const completeProduct = {
      ...productData.info,
      id: productData.productUid
    };

    // Filter data by access levels using DPPField accessibilityLevel
    const publicData = ValidationUtils.filterProductByAccess(completeProduct, 'public');
    const ownerData = ValidationUtils.filterProductByAccess(completeProduct, 'owner');
    const brandData = ValidationUtils.filterProductByAccess(completeProduct, 'private');

    return {
      publicHash: hashObject(publicData),
      ownerHash: hashObject(ownerData),
      brandHash: hashObject(brandData)
    };
  }

  /**
   * Convert ProductInput to the same format used internally
   * @private
   */
  private convertProductInputToCompleteFormat(productData: ProductInput): any {
    return {
      ...productData.info,
      id: productData.productUid
    };
  }


  /**
   * Create DPP products (single or multiple)
   */
  public async createDppProducts(productData: ProductInput, changedBy?: string): Promise<CompleteProduct>;
  public async createDppProducts(productsData: ProductInput[], changedBy?: string): Promise<CompleteProduct[]>;
  public async createDppProducts(
    data: ProductInput | ProductInput[],
    changedBy?: string
  ): Promise<CompleteProduct | CompleteProduct[]> {
    this.ensureInitialized();

    // Handle single product
    if (!Array.isArray(data)) {
      return this.createSingleProduct(data, changedBy);
    }

    // Handle multiple products
    return this.createMultipleProducts(data, changedBy);
  }

  private async createSingleProduct(productData: ProductInput, changedBy?: string): Promise<CompleteProduct> {
    // Check if product already exists
    const existingProduct = await this.databaseManager!.getFullProductData(productData.productUid);
    if (existingProduct) {
      throw new Error(`Product with ID ${productData.productUid} already exists.`);
    }

    // Create product in database
    const product = await this.databaseManager!.createProductWithRelations(productData);

    // Create blockchain token
    const mintResult = await this.tokenManager!.createMintToken(product.id, this.mintAuthorityKeypair!);

    // Record in history
    await this.historyManager!.recordProductHistory(
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

  private async createMultipleProducts(productsData: ProductInput[], changedBy?: string): Promise<CompleteProduct[]> {
    // Create all products in database
    const createdProducts = await Promise.all(
      productsData.map((productInput: ProductInput) =>
        this.databaseManager!.createProductWithRelations(productInput)
      )
    );

    // Mint tokens for all products
    const productIds = createdProducts.map((p: any) => p.id);
    const mintResults = await this.tokenManager!.batchMintToken(productIds, this.mintAuthorityKeypair!);

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
          'Product created'
        )
      )
    );

    // Combine results
    return createdProducts.map((product: any) => {
      const mintResult = mintResults.find(r => r.productUid === product.id);
      return {
        ...product,
        signature: mintResult?.signature || null,
        hash: mintResult?.hash || null,
      };
    });
  }

  /**
   * Update DPP products (single or multiple)
   */
  public async updateDppProducts(
    productId: string,
    updateData: Partial<ProductInput>,
    changedBy?: string
  ): Promise<CompleteProduct>;
  public async updateDppProducts(
    updates: Array<{ productId: string; updateData: Partial<ProductInput> }>,
    changedBy?: string
  ): Promise<CompleteProduct[]>;
  public async updateDppProducts(
    data: string | Array<{ productId: string; updateData: Partial<ProductInput> }>,
    updateDataOrChangedBy?: Partial<ProductInput> | string,
    changedBy?: string
  ): Promise<CompleteProduct | CompleteProduct[]> {
    this.ensureInitialized();

    // Handle single product update
    if (typeof data === 'string') {
      const productId = data;
      const updateData = updateDataOrChangedBy as Partial<ProductInput>;
      return this.updateSingleProduct(productId, updateData, changedBy);
    }

    // Handle multiple products update
    const updates = data;
    const changedByUser = updateDataOrChangedBy as string;
    return this.updateMultipleProducts(updates, changedByUser);
  }

  private async updateSingleProduct(
    productId: string,
    updateData: Partial<ProductInput>,
    changedBy?: string
  ): Promise<CompleteProduct> {
    // Get existing product for history
    const existingProduct = await this.databaseManager!.getFullProductData(productId);
    if (!existingProduct) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    // Update product in database
    const updatedProduct = await this.databaseManager!.updateProductById(productId, updateData);

    // Update blockchain token
    const mintResult = await this.tokenManager!.updateMintToken(productId, this.mintAuthorityKeypair!);

    // Record in history
    await this.historyManager!.recordProductHistory(
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

  private async updateMultipleProducts(
    updates: Array<{ productId: string; updateData: Partial<ProductInput> }>,
    changedBy?: string
  ): Promise<CompleteProduct[]> {
    const results: CompleteProduct[] = [];
    const normalizedUser = ValidationUtils.normalizeUserName(changedBy);

    // Process updates sequentially to avoid conflicts
    for (const { productId, updateData } of updates) {
      try {
        // Get existing product for history
        const existingProduct = await this.databaseManager!.getFullProductData(productId);
        if (!existingProduct) {
          console.warn(`Product with ID ${productId} not found, skipping.`);
          continue;
        }

        // Update product
        const updatedProduct = await this.databaseManager!.updateProductById(productId, updateData);

        // Update blockchain token
        const mintResult = await this.tokenManager!.updateMintToken(productId, this.mintAuthorityKeypair!);

        // Record in history
        await this.historyManager!.recordProductHistory(
          productId,
          'UPDATE',
          existingProduct,
          updatedProduct,
          normalizedUser,
          'Product updated'
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
   * Delete DPP products (single or multiple)
   */
  public async deleteDppProducts(productId: string, changedBy?: string): Promise<void>;
  public async deleteDppProducts(productIds: string[], changedBy?: string): Promise<void>;
  public async deleteDppProducts(data: string | string[], changedBy?: string): Promise<void> {
    this.ensureInitialized();

    // Handle single product deletion
    if (typeof data === 'string') {
      return this.deleteSingleProduct(data, changedBy);
    }

    // Handle multiple products deletion
    return this.deleteMultipleProducts(data, changedBy);
  }

  private async deleteSingleProduct(productId: string, changedBy?: string): Promise<void> {
    // Get existing product for history
    const existingProduct = await this.databaseManager!.getFullProductData(productId);
    if (!existingProduct) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    // Record deletion in history before deleting
    await this.historyManager!.recordProductHistory(
      productId,
      'DELETE',
      existingProduct,
      null,
      ValidationUtils.normalizeUserName(changedBy),
      'Product deleted'
    );

    // Delete from database
    await this.databaseManager!.deleteProductWithRelations(productId);
  }

  private async deleteMultipleProducts(productIds: string[], changedBy?: string): Promise<void> {
    // Get existing products data for history
    const existingProducts = await Promise.all(
      productIds.map(id => this.databaseManager!.getFullProductData(id))
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
          'Product deleted'
        )
      )
    );

    // Delete all products and related data
    for (const productId of validProductIds) {
      await this.databaseManager!.deleteProductWithRelations(productId);
    }
  }

  /**
   * Get DPP products (single or multiple)
   */
  public async getDppProducts(
    productId: string,
    userAccessLevel?: 'public' | 'owner' | 'private'
  ): Promise<CompleteProduct>;
  public async getDppProducts(
    productIds: string[],
    userAccessLevel?: 'public' | 'owner' | 'private'
  ): Promise<CompleteProduct[]>;
  public async getDppProducts(
    data: string | string[],
    userAccessLevel: 'public' | 'owner' | 'private' = 'public'
  ): Promise<CompleteProduct | CompleteProduct[]> {
    this.ensureInitialized();

    // Handle single product
    if (typeof data === 'string') {
      return this.getSingleProduct(data, userAccessLevel);
    }

    // Handle multiple products
    return this.getMultipleProducts(data, userAccessLevel);
  }

  private async getSingleProduct(
    productId: string,
    userAccessLevel: 'public' | 'owner' | 'private'
  ): Promise<CompleteProduct> {
    // Get the basic product data
    const product = await this.databaseManager!.getFullProductData(productId);

    if (!product) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    // Apply access level filtering using ValidationUtils
    const filteredProduct = ValidationUtils.filterProductByAccess(product, userAccessLevel);

    // Get history data (only for owner/private access)
    let history: any[] = [];
    if (userAccessLevel === 'owner' || userAccessLevel === 'private') {
      history = await this.historyManager!.getProductHistory(productId) || [];
    }

    return {
      ...filteredProduct,
      history: history.length > 0 ? history.map((h: any) => ({
        id: h.id,
        action: h.action,
        changed_by: h.changed_by,
        change_timestamp: h.change_timestamp,
        previous_data: h.previous_data,
        new_data: h.new_data,
        change_description: h.change_description
      })) : undefined
    };
  }

  private async getMultipleProducts(
    productIds: string[],
    userAccessLevel: 'public' | 'owner' | 'private'
  ): Promise<CompleteProduct[]> {
    // Get all products in parallel
    const products = await Promise.all(
      productIds.map(async (productId) => {
        try {
          return await this.getSingleProduct(productId, userAccessLevel);
        } catch (error) {
          console.warn(`Could not retrieve product ${productId}:`, error);
          return null;
        }
      })
    );

    // Filter out failed retrievals
    return products.filter((product): product is CompleteProduct => product !== null);
  }

  /* ----------------------------------------------------------------------- */
  /*                         Authenticity verification                       */
  /* ----------------------------------------------------------------------- */

  /**
   * Check authenticity on blockchain with optional data verification
   * @param productId - Product ID to verify
   * @param productData - Optional product data to verify hash against (for complete verification)
   * @returns Complete authenticity verification result
   */
  public async checkAuthenticityOnBlockchain(
    productId: string,
    productData?: any
  ): Promise<AuthenticityResult> {
    this.ensureInitialized();

    return this.tokenManager!.checkAuthenticityOnBlockchain(productId, productData);
  }

  /**
   * Check authenticity of multiple products on blockchain in parallel
   * @param productIds - Array of product IDs to check
   * @returns Map of productId to authenticity result
   */
  public async checkBatchAuthenticityOnBlockchain(
    productIds: string[]
  ): Promise<Map<string, AuthenticityResult>> {
    this.ensureInitialized();

    const results = new Map<string, AuthenticityResult>();

    // Process all checks in parallel
    const promises = productIds.map(async (productId) => {
      try {
        const result = await this.tokenManager!.checkAuthenticityOnBlockchain(productId);
        return { productId, result };
      } catch (error) {
        return {
          productId,
          result: {
            isValid: false,
            reason: `Error checking authenticity: ${error instanceof Error ? error.message : String(error)}`
          } as AuthenticityResult
        };
      }
    });

    // Wait for all promises and build results map
    const allResults = await Promise.all(promises);
    allResults.forEach(({ productId, result }) => {
      results.set(productId, result);
    });

    return results;
  }

  /* ----------------------------------------------------------------------- */
  /*                              Public utilities                            */
  /* ----------------------------------------------------------------------- */

  /**
   * Check and top up SOL balance if needed
   */
  public async checkAndTopUpBalance(minBalance: number = 0.1): Promise<boolean> {
    this.ensureInitialized();
    return this.mintManager!.checkAndTopUpBalance(this.mintAuthorityKeypair!, minBalance);
  }

  /**
   * Get current mint information
   */
  public getMintInfo(): { mintAddress: string | null; mintAuthority: string } {
    return {
      mintAddress: this.mint?.toString() || null,
      mintAuthority: this.mintAuthorityKeypair!.publicKey.toString()
    };
  }

  /**
   * Get current SOL balance
   */
  public async getBalance(): Promise<number> {
    this.ensureInitialized();
    return this.mintManager!.getBalance(this.mintAuthorityKeypair!);
  }

  /**
   * Get the history of a specific product by its ID
   */
  public async getProductHistory(productId: string): Promise<any[]> {
    this.ensureInitialized();
    return this.historyManager!.getProductHistory(productId);
  }

  /**
   * Get all product history with pagination
   */
  public async getAllProductHistory(
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    this.ensureInitialized();
    return this.historyManager!.getAllProductHistory(page, limit);
  }

  /**
   * Get product history filtered by action (CREATE, UPDATE, DELETE)
   */
  public async getProductHistoryByAction(
    action: 'CREATE' | 'UPDATE' | 'DELETE',
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    this.ensureInitialized();
    return this.historyManager!.getProductHistoryByAction(action, page, limit);
  }

  /**
   * Get product history by user who made the changes
   */
  public async getProductHistoryByUser(
    changedBy: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ history: any[], total: number, totalPages: number }> {
    this.ensureInitialized();
    return this.historyManager!.getProductHistoryByUser(changedBy, page, limit);
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
    this.ensureInitialized();
    return this.historyManager!.getProductHistoryByDateRange(startDate, endDate, page, limit);
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
    this.ensureInitialized();
    return this.historyManager!.getProductHistoryStats();
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
    this.ensureInitialized();
    return this.databaseManager!.updateProductVisibility(type, productId, data);
  }

  /**
   * Get visibility hashes for a product
   * @param productId - The ID of the product
   * @returns Object containing public, owner, and brand hashes
   */
  public async getProductVisibilityHashes(
    productId: string
  ): Promise<{ publicHash: string; ownerHash: string; brandHash: string }> {
    this.ensureInitialized();
    return (this.tokenManager! as any).getVisibilityHashes(productId);
  }

  // Testing methods - accessing manager methods for test compatibility
  private saveMintConfig(mintAddress: PublicKey): void {
    return this.mintManager!.saveMintConfig(mintAddress);
  }

  private loadMintConfig(): PublicKey | null {
    return this.mintManager!.loadMintConfig();
  }

  private async mintExists(mintAddress: PublicKey): Promise<boolean> {
    return this.mintManager!.mintExists(mintAddress);
  }

  private async initializeMint(): Promise<PublicKey> {
    return this.mintManager!.initializeMint(this.mintAuthorityKeypair!);
  }

  private async setupPrisma(): Promise<any> {
    return new Promise((resolve) => {
      // This method is no longer needed with direct PostgreSQL connection
      resolve(this.databaseManager!.getPool());
    });
  }
}
