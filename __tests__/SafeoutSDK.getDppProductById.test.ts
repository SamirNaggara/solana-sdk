import { SafeoutSDK } from '../client/class_safeout';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';

// Mock the createMint function to avoid the getMinimumBalanceForRentExemption issue
jest.mock('@solana/spl-token', () => {
    const actualModule = jest.requireActual('@solana/spl-token');
    return {
        ...actualModule,
        createMint: jest.fn().mockImplementation(async () => {
            // Return a mock PublicKey for the mint
            return new PublicKey('So11111111111111111111111111111111111111112');
        })
    };
});

describe('SafeoutSDK - getDppProductById', () => {
    let sdk: SafeoutSDK;
    let connection: Connection;
    let mintAuthority: PublicKey;
    let owner: PublicKey;

    beforeEach(async () => {
        connection = new Connection('https://api.devnet.solana.com', 'confirmed');
        mintAuthority = Keypair.generate().publicKey;
        owner = Keypair.generate().publicKey;
        
        sdk = new SafeoutSDK(connection, mintAuthority, owner);
        await sdk.init("postgresql://safeout:pide@localhost:4242/sdk-1?schema=public");
    }, 10000);

    afterEach(async () => {
        // Cleanup if needed
    });

    it('should return a complete product JSON with all sub-objects', async () => {
        // Create a test product first
        const productUid = uuidv4();
        const testProduct = {
            productUid: productUid,
            info: {
                productId: productUid,
                productName: 'Test Product for JSON Export',
                manufacturer: {
                    name: 'Test Manufacturer',
                    address: '123 Test Street',
                    contactEmail: 'test@test.com'
                },
                dateOfManufacture: '2024-01-01',
                placeOfManufacture: 'Test City',
                productCategory: 'Test Category',
                materialComposition: [
                    { material: 'Plastic', percentage: 60 },
                    { material: 'Metal', percentage: 40 }
                ],
                hazardousSubstances: [
                    { substance: 'Lead', casNumber: '7439-92-1', concentration: 0.1 }
                ],
                repairabilityScore: 8.5,
                endOfLifeInstructions: 'Recycle properly',
                digitalLink: 'https://test.example.com'
            }
        };

        let createdProductId: string | undefined;

        try {
            // Create the product
            const createdProduct = await sdk.createDppProduct(testProduct);
            createdProductId = createdProduct.id;
            expect(createdProduct.id).toBeDefined();

            // Test the getDppProductById function
            const completeProduct = await sdk.getDppProductById(createdProductId);

            // Verify the structure of the returned JSON
            expect(completeProduct).toHaveProperty('product');
            expect(completeProduct).toHaveProperty('manufacturer');
            expect(completeProduct).toHaveProperty('materialComposition');
            expect(completeProduct).toHaveProperty('hazardousSubstances');
            expect(completeProduct).toHaveProperty('history');
            expect(completeProduct).toHaveProperty('visibility');

            // Verify product data
            expect(completeProduct.product.id).toBe(createdProductId);
            expect(completeProduct.product.productName).toBe('Test Product for JSON Export');
            expect(completeProduct.product.productCategory).toBe('Test Category');
            expect(completeProduct.product.repairabilityScore).toBe(8.5);

            // Verify manufacturer data
            expect(completeProduct.manufacturer.name).toBe('Test Manufacturer');
            expect(completeProduct.manufacturer.address).toBe('123 Test Street');
            expect(completeProduct.manufacturer.contactEmail).toBe('test@test.com');

            // Verify material composition
            expect(completeProduct.materialComposition).toHaveLength(2);
            expect(completeProduct.materialComposition[0].material).toBe('Plastic');
            expect(completeProduct.materialComposition[0].percentage).toBe(60);
            expect(completeProduct.materialComposition[1].material).toBe('Metal');
            expect(completeProduct.materialComposition[1].percentage).toBe(40);

            // Verify hazardous substances
            expect(completeProduct.hazardousSubstances).toHaveLength(1);
            expect(completeProduct.hazardousSubstances[0].substance).toBe('Lead');
            expect(completeProduct.hazardousSubstances[0].casNumber).toBe('7439-92-1');
            expect(completeProduct.hazardousSubstances[0].concentration).toBe(0.1);

            // Verify history exists (should have at least the CREATE action)
            expect(completeProduct.history).toBeInstanceOf(Array);
            expect(completeProduct.history.length).toBeGreaterThan(0);
            expect(completeProduct.history[0].action).toBe('CREATE');

            // Verify visibility array exists
            expect(completeProduct.visibility).toBeInstanceOf(Array);

            console.log('Complete product JSON:', JSON.stringify(completeProduct, null, 2));

        } catch (error) {
            throw new Error(`Test failed: ${error.message}`);
        } finally {
            // Cleanup: delete the test product
            if (createdProductId) {
                try {
                    await sdk.deleteDppProduct(createdProductId);
                } catch (cleanupError) {
                    console.warn('Failed to cleanup test product:', cleanupError);
                }
            }
        }
    }, 15000); // 15 second timeout

    it('should throw error for non-existent product ID', async () => {
        const fakeProductId = uuidv4();
        
        await expect(sdk.getDppProductById(fakeProductId))
            .rejects.toThrow(`Product with ID ${fakeProductId} not found.`);
    });
});
