/**
 * Test de validation de la correction de getVisibilityHashes
 * Ce test vérifie que la fonction utilise maintenant correctement les données de visibilité de Prisma
 */

import { TokenManager } from '../client/src/token-manager';
import { Connection, PublicKey } from '@solana/web3.js';

// Mock Prisma client
const mockPrismaClient = {
    productDPP: {
        findUnique: jest.fn()
    }
};

describe('TokenManager Visibility Hash Fix', () => {
    let tokenManager: TokenManager;

    beforeEach(() => {
        const mockConnection = {} as Connection;
        const mockMint = new PublicKey("11111111111111111111111111111111");
        const mockOwner = new PublicKey("11111111111111111111111111111111");
        const mockHashAlgo = "sha256";

        tokenManager = new TokenManager(
            mockConnection,
            mockMint,
            mockOwner,
            mockHashAlgo,
            mockPrismaClient as any
        );
    });

    it('should use visibility data from Prisma table correctly', async () => {
        const productId = 'test-product-123';
        
        // Mock product data with visibility information
        const mockProduct = {
            id: productId,
            productName: 'Test Product',
            dateOfManufacture: new Date('2024-01-01'),
            placeOfManufacture: 'Test City',
            productCategory: 'Test Category',
            repairabilityScore: 8.5,
            endOfLifeInstructions: 'Recycle properly',
            digitalLink: 'https://test.com',
            manufacturerId: 'manufacturer-123',
            signature: 'test-signature',
            manufacturer: {
                name: 'Test Manufacturer',
                address: '123 Test St',
                contactEmail: 'test@test.com'
            },
            materialComposition: [
                { material: 'Plastic', percentage: 50 },
                { material: 'Metal', percentage: 50 }
            ],
            hazardousSubstances: [
                { substance: 'Lead', casNumber: '7439-92-1', concentration: 0.01 }
            ],
            extendedData: [{
                id: 'visibility-123',
                productId: productId,
                public: ['id'], // Only ID visible to public
                owner: ['id', 'productName'], // ID and name visible to owner
                brand: ['id', 'productName', 'manufacturer', 'materialComposition'] // More fields visible to brand
            }]
        };

        // Setup the mock
        mockPrismaClient.productDPP.findUnique.mockResolvedValue(mockProduct);

        // Call the private method through reflection (for testing purposes)
        const getVisibilityHashes = (tokenManager as any).getVisibilityHashes.bind(tokenManager);
        const result = await getVisibilityHashes(productId);

        // Verify the results
        expect(result).toBeDefined();
        expect(result.publicHash).toBeDefined();
        expect(result.ownerHash).toBeDefined();
        expect(result.brandHash).toBeDefined();

        // Verify that different visibility levels produce different hashes
        expect(result.publicHash).not.toBe(result.ownerHash);
        expect(result.ownerHash).not.toBe(result.brandHash);
        expect(result.publicHash).not.toBe(result.brandHash);

        // Verify Prisma was called correctly
        expect(mockPrismaClient.productDPP.findUnique).toHaveBeenCalledWith({
            where: { id: productId },
            include: {
                manufacturer: true,
                materialComposition: true,
                hazardousSubstances: true,
                extendedData: true
            }
        });
    });

    it('should handle empty visibility arrays correctly', async () => {
        const productId = 'test-product-empty';
        
        const mockProduct = {
            id: productId,
            productName: 'Test Product',
            dateOfManufacture: new Date('2024-01-01'),
            placeOfManufacture: 'Test City',
            productCategory: 'Test Category',
            repairabilityScore: 8.5,
            endOfLifeInstructions: 'Recycle properly',
            digitalLink: 'https://test.com',
            manufacturerId: 'manufacturer-123',
            signature: 'test-signature',
            manufacturer: {
                name: 'Test Manufacturer',
                address: '123 Test St',
                contactEmail: 'test@test.com'
            },
            materialComposition: [],
            hazardousSubstances: [],
            extendedData: [{
                id: 'visibility-empty',
                productId: productId,
                public: [], // Empty array
                owner: null, // Null value
                brand: ['id'] // Only ID
            }]
        };

        mockPrismaClient.productDPP.findUnique.mockResolvedValue(mockProduct);

        const getVisibilityHashes = (tokenManager as any).getVisibilityHashes.bind(tokenManager);
        const result = await getVisibilityHashes(productId);

        expect(result).toBeDefined();
        expect(result.publicHash).toBeDefined();
        expect(result.ownerHash).toBeDefined();
        expect(result.brandHash).toBeDefined();
    });

    it('should throw error when no visibility data exists', async () => {
        const productId = 'test-product-no-visibility';
        
        const mockProduct = {
            id: productId,
            productName: 'Test Product',
            dateOfManufacture: new Date('2024-01-01'),
            placeOfManufacture: 'Test City',
            productCategory: 'Test Category',
            repairabilityScore: 8.5,
            endOfLifeInstructions: 'Recycle properly',
            digitalLink: 'https://test.com',
            manufacturerId: 'manufacturer-123',
            signature: 'test-signature',
            manufacturer: {
                name: 'Test Manufacturer',
                address: '123 Test St',
                contactEmail: 'test@test.com'
            },
            materialComposition: [],
            hazardousSubstances: [],
            extendedData: [] // No visibility data
        };

        mockPrismaClient.productDPP.findUnique.mockResolvedValue(mockProduct);

        const getVisibilityHashes = (tokenManager as any).getVisibilityHashes.bind(tokenManager);
        
        await expect(getVisibilityHashes(productId)).rejects.toThrow(
            'No visibility data found for product ID test-product-no-visibility'
        );
    });

    it('should throw error when product does not exist', async () => {
        const productId = 'non-existent-product';
        
        mockPrismaClient.productDPP.findUnique.mockResolvedValue(null);

        const getVisibilityHashes = (tokenManager as any).getVisibilityHashes.bind(tokenManager);
        
        await expect(getVisibilityHashes(productId)).rejects.toThrow(
            'Product with ID non-existent-product not found.'
        );
    });
});
