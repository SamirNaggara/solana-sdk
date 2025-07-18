// Mock the managers
jest.mock('../client/src/prisma-manager');
jest.mock('../client/src/token-manager');
jest.mock('../client/src/mint-manager');
jest.mock('../client/src/history-manager');
jest.mock('../client/src/validation');

import { PrismaManager } from '../client/src/prisma-manager';
import { TokenManager } from '../client/src/token-manager';
import { MintManager } from '../client/src/mint-manager';
import { HistoryManager } from '../client/src/history-manager';
import { ValidationUtils } from '../client/src/validation';

// Configure mocks
const mockPrismaManager = {
    setupPrisma: jest.fn(),
    getPrisma: jest.fn(),
    createProductWithRelations: jest.fn(),
    getFullProductData: jest.fn(),
    updateProductWithRelations: jest.fn(),
    updateProductById: jest.fn(),
    deleteProduct: jest.fn(),
    deleteProductWithRelations: jest.fn(),
    deleteMultipleProducts: jest.fn(),
    findExistingManufacturer: jest.fn(),
    createManufacturer: jest.fn(),
    init: jest.fn()
};

const mockTokenManager = {
    createMintToken: jest.fn(),
    batchMintToken: jest.fn(),
    updateMintToken: jest.fn(),
    checkAuthenticityOnBlockchain: jest.fn(),
    getMetadataFromId: jest.fn(),
    getMetadataFromIdArray: jest.fn(),
    getMemoFromSignature: jest.fn(),
    hashObject: jest.fn(),
    init: jest.fn()
};

const mockMintManager = {
    initializeMint: jest.fn(),
    getMintPublicKey: jest.fn(),
    init: jest.fn()
};

const mockHistoryManager = {
    recordProductHistory: jest.fn(),
    recordBatchHistory: jest.fn(),
    getAllProductHistory: jest.fn(),
    getProductHistoryByAction: jest.fn(),
    getProductHistoryByUser: jest.fn(),
    getProductHistoryByDateRange: jest.fn(),
    getProductHistoryStats: jest.fn(),
    init: jest.fn()
};

const mockValidationUtils = {
    validateProductData: jest.fn(),
    normalizeUserName: jest.fn()
};

// Apply mocks
(PrismaManager as jest.Mock).mockImplementation(() => mockPrismaManager);
(TokenManager as jest.Mock).mockImplementation(() => mockTokenManager);
(MintManager as jest.Mock).mockImplementation(() => mockMintManager);
(HistoryManager as jest.Mock).mockImplementation(() => mockHistoryManager);
(ValidationUtils as any).validateProductData = mockValidationUtils.validateProductData;
(ValidationUtils as any).normalizeUserName = mockValidationUtils.normalizeUserName;

import { SafeoutSDK, ProductInput } from '../client/class_safeout';
import { PublicKey, Connection } from '@solana/web3.js';
import { z } from 'zod';

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const mintAuthority = new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1");
const owner = new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ");

