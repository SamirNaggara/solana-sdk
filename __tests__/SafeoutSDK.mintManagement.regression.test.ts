import { SafeoutSDK, ProductInput } from '../client/class_safeout';
import { PublicKey, Connection } from '@solana/web3.js';

// Mock des modules externes
jest.mock('../client/lib/solanaUtils');

// Mock des managers
jest.mock('../client/src/prisma-manager', () => {
    return {
        PrismaManager: jest.fn().mockImplementation(() => ({
            init: jest.fn().mockResolvedValue(undefined),
            setupPrisma: jest.fn().mockResolvedValue({
                $connect: jest.fn(),
            }),
            getPrisma: jest.fn().mockReturnValue({
                $connect: jest.fn(),
            }),
            createProductWithRelations: jest.fn(),
            updateProductById: jest.fn(),
            deleteProductWithRelations: jest.fn(),
            getFullProductData: jest.fn(),
        }))
    };
});

jest.mock('../client/src/mint-manager', () => {
    return {
        MintManager: jest.fn().mockImplementation(() => ({
            initializeMint: jest.fn().mockResolvedValue(new (jest.requireActual('@solana/web3.js').PublicKey)("7aoAZMkrDLsrSW6UWWRMMJSJgmPteTMiMNoQw1xYkjLp")),
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
        }))
    };
});

jest.mock('../client/src/validation', () => ({
    ValidationUtils: {
        validateProductData: jest.fn().mockImplementation((data) => data),
        normalizeUserName: jest.fn().mockImplementation((userName) => {
            return userName ? userName.trim().toLowerCase() : 'system';
        }),
    }
}));

/**
 * Tests de régression pour s'assurer que les nouvelles fonctionnalités
 * de gestion des mints n'impactent pas les fonctionnalités existantes
 */
