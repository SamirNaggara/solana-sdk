import { Client, Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ProductInput, CompleteProduct } from './types';

export class DatabaseManager {
  private pool: Pool;
  private databaseUrl: string;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
    this.pool = new Pool({
      connectionString: databaseUrl,
    });
  }

  /**
   * Initialize the database connection and run migrations
   */
  async init(): Promise<void> {
    try {
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT 1');
      client.release();
      console.log('Database connection established');

      // Auto-create schema if needed
      await this.ensureSchemaExists();
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Ensure database schema exists - auto-create tables if needed
   */
  private async ensureSchemaExists(): Promise<void> {
    try {
      console.log('🔧 Checking database schema...');

      const client = await this.pool.connect();

      // Check if main table exists
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = 'dpp_products'
        );
      `);

      if (!result.rows[0].exists) {
        console.log('📦 Creating database schema (first time setup)...');
        await this.createSchemaFromFile(client);
        console.log('✅ Database schema created successfully!');
      } else {
        console.log('✅ Database schema already exists');
      }

      client.release();
    } catch (error) {
      throw new Error(`Failed to create database schema: ${error instanceof Error ? error.message : String(error)}\n\nPlease ensure:\n- Your database user has CREATE privileges\n- The database server is accessible\n- The migration file exists at migrations/001_initial_schema.sql`);
    }
  }

  /**
   * Create the database schema by reading the SQL migration file
   */
  private async createSchemaFromFile(client: any): Promise<void> {
    try {
      const migrationPath = join(__dirname, '..', '..', 'migrations', '001_initial_schema.sql');
      const schemaSql = readFileSync(migrationPath, 'utf-8');
      await client.query(schemaSql);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error('Migration file not found at migrations/001_initial_schema.sql. Please ensure the migration file exists.');
      }
      throw error;
    }
  }

  /**
   * Get the database pool
   */
  getPool(): Pool {
    return this.pool;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Create or find a manufacturer in the database
   * @param manufacturerData - Manufacturer data to create or find
   * @returns The ID of the existing or newly created manufacturer
   */
  async createOrFindManufacturer(manufacturerData: {
    name: string;
    address: string;
    contactEmail: string;
  }): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      // Check if manufacturer exists
      const existingResult = await client.query(
        'SELECT id FROM manufacturers WHERE name = $1 AND contact_email = $2',
        [manufacturerData.name, manufacturerData.contactEmail]
      );

      if (existingResult.rows.length > 0) {
        return existingResult.rows[0].id;
      }

      // Create new manufacturer
      const newResult = await client.query(
        `INSERT INTO manufacturers (name, address, contact_email) 
         VALUES ($1, $2, $3) RETURNING id`,
        [manufacturerData.name, manufacturerData.address, manufacturerData.contactEmail]
      );

      return newResult.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Creates a new product with all its relations in the database
   * @param productData - The product data to create
   * @returns The created product with all relations
   */
  async createProductWithRelations(productData: any): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const manufacturerId = await this.createOrFindManufacturer({
        name: productData.info.manufacturer.name.value,
        address: productData.info.manufacturer.address.value,
        contactEmail: productData.info.manufacturer.contactEmail.value
      });

      // Create the main product
      const productResult = await client.query(
        `INSERT INTO dpp_products 
         ("productId", product_name, date_of_manufacture, place_of_manufacture, 
          product_category, repairability_score, end_of_life_instructions, 
          digital_link, manufacturer_id, signature)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          productData.productUid,
          productData.info.productName.value,
          new Date(productData.info.dateOfManufacture.value),
          productData.info.placeOfManufacture.value,
          productData.info.productCategory.value,
          productData.info.repairabilityScore.value,
          productData.info.endOfLifeInstructions.value,
          productData.info.digitalLink.value,
          manufacturerId,
          productData.info.signature.value
        ]
      );

      const product = productResult.rows[0];

      // Create material compositions
      for (const mc of productData.info.materialComposition) {
        await client.query(
          'INSERT INTO material_compositions (material, percentage, product_id) VALUES ($1, $2, $3)',
          [mc.material.value, mc.percentage.value, product.productId]
        );
      }

      // Create hazardous substances
      for (const hs of productData.info.hazardousSubstances) {
        await client.query(
          'INSERT INTO hazardous_substances (substance, cas_number, concentration, product_id) VALUES ($1, $2, $3, $4)',
          [hs.substance.value, hs.casNumber.value, hs.concentration.value, product.productId]
        );
      }

      // Create visibility record
      const brandData = [
        "id",
        "productName", 
        "dateOfManufacture",
        "placeOfManufacture",
        "productCategory",
        "repairabilityScore",
        "endOfLifeInstructions",
        "digitalLink",
        "manufacturerId"
      ];

      await client.query(
        'INSERT INTO dpp_product_visibility (product_id, public, owner, brand) VALUES ($1, $2, $3, $4)',
        [product.productId, null, null, JSON.stringify(brandData)]
      );

      await client.query('COMMIT');
      
      // Return the complete product data
      return await this.getFullProductData(product.productId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Deletes a product and all its relations from the database
   * @param productId - The ID of the product to delete
   */
  async deleteProductWithRelations(productId: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Delete material compositions
      await client.query('DELETE FROM material_compositions WHERE product_id = $1', [productId]);
      
      // Delete hazardous substances
      await client.query('DELETE FROM hazardous_substances WHERE product_id = $1', [productId]);
      
      // Delete the product (visibility and history are handled by CASCADE)
      await client.query('DELETE FROM dpp_products WHERE "productId" = $1', [productId]);

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get full product data including relations
   * @param productId - The ID of the product to retrieve
   * @returns CompleteProduct object or null if not found
   */
  async getFullProductData(productId: string): Promise<any | null> {
    const client = await this.pool.connect();
    
    try {
      // Get main product data with manufacturer
      const productResult = await client.query(
        `SELECT p.*, m.name as manufacturer_name, m.address as manufacturer_address, 
                m.contact_email as manufacturer_contact_email
         FROM dpp_products p
         JOIN manufacturers m ON p.manufacturer_id = m.id
         WHERE p."productId" = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        return null;
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

      return {
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
    } finally {
      client.release();
    }
  }

  /**
   * Updates an existing product with its relations
   * @param productId - The ID of the product to update
   * @param updateData - The data to update
   * @returns The updated product with all relations
   */
  async updateProductById(productId: string, updateData: any): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const manufacturerId = await this.createOrFindManufacturer(updateData.info.manufacturer);

      // Update the main product
      await client.query(
        `UPDATE dpp_products SET 
         product_name = $1, date_of_manufacture = $2, place_of_manufacture = $3,
         product_category = $4, repairability_score = $5, end_of_life_instructions = $6,
         digital_link = $7, manufacturer_id = $8, updated_at = CURRENT_TIMESTAMP
         WHERE "productId" = $9`,
        [
          updateData.info.productName,
          new Date(updateData.info.dateOfManufacture),
          updateData.info.placeOfManufacture,
          updateData.info.productCategory,
          updateData.info.repairabilityScore,
          updateData.info.endOfLifeInstructions,
          updateData.info.digitalLink,
          manufacturerId,
          productId
        ]
      );

      // Delete existing material compositions and hazardous substances
      await client.query('DELETE FROM material_compositions WHERE product_id = $1', [productId]);
      await client.query('DELETE FROM hazardous_substances WHERE product_id = $1', [productId]);

      // Create new material compositions
      for (const mc of updateData.info.materialComposition) {
        await client.query(
          'INSERT INTO material_compositions (material, percentage, product_id) VALUES ($1, $2, $3)',
          [mc.material, mc.percentage, productId]
        );
      }

      // Create new hazardous substances
      for (const hs of updateData.info.hazardousSubstances) {
        await client.query(
          'INSERT INTO hazardous_substances (substance, cas_number, concentration, product_id) VALUES ($1, $2, $3, $4)',
          [hs.substance, hs.casNumber, hs.concentration, productId]
        );
      }

      await client.query('COMMIT');
      
      return await this.getFullProductData(productId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Updates the visibility data for a product
   * @param type - The type of data to update: "public", "owner", or "brand"
   * @param productId - The ID of the product
   * @param data - The JSON data to set
   * @returns The updated visibility record
   */
  async updateProductVisibility(
    type: "public" | "owner" | "brand", 
    productId: string, 
    data: any
  ): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      // Check if visibility record exists
      const existingResult = await client.query(
        'SELECT id FROM dpp_product_visibility WHERE product_id = $1',
        [productId]
      );

      if (existingResult.rows.length === 0) {
        throw new Error(`No visibility record found for product ID: ${productId}`);
      }

      const visibilityId = existingResult.rows[0].id;

      // Update the specific field
      const updateQuery = `UPDATE dpp_product_visibility SET ${type} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`;
      const result = await client.query(updateQuery, [JSON.stringify(data), visibilityId]);
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Update product signature
   * @param productId - The ID of the product
   * @param signature - The signature to set
   */
  async updateProductSignature(productId: string, signature: string): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        'UPDATE dpp_products SET signature = $1, updated_at = CURRENT_TIMESTAMP WHERE "productId" = $2',
        [signature, productId]
      );
    } finally {
      client.release();
    }
  }
}
