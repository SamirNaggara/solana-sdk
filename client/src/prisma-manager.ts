import { PrismaClient } from "@prisma/client";
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';
import { ProductInput, CompleteProduct } from './types';

export class PrismaManager {
  private prisma: PrismaClient | null = null;
  private databaseUrl: string;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
  }

  /**
   * Sets up Prisma client and database schema.
   * @param databaseUrl - The URL of the database to connect to
   * @returns PrismaClient instance
   * @throws Error if Prisma setup fails
   */
  async setupPrisma(databaseUrl: string): Promise<PrismaClient> {
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
    
    // Store the connected client
    this.prisma = prisma;
    
    return prisma;
  }

  async init(): Promise<void> {
    if (!this.prisma) {
      this.prisma = await this.setupPrisma(this.databaseUrl);
    }
  }

  getPrisma(): PrismaClient {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call init() first.");
    }
    return this.prisma;
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
    const prisma = this.getPrisma();

    const existingManufacturer = await prisma.manufacturer.findFirst({
      where: {
        name: manufacturerData.name,
        contactEmail: manufacturerData.contactEmail
      }
    });

    if (existingManufacturer) {
      return existingManufacturer.id;
    }

    const newManufacturer = await prisma.manufacturer.create({
      data: manufacturerData
    });

    return newManufacturer.id;
  }

  /**
   * Creates a new product with all its relations in the database
   * @param productData - The product data to create
   * @returns The created product with all relations
   */
  async createProductWithRelations(productData: any): Promise<any> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call setupPrisma() first.");
    }

    const createData = await this.convertToCreateData(productData);
    
    return await this.prisma.productDPP.create({
      data: createData,
      include: {
        manufacturer: true,
        materialComposition: true,
        hazardousSubstances: true,
      },
    });
  }

  /**
   * Deletes a product and all its relations from the database
   * @param productId - The ID of the product to delete
   */
  async deleteProductWithRelations(productId: string): Promise<void> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call setupPrisma() first.");
    }

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
   * Converts ProductInput to Prisma create data format
   * @param productInput - ProductInput object containing product data
   * @returns Prisma create data object
   */
  async convertToCreateData(productInput: ProductInput) {
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
  async getFullProductData(productId: string): Promise<any | null> {
    const prisma = this.getPrisma();

    const product = await prisma.productDPP.findUnique({
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

  /**
   * Update product with all its relations
   * @param product - ProductInput object containing product data
   * @throws Error if Prisma client is not initialized
   */
  /**
   * Updates an existing product with its relations
   * @param productId - The ID of the product to update
   * @param updateData - The data to update
   * @returns The updated product with all relations
   */
  async updateProductById(productId: string, updateData: any): Promise<any> {
    if (!this.prisma) {
      throw new Error("Prisma client is not initialized. Call setupPrisma() first.");
    }

    const createData = await this.convertToCreateData(updateData);
    
    return await this.prisma.productDPP.update({
      where: { id: productId },
      data: createData,
      include: {
        manufacturer: true,
        materialComposition: true,
        hazardousSubstances: true,
      },
    });
  }

  /**
   * Legacy update method - keeps for compatibility
   */
  async updateProductWithRelations(product: ProductInput): Promise<void> {
    const prisma = this.getPrisma();

    const manufacturerId = await this.createOrFindManufacturer(product.info.manufacturer);

    await prisma.productDPP.update({
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
}
