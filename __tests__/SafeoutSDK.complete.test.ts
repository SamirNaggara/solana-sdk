import { SafeoutSDK, ProductInput } from '../client/class_safeout';
import { PublicKey, Connection } from '@solana/web3.js';
import { z } from 'zod';

// Mock tous les managers
jest.mock('../client/src/prisma-manager', () => {
    return {
        PrismaManager: jest.fn().mockImplementation(() => ({
            init: jest.fn().mockResolvedValue(undefined),
            setupPrisma: jest.fn().mockResolvedValue({
                productDPP: {
                    findUnique: jest.fn(),
                    findMany: jest.fn(),
                    create: jest.fn(),
                    update: jest.fn(),
                    delete: jest.fn(),
                    deleteMany: jest.fn(),
                },
                dppProductHistory: {
                    findMany: jest.fn(),
                    count: jest.fn(),
                    create: jest.fn(),
                    groupBy: jest.fn(),
                },
                manufacturer: {
                    findFirst: jest.fn(),
                    create: jest.fn(),
                },
                materialComposition: {
                    deleteMany: jest.fn(),
                    createMany: jest.fn(),
                },
                hazardousSubstance: {
                    deleteMany: jest.fn(),
                    createMany: jest.fn(),
                },
                $transaction: jest.fn(),
                $connect: jest.fn(),
            }),
            createProductWithRelations: jest.fn(),
            updateProductById: jest.fn(),
            deleteProductWithRelations: jest.fn(),
            getFullProductData: jest.fn(),
            getPrisma: jest.fn(),
        }))
    };
});

jest.mock('../client/src/mint-manager', () => {
    return {
        MintManager: jest.fn().mockImplementation(() => ({
            initializeMint: jest.fn().mockResolvedValue(new PublicKey("7aoAZMkrDLsrSW6UWWRMMJSJgmPteTMiMNoQw1xYkjLp")),
            checkAndTopUpBalance: jest.fn().mockResolvedValue(true),
            getBalance: jest.fn().mockResolvedValue(1.5),
            saveMintConfig: jest.fn(),
            loadMintConfig: jest.fn(),
            mintExists: jest.fn().mockResolvedValue(true),
        }))
    };
});

jest.mock('../client/src/token-manager', () => {
    return {
        TokenManager: jest.fn().mockImplementation(() => ({
            createMintToken: jest.fn().mockResolvedValue({
                signature: 'signature123',
                hash: 'hash123'
            }),
            batchMintToken: jest.fn().mockResolvedValue([{
                productUid: 'test-product-id',
                signature: 'signature123',
                hash: 'hash123'
            }]),
            updateMintToken: jest.fn().mockResolvedValue({
                signature: 'update-signature123',
                hash: 'update-hash123'
            }),
            checkAuthenticityOnBlockchain: jest.fn().mockResolvedValue({
                isValid: true
            }),
            getMetadataFromId: jest.fn(),
        }))
    };
});

jest.mock('../client/src/history-manager', () => {
    return {
        HistoryManager: jest.fn().mockImplementation(() => ({
            recordProductHistory: jest.fn().mockResolvedValue(undefined),
            getProductHistory: jest.fn().mockResolvedValue([
                {
                    id: 'history-1',
                    productId: 'test-product-id',
                    action: 'CREATE',
                    changeTimestamp: new Date('2025-07-18'),
                    changedBy: 'test-user'
                }
            ]),
            getAllProductHistory: jest.fn().mockResolvedValue({
                history: [
                    {
                        id: 'history-1',
                        action: 'CREATE',
                        changeTimestamp: new Date('2025-07-18'),
                        changedBy: 'test-user'
                    }
                ],
                total: 1,
                totalPages: 1
            }),
            getProductHistoryByAction: jest.fn().mockResolvedValue({
                history: [
                    {
                        id: 'history-1',
                        action: 'CREATE',
                        changeTimestamp: new Date('2025-07-18'),
                        changedBy: 'test-user'
                    }
                ],
                total: 1,
                totalPages: 1
            }),
            getProductHistoryByUser: jest.fn().mockResolvedValue({
                history: [
                    {
                        id: 'history-1',
                        changeTimestamp: new Date('2025-07-18'),
                        changedBy: 'test-user'
                    }
                ],
                total: 1,
                totalPages: 1
            }),
            getProductHistoryByDateRange: jest.fn().mockResolvedValue({
                history: [
                    {
                        id: 'history-1',
                        changeTimestamp: new Date('2025-07-18')
                    }
                ],
                total: 1,
                totalPages: 1
            }),
            getProductHistoryStats: jest.fn().mockResolvedValue({
                totalChanges: 10,
                createCount: 5,
                updateCount: 3,
                deleteCount: 2,
                uniqueProducts: 8,
                uniqueUsers: 3
            }),
        }))
    };
});

