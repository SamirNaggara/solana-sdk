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

describe('Visibility Hash Check', () => {
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
    }, 10000); // Increase timeout to 10 seconds

    afterEach(async () => {
        // Cleanup if needed
    });

    it('should detect visibility changes in checkAuthenticityOnBlockchain', async () => {
        // Create a test product
        const productUid = uuidv4(); // Generate a valid UUID
        const testProduct = {
            productUid: productUid,
            info: {
                productId: productUid, // This field is required
                productName: 'Test Product Visibility',
                manufacturer: {
                    name: 'Test Manufacturer',
                    address: '123 Test Street',
                    contactEmail: 'test@test.com'
                },
                dateOfManufacture: '2024-01-01',
                placeOfManufacture: 'Test City',
                productCategory: 'Test Category',
                materialComposition: [
                    { material: 'Plastic', percentage: 50 },
                    { material: 'Metal', percentage: 50 }
                ],
                hazardousSubstances: [],
                repairabilityScore: 8.5,
                endOfLifeInstructions: 'Recycle properly',
                digitalLink: 'https://test.example.com'
            }
        };

        try {
            // 1. Create product
            const createdProduct = await sdk.createDppProduct(testProduct);
            expect(createdProduct.id).toBeDefined();

            // 2. Initial authenticity check (should pass)
            let authResult = await sdk.checkAuthenticityOnBlockchain(createdProduct.id);
            expect(authResult.isValid).toBe(true);

            // 3. Modify visibility (this should invalidate the hash)
            await sdk.updateProductVisibility('public', createdProduct.id, ['id', 'productName']);
            
            // 4. Check authenticity again (should fail because visibility changed)
            authResult = await sdk.checkAuthenticityOnBlockchain(createdProduct.id);
            expect(authResult.isValid).toBe(false);
            expect(authResult.reason).toBe('Public hash mismatch');

            // Cleanup
            await sdk.deleteDppProduct(createdProduct.id);
        } catch (error) {
            throw new Error(`Test failed: ${error.message}`);
        }
    });

    it('should correctly use visibility data from Prisma table', async () => {
        // Test that getProductVisibilityHashes uses the visibility table
        const productUid = uuidv4(); // Generate a valid UUID
        const testProduct = {
            productUid: productUid,
            info: {
                productId: productUid, // This field is required
                productName: 'Test Visibility Hashes',
                manufacturer: {
                    name: 'Test Manufacturer 2',
                    address: '456 Test Avenue',
                    contactEmail: 'test2@test.com'
                },
                dateOfManufacture: '2024-01-01',
                placeOfManufacture: 'Test City 2',
                productCategory: 'Test Category 2',
                materialComposition: [
                    { material: 'Glass', percentage: 100 }
                ],
                hazardousSubstances: [],
                repairabilityScore: 9.0,
                endOfLifeInstructions: 'Return to manufacturer',
                digitalLink: 'https://test2.example.com'
            }
        };

        try {
            // Create product with default visibility
            const createdProduct = await sdk.createDppProduct(testProduct);
            
            // Get initial hashes
            const initialHashes = await sdk.getProductVisibilityHashes(createdProduct.id);
            expect(initialHashes.publicHash).toBeDefined();
            expect(initialHashes.ownerHash).toBeDefined();
            expect(initialHashes.brandHash).toBeDefined();

            // Modify visibility settings
            await sdk.updateProductVisibility('public', createdProduct.id, ['id']);
            await sdk.updateProductVisibility('owner', createdProduct.id, ['id', 'productName']);
            
            // Get new hashes - they should be different
            const newHashes = await sdk.getProductVisibilityHashes(createdProduct.id);
            expect(newHashes.publicHash).not.toBe(initialHashes.publicHash);
            expect(newHashes.ownerHash).not.toBe(initialHashes.ownerHash);
            // Brand hash should be the same if we didn't change brand visibility
            expect(newHashes.brandHash).toBe(initialHashes.brandHash);

            // Cleanup
            await sdk.deleteDppProduct(createdProduct.id);
        } catch (error) {
            throw new Error(`Visibility hashes test failed: ${error.message}`);
        }
    });
});