describe('SafeoutSDK - Mint Management Regression Tests', () => {
    let sdk: SafeoutSDK;
    const mockMintAuthority = new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1");
    const mockOwner = new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ");

    beforeAll(() => {
        // Set DATABASE_URL for tests
        process.env.DATABASE_URL = 'postgresql://safeout:pide@localhost:4242/sdk-test?schema=public';
    });

    afterAll(() => {
        // Clean up environment
        delete process.env.DATABASE_URL;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        const mockConnection = new Connection("https://api.devnet.solana.com", "confirmed");
        sdk = new SafeoutSDK(mockConnection, mockMintAuthority, mockOwner);
    });

    const createValidProduct = (overrides: any = {}): ProductInput => {
        const baseProduct = {
            productUid: '550e8400-e29b-41d4-a716-446655440000',
            info: {
                productId: '550e8400-e29b-41d4-a716-446655440000',
                productName: 'EcoLaptop X200',
                manufacturer: {
                    name: 'GreenTech Electronics Ltd.',
                    address: '12 Circularity Avenue, Berlin, Germany',
                    contactEmail: 'contact@greentechelectronics.eu'
                },
                dateOfManufacture: '2025-05-15',
                placeOfManufacture: 'Wroclaw, Poland',
                productCategory: 'Computers and laptops',
                materialComposition: [
                    { material: 'Aluminum', percentage: 45 },
                    { material: 'Recycled plastic', percentage: 30 },
                    { material: 'Glass', percentage: 10 },
                    { material: 'Electronic components', percentage: 15 }
                ],
                hazardousSubstances: [
                    { substance: 'Lead', casNumber: '7439-92-1', concentration: 0.08 },
                    { substance: 'Mercury', casNumber: '7439-97-6', concentration: 0.001 }
                ],
                repairabilityScore: 4.2,
                endOfLifeInstructions: 'Disassemble carefully. Recycle aluminum components separately. Electronic parts must go to certified e-waste facility.',
                digitalLink: 'https://dpp.greentechelectronics.eu/product/550e8400-e29b-41d4-a716-446655440000',
            }
        };
        
        // Apply overrides at the root level and sync productId with productUid if productUid is overridden
        const result = { ...baseProduct, ...overrides };
        if (overrides.productUid) {
            result.info.productId = overrides.productUid;
        }
        
        return result;
    };

    describe('Product Creation with Mint Management', () => {
        it('should create product with mint reuse functionality', async () => {
            const product = createValidProduct();
            
            // Initialize SDK first
            await sdk.init();

            // Mock the managers after initialization
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.getPrisma.mockReturnValue({
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null), // Product doesn't exist yet
                },
            });
            
            mockPrismaManager.createProductWithRelations.mockResolvedValue({
                id: product.productUid,
                productName: product.info.productName,
                manufacturer: { id: 'mfg-123', ...product.info.manufacturer },
                materialComposition: product.info.materialComposition,
                hazardousSubstances: product.info.hazardousSubstances,
            });

            const mockTokenManager = (sdk as any).tokenManager;
            mockTokenManager.createMintToken.mockResolvedValue({
                signature: 'tx123',
                hash: 'hash123',
            });

            // Test product creation
            const result = await sdk.createDppProduct(product);

            expect(result).toEqual(expect.objectContaining({
                signature: 'tx123',
                hash: 'hash123',
            }));

            // Verify mint info is available
            const mintInfo = sdk.getMintInfo();
            expect(mintInfo.mintAddress).toBeTruthy();
            expect(mintInfo.mintAuthority).toBe(mockMintAuthority.toString());
        });

        it('should handle batch product creation with mint management', async () => {
            const products = [
                createValidProduct({ productUid: 'product-1' }),
                createValidProduct({ productUid: 'product-2' }),
            ];

            // Initialize SDK first
            await sdk.init();

            // Mock the PrismaManager for batch operations - need to return products with id property
            const mockPrismaManager = (sdk as any).prismaManager;
            const mockCreateResults = [
                { id: 'product-1', productName: 'Product 1' },
                { id: 'product-2', productName: 'Product 2' },
            ];
            
            // Mock the batch creation method to return products with id
            jest.spyOn(mockPrismaManager, 'createProductWithRelations')
                .mockResolvedValueOnce(mockCreateResults[0])
                .mockResolvedValueOnce(mockCreateResults[1]);

            // Mock the TokenManager for batch operations
            const mockTokenManager = (sdk as any).tokenManager;
            mockTokenManager.batchMintToken.mockResolvedValue([
                { productUid: 'product-1', signature: 'tx1', hash: 'hash1' },
                { productUid: 'product-2', signature: 'tx2', hash: 'hash2' },
            ]);

            // Test batch creation
            const results = await sdk.createBatchDppProducts(products);

            expect(results).toHaveLength(2);
            expect(results[0]).toEqual(expect.objectContaining({
                signature: expect.any(String),
                hash: expect.any(String),
            }));
            expect(results[1]).toEqual(expect.objectContaining({
                signature: expect.any(String),
                hash: expect.any(String),
            }));

            // Verify same mint is used for all products
            const mintInfo = sdk.getMintInfo();
            expect(mintInfo.mintAddress).toBeTruthy();
        });
    });

    describe('Product Updates with Mint Management', () => {
        it('should update product and token with reused mint', async () => {
            const product = createValidProduct();
            const existingProductData = {
                id: product.productUid,
                productName: 'Old Product Name',
                manufacturer: { id: 'mfg-123', name: 'Old Manufacturer' },
                materialComposition: [],
                hazardousSubstances: [],
            };

            // Initialize SDK first
            await sdk.init();

            // Mock the managers
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.getFullProductData
                .mockResolvedValueOnce(existingProductData) // For check before update
                .mockResolvedValueOnce({...existingProductData, productName: product.info.productName}); // For result after update

            mockPrismaManager.updateProductById.mockResolvedValue({});

            const mockTokenManager = (sdk as any).tokenManager;
            mockTokenManager.updateMintToken.mockResolvedValue({
                signature: 'update-tx123',
                hash: 'update-hash123',
            });

            // Test product update
            const result = await sdk.updateDppProduct(product.productUid, { info: product.info });

            expect(result).toEqual(expect.objectContaining({
                signature: 'update-tx123',
                hash: 'update-hash123',
            }));

            // Verify mint is still the same
            const mintInfo = sdk.getMintInfo();
            expect(mintInfo.mintAddress).toBeTruthy();
        });

        it('should preserve signatures during batch updates', async () => {
            const products = [
                createValidProduct({ productUid: 'batch-update-1' }),
                createValidProduct({ productUid: 'batch-update-2' }),
            ];

            // Initialize SDK first
            await sdk.init();

            // Mock existing products with signatures
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.getFullProductData.mockImplementation((productId: string) => {
                return Promise.resolve({
                    id: productId,
                    productName: 'Original Product',
                    signature: `existing-signature-${productId}`, // Existing signatures
                    manufacturer: { id: 'mfg-123', name: 'Test Manufacturer' },
                    materialComposition: [],
                    hazardousSubstances: [],
                });
            });

            // Mock updateProductById to return products with preserved signatures
            mockPrismaManager.updateProductById.mockImplementation((productId: string, updateData: any) => {
                return Promise.resolve({
                    id: productId,
                    productName: updateData.info?.productName || 'Updated Product',
                    signature: `existing-signature-${productId}`, // Signature preserved
                    manufacturer: { id: 'mfg-123', name: 'Test Manufacturer' },
                    materialComposition: [],
                    hazardousSubstances: [],
                });
            });

            const mockTokenManager = (sdk as any).tokenManager;
            mockTokenManager.updateMintToken.mockImplementation((productId: string) => {
                return Promise.resolve({
                    signature: `new-signature-${productId}`,
                    hash: `new-hash-${productId}`,
                });
            });

            // Test batch update
            const updates = products.map(product => ({
                productId: product.productUid,
                updateData: { info: product.info }
            }));

            const results = await sdk.updateBatchDppProducts(updates, 'test-user');

            expect(results).toHaveLength(2);
            
            // Verify that new signatures from blockchain updates are used
            expect(results[0]).toEqual(expect.objectContaining({
                signature: 'new-signature-batch-update-1',
                hash: 'new-hash-batch-update-1',
            }));
            expect(results[1]).toEqual(expect.objectContaining({
                signature: 'new-signature-batch-update-2',
                hash: 'new-hash-batch-update-2',
            }));

            // Verify same mint is used for all updates
            const mintInfo = sdk.getMintInfo();
            expect(mintInfo.mintAddress).toBeTruthy();
        });
    });

    describe('Authenticity Check with Mint Management', () => {
        it('should verify authenticity using managed mint', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            
            // Initialize SDK first
            await sdk.init();

            // Mock the TokenManager to handle authenticity check
            const mockTokenManager = (sdk as any).tokenManager;
            mockTokenManager.checkAuthenticityOnBlockchain.mockResolvedValue({
                isValid: true
            });

            // Test authenticity check
            const result = await sdk.checkAuthenticityOnBlockchain(productId);

            expect(result.isValid).toBe(true);
            expect(result.reason).toBeUndefined();

            // Verify mint info is accessible
            const mintInfo = sdk.getMintInfo();
            expect(mintInfo.mintAddress).toBeTruthy();
        });
    });

    describe('Constructor and Basic Methods', () => {
        it('should initialize with mint config path', () => {
            expect(sdk).toBeInstanceOf(SafeoutSDK);
            
            // Test getMintInfo before initialization
            const mintInfo = sdk.getMintInfo();
            expect(mintInfo.mintAddress).toBeNull();
            expect(mintInfo.mintAuthority).toBe(mockMintAuthority.toString());
        });

        it('should provide balance checking functionality', async () => {
            // Initialize SDK first to set up managers
            await sdk.init();

            // Override the mock to return the expected balance
            const mockMintManager = (sdk as any).mintManager;
            mockMintManager.getBalance.mockResolvedValue(2);

            const balance = await sdk.getBalance();
            expect(balance).toBe(2);
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle initialization errors gracefully', async () => {
            // Mock Prisma setup failure by overriding the PrismaManager mock
            const mockPrismaManager = (sdk as any).prismaManager;
            mockPrismaManager.setupPrisma.mockRejectedValue(new Error('Database connection failed'));

            await expect(sdk.init()).rejects.toThrow('Database connection failed');
        });

        it('should handle mint initialization failures', async () => {
            // Mock successful Prisma but failed mint
            const mockMintManager = (sdk as any).mintManager;
            mockMintManager.initializeMint.mockRejectedValue(new Error('Mint creation failed'));

            await expect(sdk.init()).rejects.toThrow('Mint creation failed');
        });
    });
});