describe('SafeoutSDK', () => {
    let sdk: SafeoutSDK;

    beforeEach(async () => {
        jest.clearAllMocks();
        
        // Mock de la variable d'environnement pour les tests
        process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
        
        // Reset all mocks to default behavior
        mockMintManager.initializeMint.mockResolvedValue(new PublicKey("7aoAZMkrDLsrSW6UWWRMMJSJgmPteTMiMNoQw1xYkjLp"));
        mockPrismaManager.init.mockResolvedValue(undefined);
        mockTokenManager.init.mockResolvedValue(undefined);
        mockHistoryManager.init.mockResolvedValue(undefined);
        mockValidationUtils.normalizeUserName.mockImplementation((name?: string) => name?.trim() || 'system');
        
        // Create new SDK instance
        sdk = new SafeoutSDK(connection, mintAuthority, owner);
        await sdk.init();
    });

    describe('Product Validation with Zod Schema', () => {
        it('should validate product data successfully with correct format', async () => {
        const productData = {
            productUid: '550e8400-e29b-41d4-a716-446655440000',
            info: {
                productId: '550e8400-e29b-41d4-a716-446655440000',
                productName: 'Test Product',
                manufacturer: {
                    name: 'Test Manufacturer',
                    address: '123 Main St',
                    contactEmail: 'test@example.com'
                },
                dateOfManufacture: '2023-01-01',
                placeOfManufacture: 'Test Location',
                productCategory: 'Electronics',
                materialComposition: [
                    { material: 'Plastic', percentage: 60 },
                    { material: 'Metal', percentage: 40 }
                ],
                hazardousSubstances: [
                    { 
                        substance: 'Lead', 
                        casNumber: '7439-92-1',
                        concentration: 0.1 
                    }
                ],
                endOfLifeInstructions: 'Recycle at authorized e-waste facility',
                digitalLink: 'https://example.com/product/550e8400-e29b-41d4-a716-446655440000'
            }
        };            const mockResult = { id: productData.productUid };
            const expectedResult = {
                ...mockResult,
                signature: 'tx123',
                hash: 'hash123'
            };
            
            // Setup mocks
            mockValidationUtils.validateProductData.mockReturnValue(productData.info);
            mockPrismaManager.getPrisma.mockReturnValue({
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null)
                }
            });
            mockPrismaManager.createProductWithRelations.mockResolvedValue(mockResult);
            mockTokenManager.createMintToken.mockResolvedValue({
                signature: 'tx123',
                hash: 'hash123',
            });
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.createDppProduct(productData);

            expect(mockValidationUtils.validateProductData).toHaveBeenCalledWith(productData.info);
            expect(result).toEqual(expectedResult);
        });
    });

    describe('createDppProduct with Relations and History', () => {
        it('should create a new product with all relations and record history', async () => {
            const product = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    productName: 'Test Product',
                    manufacturer: {
                        name: 'Test Manufacturer',
                        address: 'Test Address',
                        contactEmail: 'test@example.com'
                    },
                    dateOfManufacture: '2024-01-15',
                    placeOfManufacture: 'Test City',
                    productCategory: 'Electronics',
                    materialComposition: [
                        { material: 'Plastic', percentage: 50 },
                        { material: 'Metal', percentage: 50 }
                    ],
                    hazardousSubstances: [
                        { 
                            substance: 'Lead', 
                            casNumber: '7439-92-1',
                            concentration: 0.1 
                        }
                    ],
                    endOfLifeInstructions: 'Recycle at authorized center',
                    digitalLink: 'https://example.com/product/123'
                }
            };

            const mockResult = { id: product.productUid };
            const expectedResult = {
                ...mockResult,
                signature: 'tx123',
                hash: 'hash123'
            };
            
            // Setup mocks
            mockValidationUtils.validateProductData.mockReturnValue(product.info);
            mockPrismaManager.getPrisma.mockReturnValue({
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null)
                }
            });
            mockPrismaManager.createProductWithRelations.mockResolvedValue(mockResult);
            mockTokenManager.createMintToken.mockResolvedValue({
                signature: 'tx123',
                hash: 'hash123',
            });
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.createDppProduct(product);

            expect(mockTokenManager.createMintToken).toHaveBeenCalledWith(product.productUid);
            expect(mockHistoryManager.recordProductHistory).toHaveBeenCalled();
            expect(result).toEqual(expectedResult);
        });

        it('should throw error if product already exists', async () => {
            const product = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    productName: 'Test Product',
                    manufacturer: {
                        name: 'Test Manufacturer',
                        address: 'Test Address',
                        contactEmail: 'test@example.com'
                    },
                    dateOfManufacture: '2023-01-01',
                    placeOfManufacture: 'Test Location',
                    productCategory: 'Electronics',
                    materialComposition: [
                        { material: 'Plastic', percentage: 100 }
                    ],
                    hazardousSubstances: [],
                    endOfLifeInstructions: 'Recycle properly according to local regulations',
                    digitalLink: 'https://example.com/product/test'
                }
            };

            mockValidationUtils.validateProductData.mockReturnValue(product.info);
            mockPrismaManager.getPrisma.mockReturnValue({
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ id: product.productUid })
                }
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(
                'Product with ID 550e8400-e29b-41d4-a716-446655440000 already exists.'
            );
        });

        it('should reuse existing manufacturer if found', async () => {
            const product = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    productName: 'Test Product',
                    manufacturer: {
                        name: 'Existing Manufacturer',
                        address: 'Test Address',
                        contactEmail: 'test@example.com'
                    },
                    dateOfManufacture: '2023-01-01',
                    placeOfManufacture: 'Test Location',
                    productCategory: 'Electronics',
                    materialComposition: [
                        { material: 'Plastic', percentage: 100 }
                    ],
                    hazardousSubstances: [],
                    endOfLifeInstructions: 'Recycle properly according to local regulations',
                    digitalLink: 'https://example.com/product/test'
                }
            };

            const mockResult = { id: product.productUid };
            const expectedResult = {
                ...mockResult,
                signature: 'tx123',
                hash: 'hash123'
            };
            
            mockValidationUtils.validateProductData.mockReturnValue(product.info);
            mockPrismaManager.getPrisma.mockReturnValue({
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null)
                }
            });
            mockPrismaManager.createProductWithRelations.mockResolvedValue(mockResult);
            mockTokenManager.createMintToken.mockResolvedValue({
                signature: 'tx123',
                hash: 'hash123',
            });
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.createDppProduct(product);
            expect(result).toEqual(expectedResult);
        });
    });

    describe('createBatchDppProducts', () => {
        it('should create multiple products and record batch history', async () => {
            const products = [
                {
                    productUid: '550e8400-e29b-41d4-a716-446655440001',
                    info: {
                        productId: '550e8400-e29b-41d4-a716-446655440001',
                        productName: 'Product 1',
                        manufacturer: { name: 'Manufacturer 1', address: 'Address 1', contactEmail: 'contact1@example.com' },
                        dateOfManufacture: '2024-01-15',
                        placeOfManufacture: 'City 1',
                        productCategory: 'Electronics',
                        materialComposition: [{ material: 'Plastic', percentage: 100 }],
                        hazardousSubstances: [],
                        endOfLifeInstructions: 'Recycle',
                        digitalLink: 'https://example.com/1'
                    }
                },
                {
                    productUid: '550e8400-e29b-41d4-a716-446655440002',
                    info: {
                        productId: '550e8400-e29b-41d4-a716-446655440002',
                        productName: 'Product 2',
                        manufacturer: { name: 'Manufacturer 2', address: 'Address 2', contactEmail: 'contact2@example.com' },
                        dateOfManufacture: '2024-01-16',
                        placeOfManufacture: 'City 2',
                        productCategory: 'Textiles',
                        materialComposition: [{ material: 'Cotton', percentage: 100 }],
                        hazardousSubstances: [],
                        endOfLifeInstructions: 'Compost',
                        digitalLink: 'https://example.com/2'
                    }
                }
            ];

            // Setup validation mocks
            mockValidationUtils.validateProductData.mockImplementation((product: any) => product);
            
            // Setup database mocks
            mockPrismaManager.getPrisma.mockReturnValue({
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null)
                }
            });
            mockPrismaManager.createProductWithRelations.mockImplementation((product: any) => 
                Promise.resolve({ id: product.productUid })
            );
            
            // Setup blockchain mocks
            mockTokenManager.batchMintToken.mockResolvedValue([
                { productUid: products[0].productUid, signature: 'tx1', hash: 'hash1' },
                { productUid: products[1].productUid, signature: 'tx2', hash: 'hash2' }
            ]);
            
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.createBatchDppProducts(products);

            expect(mockTokenManager.batchMintToken).toHaveBeenCalled();
            expect(mockHistoryManager.recordProductHistory).toHaveBeenCalledTimes(2);
            expect(result).toHaveLength(2);
        });

        it('should handle errors during batch creation gracefully', async () => {
            const products = [
                {
                    productUid: '550e8400-e29b-41d4-a716-446655440001',
                    info: {
                        productId: '550e8400-e29b-41d4-a716-446655440001',
                        productName: 'Product 1',
                        manufacturer: { name: 'Manufacturer 1', address: 'Address 1', contactEmail: 'contact1@example.com' },
                        dateOfManufacture: '2024-01-15',
                        placeOfManufacture: 'City 1',
                        productCategory: 'Electronics',
                        materialComposition: [{ material: 'Plastic', percentage: 100 }],
                        hazardousSubstances: [],
                        endOfLifeInstructions: 'Recycle',
                        digitalLink: 'https://example.com/1'
                    }
                }
            ];

            mockValidationUtils.validateProductData.mockImplementation((product: any) => product);
            mockPrismaManager.createProductWithRelations.mockRejectedValue(new Error('Database error'));

            await expect(sdk.createBatchDppProducts(products)).rejects.toThrow('Database error');
        });
    });

    describe('updateDppProduct', () => {
        it('should update product with relations and record history', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const updateData: Partial<ProductInput> = { 
                productUid: productId
            };            const existingProduct = { id: productId, productName: 'Old Name' };
            const updatedProduct = { id: productId, productName: 'Updated Product Name' };
            const expectedResult = {
                ...updatedProduct,
                signature: 'update-tx123',
                hash: 'update-hash123'
            };

            mockPrismaManager.getFullProductData.mockResolvedValue(existingProduct);
            mockValidationUtils.validateProductData.mockReturnValue(updateData);
            mockPrismaManager.updateProductById.mockResolvedValue(updatedProduct);
            mockTokenManager.updateMintToken.mockResolvedValue({
                signature: 'update-tx123',
                hash: 'update-hash123'
            });
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.updateDppProduct(productId, updateData);

            expect(mockPrismaManager.getFullProductData).toHaveBeenCalledWith(productId);
            expect(mockTokenManager.updateMintToken).toHaveBeenCalled();
            expect(mockHistoryManager.recordProductHistory).toHaveBeenCalled();
            expect(result).toEqual(expectedResult);
        });

        it('should throw error when product does not exist', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const updateData: Partial<ProductInput> = { productUid: productId };

            mockPrismaManager.getFullProductData.mockResolvedValue(null);

            await expect(sdk.updateDppProduct(productId, updateData)).rejects.toThrow(
                'Product with ID 550e8400-e29b-41d4-a716-446655440000 not found.'
            );
        });
    });

    describe('updateBatchDppProducts', () => {
        it('should handle mix of new and existing products with history', async () => {
            const updates = [
                {
                    productId: '550e8400-e29b-41d4-a716-446655440001',
                    updateData: { productUid: '550e8400-e29b-41d4-a716-446655440001' } as Partial<ProductInput>
                },
                {
                    productId: '550e8400-e29b-41d4-a716-446655440002',
                    updateData: { productUid: '550e8400-e29b-41d4-a716-446655440002' } as Partial<ProductInput>
                }
            ];

            mockValidationUtils.normalizeUserName.mockReturnValue('test-user');
            mockPrismaManager.getFullProductData.mockImplementation((id: string) => 
                Promise.resolve({ id, productName: 'Original Name' })
            );
            mockValidationUtils.validateProductData.mockImplementation((data: any) => data);
            mockPrismaManager.updateProductById.mockImplementation((id: string, data: any) => 
                Promise.resolve({ id, productName: 'Updated Name' })
            );
            mockTokenManager.updateMintToken.mockResolvedValue({
                signature: 'update-tx',
                hash: 'update-hash'
            });
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.updateBatchDppProducts(updates, 'test-user');

            expect(result).toHaveLength(2);
            expect(mockHistoryManager.recordProductHistory).toHaveBeenCalledTimes(2);
        });
    });

    describe('Product Deletion with History', () => {
        it('should delete product and record history', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const existingProduct = { id: productId, productName: 'Test Product' };

            mockPrismaManager.getFullProductData.mockResolvedValue(existingProduct);
            mockPrismaManager.deleteProductWithRelations.mockResolvedValue(undefined);
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.deleteDppProduct(productId);

            expect(mockPrismaManager.getFullProductData).toHaveBeenCalledWith(productId);
            expect(mockHistoryManager.recordProductHistory).toHaveBeenCalled();
            expect(result).toBeUndefined();
        });
    });

    describe('Batch Product Deletion', () => {
        it('should delete multiple products and record batch history', async () => {
            const productIds = [
                '550e8400-e29b-41d4-a716-446655440001',
                '550e8400-e29b-41d4-a716-446655440002'
            ];

            const existingProducts = [
                { id: productIds[0], productName: 'Product 1' },
                { id: productIds[1], productName: 'Product 2' }
            ];

            mockPrismaManager.getFullProductData.mockImplementation((id: string) => {
                const product = existingProducts.find(p => p.id === id);
                return Promise.resolve(product || null);
            });
            
            // Mock Prisma client for batch operations
            const mockPrismaClient = {
                $transaction: jest.fn().mockResolvedValue(undefined),
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({ count: 2 })
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({ count: 1 })
                },
                productDPP: {
                    deleteMany: jest.fn().mockResolvedValue({ count: 2 })
                }
            };
            mockPrismaManager.getPrisma.mockReturnValue(mockPrismaClient);
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.deleteBatchDppProducts(productIds);

            expect(result).toBeUndefined();
            expect(mockHistoryManager.recordProductHistory).toHaveBeenCalledTimes(2);
        });

        it('should handle non-existent products gracefully', async () => {
            const productIds = ['non-existent-id'];

            mockPrismaManager.getFullProductData.mockResolvedValue(null);

            await expect(sdk.deleteBatchDppProducts(productIds)).rejects.toThrow('No valid products found to delete.');
        });
    });

    describe('History Management Functions', () => {
        it('should get product history with pagination', async () => {
            const historyData = [{
                id: 'hist-1',
                productId: '550e8400-e29b-41d4-a716-446655440000',
                action: 'CREATE',
                changeTimestamp: new Date('2024-01-15T10:00:00.000Z'),
                changedBy: 'user1',
                changeDescription: 'Product created'
            }];

            mockHistoryManager.getAllProductHistory.mockResolvedValue({
                history: historyData,
                total: 1,
                totalPages: 1
            });

            const result = await sdk.getAllProductHistory(1, 10);

            expect(result).toEqual({
                history: historyData,
                total: 1,
                totalPages: 1
            });
        });

        it('should get history filtered by action type', async () => {
            const historyData = [{
                id: 'hist-1',
                action: 'CREATE',
                changeTimestamp: new Date('2024-01-15T10:00:00.000Z'),
                changedBy: 'user1'
            }];

            mockHistoryManager.getProductHistoryByAction.mockResolvedValue({
                history: historyData
            });

            const result = await sdk.getProductHistoryByAction('CREATE');

            expect(result.history).toEqual(historyData);
        });

        it('should get history filtered by user', async () => {
            const historyData = [{
                id: 'hist-1',
                action: 'UPDATE',
                changeTimestamp: new Date('2024-01-15T10:00:00.000Z'),
                changedBy: 'test-user'
            }];

            mockHistoryManager.getProductHistoryByUser.mockResolvedValue({
                history: historyData
            });

            const result = await sdk.getProductHistoryByUser('test-user');

            expect(result.history).toEqual(historyData);
        });

        it('should get history within date range', async () => {
            const startDate = new Date('2024-01-15');
            const endDate = new Date('2024-01-16');
            const historyData = [{
                id: 'hist-1',
                changeTimestamp: new Date('2024-01-15T10:00:00.000Z')
            }];

            mockHistoryManager.getProductHistoryByDateRange.mockResolvedValue({
                history: historyData
            });

            const result = await sdk.getProductHistoryByDateRange(startDate, endDate);

            expect(result.history).toEqual(historyData);
        });

        it('should get comprehensive history statistics', async () => {
            const statsData = {
                totalOperations: 100,
                createCount: 30,
                updateCount: 50,
                deleteCount: 20,
                productsWithHistory: 75,
                mostActiveProduct: {
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    operationCount: 15
                }
            };

            mockHistoryManager.getProductHistoryStats.mockResolvedValue(statsData);

            const result = await sdk.getProductHistoryStats();

            expect(result).toEqual(statsData);
        });
    });

    describe('Blockchain Authenticity Verification', () => {
        it('should return isValid: true if hash matches blockchain', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';

            mockTokenManager.checkAuthenticityOnBlockchain.mockResolvedValue({
                isValid: true,
                reason: 'Hash verified successfully'
            });

            const result = await sdk.checkAuthenticityOnBlockchain(productId);

            expect(result.isValid).toBe(true);
            expect(result.reason).toBe('Hash verified successfully');
        });

        it('should return isValid: false if hash does not match blockchain', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';

            mockTokenManager.checkAuthenticityOnBlockchain.mockResolvedValue({
                isValid: false,
                reason: 'Hash mismatch detected'
            });

            const result = await sdk.checkAuthenticityOnBlockchain(productId);

            expect(result.isValid).toBe(false);
            expect(result.reason).toBe('Hash mismatch detected');
        });
    });

    describe('Manufacturer Management', () => {
        it('should create product with manufacturer information', async () => {
            const product = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    productName: 'Test Product',
                    manufacturer: {
                        name: 'New Manufacturer',
                        address: 'New Address',
                        contactEmail: 'new@example.com'
                    },
                    dateOfManufacture: '2023-01-01',
                    placeOfManufacture: 'Test Location',
                    productCategory: 'Electronics',
                    materialComposition: [
                        { material: 'Plastic', percentage: 100 }
                    ],
                    hazardousSubstances: [],
                    endOfLifeInstructions: 'Recycle properly according to local regulations',
                    digitalLink: 'https://example.com/product/test'
                }
            };

            // Test the product creation with manufacturer
            mockValidationUtils.validateProductData.mockReturnValue(product.info);
            mockPrismaManager.getPrisma.mockReturnValue({
                productDPP: { findUnique: jest.fn().mockResolvedValue(null) }
            });
            mockPrismaManager.createProductWithRelations.mockResolvedValue({ 
                id: product.productUid,
                manufacturer: product.info.manufacturer 
            });
            mockTokenManager.createMintToken.mockResolvedValue({ signature: 'tx', hash: 'hash' });
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.createDppProduct(product);

            // Verify manufacturer information is preserved
            expect(mockPrismaManager.createProductWithRelations).toHaveBeenCalledWith(product);
            expect(result.signature).toBeDefined();
        });

        it('should handle product creation with different manufacturer', async () => {
            const product = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    productName: 'Test Product',
                    manufacturer: {
                        name: 'Different Manufacturer',
                        address: 'Different Address',
                        contactEmail: 'different@example.com'
                    },
                    dateOfManufacture: '2023-01-01',
                    placeOfManufacture: 'Test Location',
                    productCategory: 'Electronics',
                    materialComposition: [
                        { material: 'Plastic', percentage: 100 }
                    ],
                    hazardousSubstances: [],
                    endOfLifeInstructions: 'Recycle properly according to local regulations',
                    digitalLink: 'https://example.com/product/test'
                }
            };

            // Test through public interface
            mockValidationUtils.validateProductData.mockReturnValue(product.info);
            mockPrismaManager.getPrisma.mockReturnValue({
                productDPP: { findUnique: jest.fn().mockResolvedValue(null) }
            });
            mockPrismaManager.createProductWithRelations.mockResolvedValue({ 
                id: product.productUid,
                manufacturer: product.info.manufacturer 
            });
            mockTokenManager.createMintToken.mockResolvedValue({ signature: 'tx', hash: 'hash' });
            mockHistoryManager.recordProductHistory.mockResolvedValue(undefined);

            await sdk.createDppProduct(product);

            expect(mockPrismaManager.createProductWithRelations).toHaveBeenCalledWith(product);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle database connection errors gracefully', async () => {
            const product = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    productName: 'Test Product',
                    manufacturer: {
                        name: 'Test Manufacturer',
                        address: 'Test Address',
                        contactEmail: 'test@example.com'
                    },
                    dateOfManufacture: '2023-01-01',
                    placeOfManufacture: 'Test Location',
                    productCategory: 'Electronics',
                    materialComposition: [
                        { material: 'Plastic', percentage: 100 }
                    ],
                    hazardousSubstances: [],
                    endOfLifeInstructions: 'Recycle properly according to local regulations',
                    digitalLink: 'https://example.com/product/test'
                }
            };

            mockValidationUtils.validateProductData.mockReturnValue(product.info);
            mockPrismaManager.createProductWithRelations.mockRejectedValue(new Error('Database connection failed'));

            await expect(sdk.createDppProduct(product)).rejects.toThrow('Database connection failed');
        });

        it('should handle empty batch operations correctly', async () => {
            const emptyProducts: any[] = [];

            const result = await sdk.createBatchDppProducts(emptyProducts);
            expect(result).toEqual([]);
        });
    });
});
