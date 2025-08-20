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
import { Pool } from "pg";

export class TokenManager {
  private connection: Connection;
  private mint: PublicKey;
  private owner: PublicKey;
  private hashAlgo: string;
  private pool: Pool;

  constructor(
    connection: Connection, 
    mint: PublicKey, 
    owner: PublicKey, 
    hashAlgo: string,
    pool: Pool
  ) {
    this.connection = connection;
    this.mint = mint;
    this.owner = owner;
    this.hashAlgo = hashAlgo;
    this.pool = pool;
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
    const client = await this.pool.connect();
    
    try {
      // Get product data with visibility information
      const productResult = await client.query(
        `SELECT p.*, m.name as manufacturer_name, m.address as manufacturer_address, 
                m.contact_email as manufacturer_contact_email,
                v.public, v.owner, v.brand
         FROM dpp_products p
         JOIN manufacturers m ON p.manufacturer_id = m.id
         LEFT JOIN dpp_product_visibility v ON p."productId" = v.product_id
         WHERE p."productId" = $1`,
        [productId]
      );
      
      if (productResult.rows.length === 0) {
        throw new Error(`Product with ID ${productId} not found.`);
      }

      const product = productResult.rows[0];

      // Get material compositions
      const materialResult = await client.query(
        'SELECT material, percentage FROM material_compositions WHERE product_id = $1',
        [productId]
      );

      // Get hazardous substances
      const hazardousResult = await client.query(
        'SELECT substance, cas_number as "casNumber", concentration FROM hazardous_substances WHERE product_id = $1',
        [productId]
      );

      const visibilityData = {
        public: product.public,
        owner: product.owner,
        brand: product.brand
      };
      
      if (!visibilityData) {
        throw new Error(`No visibility data found for product ID ${productId}`);
      }

      // Build complete product object
      const completeProduct = {
        id: product.productId,
        productName: product.product_name,
        dateOfManufacture: product.date_of_manufacture,
        placeOfManufacture: product.place_of_manufacture,
        productCategory: product.product_category,
        repairabilityScore: product.repairability_score,
        endOfLifeInstructions: product.end_of_life_instructions,
        digitalLink: product.digital_link,
        signature: product.signature,
        manufacturer: {
          id: product.manufacturer_id,
          name: product.manufacturer_name,
          address: product.manufacturer_address,
          contactEmail: product.manufacturer_contact_email
        },
        materialComposition: materialResult.rows,
        hazardousSubstances: hazardousResult.rows
      };

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
              data.manufacturerId = fullProduct.manufacturer.id;
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
      const publicData = buildDataFromVisibility(visibilityData.public, completeProduct);
      const publicHash = this.hashObject(JSON.stringify(publicData));

      // Owner hash - uses fields defined in owner visibility
      const ownerData = buildDataFromVisibility(visibilityData.owner, completeProduct);
      const ownerHash = this.hashObject(JSON.stringify(ownerData));

      // Brand hash - uses fields defined in brand visibility
      const brandData = buildDataFromVisibility(visibilityData.brand, completeProduct);
      const brandHash = this.hashObject(JSON.stringify(brandData));

      return {
        publicHash,
        ownerHash,
        brandHash
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get metadata for a product by its ID.
   */
  private async getMetadataFromId(productId: string): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      // Get product data with manufacturer
      const productResult = await client.query(
        `SELECT p.*, m.name as manufacturer_name, m.address as manufacturer_address, 
                m.contact_email as manufacturer_contact_email
         FROM dpp_products p
         JOIN manufacturers m ON p.manufacturer_id = m.id
         WHERE p."productId" = $1`,
        [productId]
      );
      
      if (productResult.rows.length === 0) {
        throw new Error(`Product with ID ${productId} not found.`);
      }

      const product = productResult.rows[0];

      // Get material compositions
      const materialResult = await client.query(
        'SELECT material, percentage FROM material_compositions WHERE product_id = $1',
        [productId]
      );

      // Get hazardous substances
      const hazardousResult = await client.query(
        'SELECT substance, cas_number as "casNumber", concentration FROM hazardous_substances WHERE product_id = $1',
        [productId]
      );

      const productData = {
        productId: product.productId,
        productName: product.product_name,
        manufacturer: {
          name: product.manufacturer_name,
          address: product.manufacturer_address,
          contactEmail: product.manufacturer_contact_email,
        },
        dateOfManufacture: product.date_of_manufacture.toISOString().split('T')[0],
        placeOfManufacture: product.place_of_manufacture,
        productCategory: product.product_category,
        materialComposition: materialResult.rows.map((mc: any) => ({
          material: mc.material,
          percentage: mc.percentage,
        })),
        hazardousSubstances: hazardousResult.rows.map((hs: any) => ({
          substance: hs.substance,
          casNumber: hs.casNumber,
          concentration: hs.concentration,
        })),
        repairabilityScore: product.repairability_score,
        endOfLifeInstructions: product.end_of_life_instructions,
        digitalLink: product.digital_link,
      };

      return JSON.stringify(productData);
    } finally {
      client.release();
    }
  }

  /**
   * Get metadata for multiple products by their IDs.
   */
  private async getMetadataFromIdArray(
    productIdArray: string[]
  ): Promise<object[]> {
    const client = await this.pool.connect();
    
    try {
      // Get products data with manufacturers
      const placeholders = productIdArray.map((_, index) => `$${index + 1}`).join(',');
      const productResult = await client.query(
        `SELECT p.*, m.name as manufacturer_name, m.address as manufacturer_address, 
                m.contact_email as manufacturer_contact_email
         FROM dpp_products p
         JOIN manufacturers m ON p.manufacturer_id = m.id
         WHERE p."productId" IN (${placeholders})`,
        productIdArray
      );
      
      if (productResult.rows.length === 0) {
        throw new Error("No products found for the provided IDs.");
      }

      // Get material compositions for all products
      const materialResult = await client.query(
        `SELECT product_id, material, percentage 
         FROM material_compositions 
         WHERE product_id IN (${placeholders})`,
        productIdArray
      );

      // Get hazardous substances for all products
      const hazardousResult = await client.query(
        `SELECT product_id, substance, cas_number as "casNumber", concentration 
         FROM hazardous_substances 
         WHERE product_id IN (${placeholders})`,
        productIdArray
      );

      // Group related data by product ID
      const materialsByProduct = materialResult.rows.reduce((acc: any, mc: any) => {
        if (!acc[mc.product_id]) acc[mc.product_id] = [];
        acc[mc.product_id].push({ material: mc.material, percentage: mc.percentage });
        return acc;
      }, {});

      const hazardousByProduct = hazardousResult.rows.reduce((acc: any, hs: any) => {
        if (!acc[hs.product_id]) acc[hs.product_id] = [];
        acc[hs.product_id].push({ 
          substance: hs.substance, 
          casNumber: hs.casNumber, 
          concentration: hs.concentration 
        });
        return acc;
      }, {});

      return productResult.rows.map((product: any) => ({
        productId: product.productId,
        productName: product.product_name,
        manufacturer: {
          name: product.manufacturer_name,
          address: product.manufacturer_address,
          contactEmail: product.manufacturer_contact_email,
        },
        dateOfManufacture: product.date_of_manufacture.toISOString().split('T')[0],
        placeOfManufacture: product.place_of_manufacture,
        productCategory: product.product_category,
        materialComposition: materialsByProduct[product.productId] || [],
        hazardousSubstances: hazardousByProduct[product.productId] || [],
        repairabilityScore: product.repairability_score,
        endOfLifeInstructions: product.end_of_life_instructions,
        digitalLink: product.digital_link,
      }));
    } finally {
      client.release();
    }
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
    const client = await this.pool.connect();
    
    try {
      const result = await client.query(
        'SELECT signature FROM dpp_products WHERE "productId" = $1',
        [productId]
      );
      
      if (result.rows.length === 0) {
        throw new Error(`Product with ID ${productId} not found.`);
      }
      
      return result.rows[0].signature || null;
    } finally {
      client.release();
    }
  }

  /**
   * Set the signature for a product by its ID.
   */
  private async setSignatureFromId(
    productId: string,
    signature: string
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      const checkResult = await client.query(
        'SELECT "productId" FROM dpp_products WHERE "productId" = $1',
        [productId]
      );
      
      if (checkResult.rows.length === 0) {
        throw new Error(`Product with ID ${productId} not found.`);
      }

      await client.query(
        'UPDATE dpp_products SET signature = $1, updated_at = CURRENT_TIMESTAMP WHERE "productId" = $2',
        [signature, productId]
      );
    } finally {
      client.release();
    }
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
