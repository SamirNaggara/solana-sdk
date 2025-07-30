import { SafeoutSDK } from '../client/class_safeout';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { PrismaClient } from '@prisma/client';

// Mock createMint to avoid blockchain issues
jest.mock('@solana/spl-token', () => {
    const actualModule = jest.requireActual('@solana/spl-token');
    return {
        ...actualModule,
        createMint: jest.fn().mockImplementation(async () => {
            return new PublicKey('So11111111111111111111111111111111111111112');
        })
    };
});

describe('SafeoutSDK - getDppProductById Integration Test', () => {
    let sdk: SafeoutSDK;
    let prisma: PrismaClient;
    let connection: Connection;
    let mintAuthority: PublicKey;
    let owner: PublicKey;

    beforeAll(async () => {
        prisma = new PrismaClient();
        connection = new Connection('https://api.devnet.solana.com', 'confirmed');
        mintAuthority = Keypair.generate().publicKey;
        owner = Keypair.generate().publicKey;
        sdk = new SafeoutSDK(connection, mintAuthority, owner);
        
        try {
            await sdk.init("postgresql://safeout:pide@localhost:4242/sdk-1?schema=public");
        } catch (error) {
            console.warn('Could not initialize SDK with database:', error.message);
            throw error;
        }
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('should create a product and retrieve its complete JSON structure', async () => {
        // Create a test product using the same pattern as working tests
        const testProductId = 'test-product-' + Date.now();
        const testManufacturerId = 'test-manufacturer-' + Date.now();
        
        // Create a test manufacturer first
        const testManufacturer = await prisma.manufacturer.create({
            data: {
                id: testManufacturerId,
                name: 'Test Manufacturer for JSON',
                address: '123 JSON Street',
                contactEmail: 'json@test.com'
            }
        });

        // Create a test product in the database
        const testProduct = await prisma.productDPP.create({
            data: {
                id: testProductId,
                productName: 'Test Product for JSON Export',
                dateOfManufacture: new Date('2024-01-01'),
                placeOfManufacture: 'Test City',
                productCategory: 'Test Category',
                repairabilityScore: 8.5,
                endOfLifeInstructions: 'Recycle properly',
                digitalLink: 'https://test.example.com',
                manufacturerId: testManufacturerId,
                signature: 'test-signature-12345'
            }
        });

        // Add some material composition
        await prisma.materialComposition.create({
            data: {
                material: 'Plastic',
                percentage: 60.0,
                productId: testProductId
            }
        });

        await prisma.materialComposition.create({
            data: {
                material: 'Metal',
                percentage: 40.0,
                productId: testProductId
            }
        });

        // Add some hazardous substances
        await prisma.hazardousSubstance.create({
            data: {
                substance: 'Lead',
                casNumber: '7439-92-1',
                concentration: 0.1,
                productId: testProductId
            }
        });

        // Create visibility data for the product
        await prisma.dppProductVisibility.create({
            data: {
                productId: testProductId,
                public: ['id', 'productName'],
                owner: ['id', 'productName', 'manufacturer'],
                brand: ['id', 'productName', 'manufacturer', 'dateOfManufacture']
            }
        });

        try {
            // Test our getDppProductById function
            const completeProduct = await sdk.getDppProductById(testProductId);

            // Verify the structure
            expect(completeProduct).toHaveProperty('product');
            expect(completeProduct).toHaveProperty('manufacturer');
            expect(completeProduct).toHaveProperty('materialComposition');
            expect(completeProduct).toHaveProperty('hazardousSubstances');
            expect(completeProduct).toHaveProperty('history');
            expect(completeProduct).toHaveProperty('visibility');

            // Verify product data
            expect(completeProduct.product.id).toBe(testProductId);
            expect(completeProduct.product.productName).toBe('Test Product for JSON Export');
            expect(completeProduct.product.productCategory).toBe('Test Category');
            expect(completeProduct.product.repairabilityScore).toBe(8.5);
            expect(completeProduct.product.signature).toBe('test-signature-12345');

            // Verify manufacturer data
            expect(completeProduct.manufacturer.name).toBe('Test Manufacturer for JSON');
            expect(completeProduct.manufacturer.address).toBe('123 JSON Street');
            expect(completeProduct.manufacturer.contactEmail).toBe('json@test.com');

            // Verify material composition
            expect(completeProduct.materialComposition).toHaveLength(2);
            const plastic = completeProduct.materialComposition.find(m => m.material === 'Plastic');
            expect(plastic.percentage).toBe(60);
            const metal = completeProduct.materialComposition.find(m => m.material === 'Metal');
            expect(metal.percentage).toBe(40);

            // Verify hazardous substances
            expect(completeProduct.hazardousSubstances).toHaveLength(1);
            expect(completeProduct.hazardousSubstances[0].substance).toBe('Lead');
            expect(completeProduct.hazardousSubstances[0].casNumber).toBe('7439-92-1');
            expect(completeProduct.hazardousSubstances[0].concentration).toBe(0.1);

            // Verify visibility data
            expect(completeProduct.visibility).toHaveLength(1);
            expect(completeProduct.visibility[0].public).toEqual(['id', 'productName']);
            expect(completeProduct.visibility[0].owner).toEqual(['id', 'productName', 'manufacturer']);
            expect(completeProduct.visibility[0].brand).toEqual(['id', 'productName', 'manufacturer', 'dateOfManufacture']);

            // Log the complete JSON for verification
            console.log('Complete Product JSON Structure:');
            console.log(JSON.stringify(completeProduct, null, 2));

        } finally {
            // Cleanup
            await prisma.materialComposition.deleteMany({
                where: { productId: testProductId }
            });
            await prisma.hazardousSubstance.deleteMany({
                where: { productId: testProductId }
            });
            await prisma.dppProductVisibility.deleteMany({
                where: { productId: testProductId }
            });
            await prisma.productDPP.delete({
                where: { id: testProductId }
            });
            await prisma.manufacturer.delete({
                where: { id: testManufacturerId }
            });
        }
    }, 15000); // 15 second timeout
});