jest.mock('../client/src/validation', () => ({
    ValidationUtils: {
        validateProductData: jest.fn().mockImplementation((data) => {
            // Simuler la validation Zod - rejeter les données vraiment invalides
            if (data.productId === 'invalid-uuid' ||
                data.manufacturer?.contactEmail === 'invalid-email' ||
                data.hazardousSubstances?.some((s: any) => s.casNumber === 'invalid-cas') ||
                data.repairabilityScore > 5 ||
                (data.digitalLink && !data.digitalLink.startsWith('http')) ||
                data.endOfLifeInstructions === 'short' ||
                (data.materialComposition && 
                 data.materialComposition.reduce((sum: number, m: any) => sum + m.percentage, 0) !== 100)) {
                const error = new z.ZodError([
                    {
                        code: z.ZodIssueCode.custom,
                        path: ['invalid'],
                        message: 'Validation failed'
                    }
                ]);
                throw error;
            }
            return data;
        }),
        normalizeUserName: jest.fn().mockImplementation((userName) => {
            return userName ? userName.trim().toLowerCase() : 'system';
        }),
    }
}));

describe('SafeoutSDK - Complete Test Suite', () => {
    let sdk: SafeoutSDK;
    let connection: Connection;
    let mintAuthority: PublicKey;
    let owner: PublicKey;

    // Data de test valide
        const validProductData: ProductInput = {
        productUid: 'test-product-id',
        info: {
            productId: 'test-product-id',
            productName: 'EcoLaptop X200',
            manufacturer: {
                name: 'GreenTech Electronics Ltd.',
                address: '12 Circularity Avenue, Berlin, Germany',
                contactEmail: 'contact@greentechelectronics.eu'
            },
            dateOfManufacture: '2025-05-15',
            placeOfManufacture: 'Wroclaw, Poland',
            productCategory: 'Computers and laptops',
            repairabilityScore: 4.2,
            endOfLifeInstructions: 'Disassemble carefully. Recycle aluminum components separately. Electronic parts must go to certified e-waste facility.',
            digitalLink: 'https://dpp.greentechelectronics.eu/product/test-product-id',
            materialComposition: [
                { material: 'Aluminum', percentage: 45 },
                { material: 'Recycled plastic', percentage: 30 },
                { material: 'Glass', percentage: 10 },
                { material: 'Electronic components', percentage: 15 }
            ],
            hazardousSubstances: [
                { substance: 'Lead', casNumber: '7439-92-1', concentration: 0.08 },
                { substance: 'Mercury', casNumber: '7439-97-6', concentration: 0.001 }
            ]
        }
    };

    beforeEach(async () => {
        jest.clearAllMocks();
        
        // Mock de la variable d'environnement pour les tests
        process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
        
        connection = new Connection("https://api.devnet.solana.com", "confirmed");
        mintAuthority = new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1");
        owner = new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ");
        
        sdk = new SafeoutSDK(connection, mintAuthority, owner);
        
        // Configuration des mocks pour les tests
        const mockPrismaManager = (sdk as any).prismaManager;
        const mockTokenManager = (sdk as any).tokenManager;
        const mockHistoryManager = (sdk as any).historyManager;
        
        // Mock des méthodes Prisma
        mockPrismaManager.createProductWithRelations.mockResolvedValue({
            id: 'test-product-id',
            productName: 'EcoLaptop X200',
            dateOfManufacture: new Date('2025-05-15'),
            placeOfManufacture: 'Wroclaw, Poland',
            productCategory: 'Computers and laptops',
            repairabilityScore: 4.2,
            endOfLifeInstructions: 'Disassemble carefully. Recycle aluminum components separately. Electronic parts must go to certified e-waste facility.',
            digitalLink: 'https://dpp.greentechelectronics.eu/product/test-product-id',
            manufacturer: {
                id: 'manufacturer-id',
                name: 'GreenTech Electronics Ltd.',
                address: '12 Circularity Avenue, Berlin, Germany',
                contactEmail: 'contact@greentechelectronics.eu'
            },
            materialComposition: [
                { id: 'comp-1', material: 'Aluminum', percentage: 45, productId: 'test-product-id' },
                { id: 'comp-2', material: 'Recycled plastic', percentage: 30, productId: 'test-product-id' }
            ],
            hazardousSubstances: [
                { id: 'hazard-1', substance: 'Lead', casNumber: '7439-92-1', concentration: 0.08, productId: 'test-product-id' }
            ]
        });
        
        mockPrismaManager.getFullProductData.mockResolvedValue({
            id: 'test-product-id',
            productName: 'EcoLaptop X200',
            // ... autres propriétés
        });
        
        mockPrismaManager.updateProductById.mockResolvedValue({
            id: 'test-product-id',
            productName: 'Updated EcoLaptop X200',
            // ... autres propriétés
        });
        
        mockPrismaManager.getPrisma.mockReturnValue({
            productDPP: {
                findUnique: jest.fn().mockResolvedValue(null), // Par défaut, produit n'existe pas
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            materialComposition: {
                deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
            },
            hazardousSubstance: {
                deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
        });
        
        await sdk.init();
    });

    afterEach(() => {
        delete process.env.DATABASE_URL;
    });

    describe('SDK Initialization', () => {
        it('should initialize successfully with valid environment', async () => {
            const newSdk = new SafeoutSDK(connection, mintAuthority, owner);
            await expect(newSdk.init()).resolves.not.toThrow();
        });

        it('should throw error when DATABASE_URL is missing', async () => {
            delete process.env.DATABASE_URL;
            const newSdk = new SafeoutSDK(connection, mintAuthority, owner);
            await expect(newSdk.init()).rejects.toThrow('DATABASE_URL environment variable is required');
        });

        it('should throw error when using SDK methods before init', async () => {
            const newSdk = new SafeoutSDK(connection, mintAuthority, owner);
            await expect(newSdk.createDppProduct(validProductData)).rejects.toThrow('SDK is not initialized');
        });
    });

    describe('Product Creation (createDppProduct)', () => {
        it('should create a new product successfully', async () => {
            const result = await sdk.createDppProduct(validProductData, 'test-user');
            
            expect(result).toEqual(expect.objectContaining({
                id: 'test-product-id',
                signature: 'signature123',
                hash: 'hash123',
                productName: 'EcoLaptop X200',
            }));
        });

        it('should throw error when product already exists', async () => {
            // Configurer le mock pour simuler un produit existant
            const mockPrisma = (sdk as any).prismaManager.getPrisma();
            mockPrisma.productDPP.findUnique.mockResolvedValueOnce({ id: 'test-product-id' });

            await expect(sdk.createDppProduct(validProductData)).rejects.toThrow(
                'Product with ID test-product-id already exists.'
            );
        });

        it('should validate product data and throw ZodError for invalid data', async () => {
            const invalidProductData = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    productId: 'invalid-uuid',
                }
            };

            await expect(sdk.createDppProduct(invalidProductData)).rejects.toThrow(z.ZodError);
        });

        it('should validate email format', async () => {
            const invalidEmailData = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    manufacturer: {
                        ...validProductData.info.manufacturer,
                        contactEmail: 'invalid-email'
                    }
                }
            };

            await expect(sdk.createDppProduct(invalidEmailData)).rejects.toThrow(z.ZodError);
        });

        it('should validate CAS number format', async () => {
            const invalidCasData = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    hazardousSubstances: [
                        { substance: 'Lead', casNumber: 'invalid-cas', concentration: 0.08 }
                    ]
                }
            };

            await expect(sdk.createDppProduct(invalidCasData)).rejects.toThrow(z.ZodError);
        });

        it('should validate material composition percentages add to 100%', async () => {
            const invalidMaterialData = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    materialComposition: [
                        { material: 'Aluminum', percentage: 50 },
                        { material: 'Plastic', percentage: 30 } // Total = 80%, not 100%
                    ]
                }
            };

            await expect(sdk.createDppProduct(invalidMaterialData)).rejects.toThrow(z.ZodError);
        });

        it('should validate repairability score range', async () => {
            const invalidScoreData = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    repairabilityScore: 15 // > 5
                }
            };

            await expect(sdk.createDppProduct(invalidScoreData)).rejects.toThrow(z.ZodError);
        });

        it('should validate URL format', async () => {
            const invalidUrlData = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    digitalLink: 'not-a-valid-url'
                }
            };

            await expect(sdk.createDppProduct(invalidUrlData)).rejects.toThrow(z.ZodError);
        });

        it('should validate end-of-life instructions length', async () => {
            const invalidInstructionsData = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    endOfLifeInstructions: 'short'
                }
            };

            await expect(sdk.createDppProduct(invalidInstructionsData)).rejects.toThrow(z.ZodError);
        });
    });

    describe('Batch Product Creation (createBatchDppProducts)', () => {
        it('should create multiple products successfully', async () => {
            const batchData = [validProductData, {
                ...validProductData,
                productUid: 'test-product-id-2',
                info: { ...validProductData.info, productId: 'test-product-id-2' }
            }];

            const result = await sdk.createBatchDppProducts(batchData, 'test-user');
            
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual(expect.objectContaining({
                signature: expect.any(String),
                hash: expect.any(String),
            }));
        });

        it('should handle validation errors in batch creation', async () => {
            const invalidBatchData = [
                validProductData,
                {
                    ...validProductData,
                    info: { ...validProductData.info, productId: 'invalid-uuid' }
                }
            ];

            await expect(sdk.createBatchDppProducts(invalidBatchData)).rejects.toThrow(z.ZodError);
        });
    });

    describe('Product Update (updateDppProduct)', () => {
        it('should update an existing product successfully', async () => {
            const updateData = {
                info: {
                    ...validProductData.info,
                    productName: 'Updated EcoLaptop X200'
                }
            };

            const result = await sdk.updateDppProduct('test-product-id', updateData, 'test-user');
            
            expect(result).toEqual(expect.objectContaining({
                id: 'test-product-id',
                signature: 'update-signature123',
                hash: 'update-hash123',
            }));
        });

        it('should throw error when updating non-existent product', async () => {
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.getFullProductData.mockResolvedValueOnce(null);

            await expect(sdk.updateDppProduct('non-existent-id', { info: validProductData.info }))
                .rejects.toThrow('Product with ID non-existent-id not found.');
        });
    });

    describe('Batch Product Update (updateBatchDppProducts)', () => {
        it('should update multiple products successfully', async () => {
            const updates = [
                {
                    productId: 'test-product-id',
                    updateData: { info: { ...validProductData.info, productName: 'Updated Product 1' } }
                },
                {
                    productId: 'test-product-id-2',
                    updateData: { info: { ...validProductData.info, productName: 'Updated Product 2' } }
                }
            ];

            const result = await sdk.updateBatchDppProducts(updates, 'test-user');
            
            expect(result).toHaveLength(2);
        });

        it('should skip non-existent products in batch update', async () => {
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.getFullProductData
                .mockResolvedValueOnce({ id: 'test-product-id' }) // First exists
                .mockResolvedValueOnce(null); // Second doesn't exist

            const updates = [
                { productId: 'test-product-id', updateData: { info: validProductData.info } },
                { productId: 'non-existent-id', updateData: { info: validProductData.info } }
            ];

            const result = await sdk.updateBatchDppProducts(updates, 'test-user');
            
            expect(result).toHaveLength(1); // Only one product updated
        });
    });

    describe('Product Deletion (deleteDppProduct)', () => {
        it('should delete an existing product successfully', async () => {
            await expect(sdk.deleteDppProduct('test-product-id', 'test-user')).resolves.not.toThrow();
        });

        it('should throw error when deleting non-existent product', async () => {
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.getFullProductData.mockResolvedValueOnce(null);

            await expect(sdk.deleteDppProduct('non-existent-id', 'test-user'))
                .rejects.toThrow('Product with ID non-existent-id not found.');
        });
    });

    describe('Batch Product Deletion (deleteBatchDppProducts)', () => {
        it('should delete multiple products successfully', async () => {
            const productIds = ['test-product-id', 'test-product-id-2'];
            
            await expect(sdk.deleteBatchDppProducts(productIds, 'test-user')).resolves.not.toThrow();
        });

        it('should throw error when no valid products found to delete', async () => {
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.getFullProductData.mockResolvedValue(null);

            await expect(sdk.deleteBatchDppProducts(['non-existent-id'], 'test-user'))
                .rejects.toThrow('No valid products found to delete.');
        });
    });

    describe('Authenticity Verification', () => {
        it('should check authenticity on blockchain successfully', async () => {
            const result = await sdk.checkAuthenticityOnBlockchain('test-product-id');
            
            expect(result).toEqual({
                isValid: true
            });
        });

        it('should return false for invalid product', async () => {
            const mockTokenManager = (sdk as any).tokenManager;
            mockTokenManager.checkAuthenticityOnBlockchain.mockResolvedValueOnce({
                isValid: false,
                reason: 'Hash mismatch'
            });

            const result = await sdk.checkAuthenticityOnBlockchain('invalid-product-id');
            
            expect(result).toEqual({
                isValid: false,
                reason: 'Hash mismatch'
            });
        });
    });

    describe('Public Utilities', () => {
        it('should check and top up balance', async () => {
            const result = await sdk.checkAndTopUpBalance(0.1);
            expect(result).toBe(true);
        });

        it('should get mint info', () => {
            const mintInfo = sdk.getMintInfo();
            
            expect(mintInfo).toEqual({
                mintAddress: expect.any(String),
                mintAuthority: mintAuthority.toString()
            });
        });

        it('should get current balance', async () => {
            const balance = await sdk.getBalance();
            expect(balance).toBe(1.5);
        });

        it('should normalize user name', () => {
            expect(sdk.normalizeUserName('Test User')).toBe('test user');
            expect(sdk.normalizeUserName('')).toBe('system');
            expect(sdk.normalizeUserName(undefined)).toBe('system');
        });
    });

    describe('Product History Functions', () => {
        it('should get product history by ID', async () => {
            const history = await sdk.getProductHistory('test-product-id');
            
            expect(history).toHaveLength(1);
            expect(history[0]).toEqual(expect.objectContaining({
                id: 'history-1',
                productId: 'test-product-id',
                action: 'CREATE'
            }));
        });

        it('should get all product history with pagination', async () => {
            const result = await sdk.getAllProductHistory(1, 10);
            
            expect(result).toEqual({
                history: expect.arrayContaining([
                    expect.objectContaining({
                        id: 'history-1',
                        action: 'CREATE'
                    })
                ]),
                total: 1,
                totalPages: 1
            });
        });

        it('should get product history by action', async () => {
            const result = await sdk.getProductHistoryByAction('CREATE', 1, 10);
            
            expect(result).toEqual({
                history: expect.arrayContaining([
                    expect.objectContaining({
                        id: 'history-1',
                        action: 'CREATE'
                    })
                ]),
                total: 1,
                totalPages: 1
            });
        });

        it('should get product history by user', async () => {
            const result = await sdk.getProductHistoryByUser('test-user', 1, 10);
            
            expect(result).toEqual({
                history: expect.arrayContaining([
                    expect.objectContaining({
                        id: 'history-1',
                        changedBy: 'test-user'
                    })
                ]),
                total: 1,
                totalPages: 1
            });
        });

        it('should get product history by date range', async () => {
            const startDate = new Date('2025-01-01');
            const endDate = new Date('2025-12-31');
            
            const result = await sdk.getProductHistoryByDateRange(startDate, endDate, 1, 10);
            
            expect(result).toEqual({
                history: expect.arrayContaining([
                    expect.objectContaining({
                        id: 'history-1',
                        changeTimestamp: expect.any(Date)
                    })
                ]),
                total: 1,
                totalPages: 1
            });
        });

        it('should get product history statistics', async () => {
            const stats = await sdk.getProductHistoryStats();
            
            expect(stats).toEqual({
                totalChanges: 10,
                createCount: 5,
                updateCount: 3,
                deleteCount: 2,
                uniqueProducts: 8,
                uniqueUsers: 3
            });
        });

        it('should throw error when getting history without initialization', async () => {
            const newSdk = new SafeoutSDK(connection, mintAuthority, owner);
            
            await expect(newSdk.getProductHistory('test-id')).rejects.toThrow('SDK is not initialized');
            await expect(newSdk.getAllProductHistory()).rejects.toThrow('SDK is not initialized');
            await expect(newSdk.getProductHistoryByAction('CREATE')).rejects.toThrow('SDK is not initialized');
            await expect(newSdk.getProductHistoryByUser('user')).rejects.toThrow('SDK is not initialized');
            await expect(newSdk.getProductHistoryByDateRange(new Date(), new Date())).rejects.toThrow('SDK is not initialized');
            await expect(newSdk.getProductHistoryStats()).rejects.toThrow('SDK is not initialized');
        });
    });

    describe('Error Handling', () => {
        it('should handle validation errors gracefully', async () => {
            const invalidData = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    productId: 'invalid-uuid'
                }
            };

            await expect(sdk.createDppProduct(invalidData)).rejects.toThrow(z.ZodError);
        });

        it('should handle database errors gracefully', async () => {
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.createProductWithRelations.mockRejectedValueOnce(new Error('Database error'));

            await expect(sdk.createDppProduct(validProductData)).rejects.toThrow('Database error');
        });

        it('should handle blockchain errors gracefully', async () => {
            const mockTokenManager = (sdk as any).tokenManager;
            mockTokenManager.createMintToken.mockRejectedValueOnce(new Error('Blockchain error'));

            await expect(sdk.createDppProduct(validProductData)).rejects.toThrow('Blockchain error');
        });
    });
});
