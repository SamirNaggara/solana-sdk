import { SafeoutSDK, ProductInput } from '../client/class_safeout';
import { PublicKey, Connection } from '@solana/web3.js';

// Mock tous les managers
jest.mock('../client/src/prisma-manager', () => {
    return {
        PrismaManager: jest.fn().mockImplementation(() => ({
            init: jest.fn().mockResolvedValue(undefined),
            setupPrisma: jest.fn().mockResolvedValue(undefined),
            createProductWithRelations: jest.fn(),
            updateProductById: jest.fn(),
            deleteProductWithRelations: jest.fn(),
            getFullProductData: jest.fn(),
            getPrisma: jest.fn().mockReturnValue({
                productDPP: {
                    findUnique: jest.fn(),
                    findMany: jest.fn(),
                    create: jest.fn(),
                    update: jest.fn(),
                    delete: jest.fn(),
                },
                dppProductHistory: {
                    findMany: jest.fn(),
                    count: jest.fn(),
                    create: jest.fn(),
                },
                $transaction: jest.fn(),
            }),
        }))
    };
});

jest.mock('../client/src/mint-manager', () => {
    return {
        MintManager: jest.fn().mockImplementation(() => ({
            initializeMint: jest.fn().mockResolvedValue(new PublicKey("7aoAZMkrDLsrSW6UWWRMMJSJgmPteTMiMNoQw1xYkjLp")),
        }))
    };
});

jest.mock('../client/src/token-manager', () => {
    return {
        TokenManager: jest.fn().mockImplementation(() => ({
            createMintToken: jest.fn(),
            updateMintToken: jest.fn(),
            checkAuthenticityOnBlockchain: jest.fn(),
            getMetadataFromId: jest.fn(),
        }))
    };
});

jest.mock('../client/src/history-manager', () => {
    return {
        HistoryManager: jest.fn().mockImplementation(() => ({
            recordProductHistory: jest.fn(),
            getProductHistory: jest.fn(),
            getAllProductHistory: jest.fn(),
            getProductHistoryByAction: jest.fn(),
            getProductHistoryByUser: jest.fn(),
            getProductHistoryByDateRange: jest.fn(),
            getProductHistoryStats: jest.fn(),
        }))
    };
});

describe('SafeoutSDK - Fixed Tests', () => {
    let sdk: SafeoutSDK;
    let connection: Connection;
    let mintAuthority: PublicKey;
    let owner: PublicKey;

    beforeEach(async () => {
        jest.clearAllMocks();
        
        // Mock de la variable d'environnement pour les tests
        process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
        
        connection = new Connection("https://api.devnet.solana.com", "confirmed");
        mintAuthority = new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1");
        owner = new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ");
        
        sdk = new SafeoutSDK(connection, mintAuthority, owner);
        await sdk.init();
    });

    afterEach(() => {
        // Nettoyer la variable d'environnement après chaque test
        delete process.env.DATABASE_URL;
    });

    const createValidProduct = (): ProductInput => ({
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
    });

    describe('Product Creation', () => {
        it('should create a DPP product successfully', async () => {
            const product = createValidProduct();
            
            // Mock les réponses
            const prismaManager = (sdk as any).prismaManager;
            const tokenManager = (sdk as any).tokenManager;
            const historyManager = (sdk as any).historyManager;
            
            prismaManager.getPrisma().productDPP.findUnique.mockResolvedValue(null);
            prismaManager.createProductWithRelations.mockResolvedValue({
                id: product.productUid,
                productName: product.info.productName,
            });
            tokenManager.createMintToken.mockResolvedValue({
                signature: 'test-signature',
                hash: 'test-hash',
            });
            historyManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.createDppProduct(product, 'test-user');

            expect(result).toEqual({
                id: product.productUid,
                productName: product.info.productName,
                signature: 'test-signature',
                hash: 'test-hash',
            });
        });

        it('should throw error if product already exists', async () => {
            const product = createValidProduct();
            
            const prismaManager = (sdk as any).prismaManager;
            prismaManager.getPrisma().productDPP.findUnique.mockResolvedValue({
                id: product.productUid
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(
                `Product with ID ${product.productUid} already exists.`
            );
        });
    });

    describe('Product Validation', () => {
        it('should throw validation error for invalid UUID', async () => {
            const invalidProduct: ProductInput = {
                productUid: 'invalid-uuid',
                info: {
                    ...createValidProduct().info,
                    productId: 'invalid-uuid',
                }
            };

            await expect(sdk.createDppProduct(invalidProduct)).rejects.toThrow();
        });

        it('should throw validation error for invalid email', async () => {
            const product = createValidProduct();
            product.info.manufacturer.contactEmail = 'invalid-email';

            await expect(sdk.createDppProduct(product)).rejects.toThrow();
        });

        it('should throw validation error for material composition not summing to 100%', async () => {
            const product = createValidProduct();
            product.info.materialComposition = [
                { material: 'Aluminum', percentage: 50 },
                { material: 'Plastic', percentage: 30 }
            ];

            await expect(sdk.createDppProduct(product)).rejects.toThrow();
        });
    });

    describe('Product Update', () => {
        it('should update an existing product', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const updateData = createValidProduct();
            updateData.info.productName = 'Updated Product Name';
            
            const prismaManager = (sdk as any).prismaManager;
            const tokenManager = (sdk as any).tokenManager;
            const historyManager = (sdk as any).historyManager;
            
            prismaManager.getFullProductData.mockResolvedValue({
                id: productId,
                productName: 'Original Name',
            });
            prismaManager.updateProductById.mockResolvedValue({
                id: productId,
                productName: updateData.info.productName,
            });
            tokenManager.updateMintToken.mockResolvedValue({
                signature: 'update-signature',
                hash: 'update-hash',
            });
            historyManager.recordProductHistory.mockResolvedValue(undefined);

            const result = await sdk.updateDppProduct(productId, updateData, 'test-user');

            expect(result).toEqual({
                id: productId,
                productName: 'Updated Product Name',
                signature: 'update-signature',
                hash: 'update-hash',
            });
        });

        it('should throw error when updating non-existent product', async () => {
            const productId = 'non-existent-id';
            const updateData = createValidProduct();
            
            const prismaManager = (sdk as any).prismaManager;
            prismaManager.getFullProductData.mockResolvedValue(null);

            await expect(sdk.updateDppProduct(productId, updateData)).rejects.toThrow(
                `Product with ID ${productId} not found.`
            );
        });
    });

    describe('Product Deletion', () => {
        it('should delete an existing product', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            
            const prismaManager = (sdk as any).prismaManager;
            const historyManager = (sdk as any).historyManager;
            
            prismaManager.getFullProductData.mockResolvedValue({
                id: productId,
                productName: 'Test Product',
            });
            prismaManager.deleteProductWithRelations.mockResolvedValue(undefined);
            historyManager.recordProductHistory.mockResolvedValue(undefined);

            await expect(sdk.deleteDppProduct(productId, 'test-user')).resolves.not.toThrow();
        });

        it('should throw error when deleting non-existent product', async () => {
            const productId = 'non-existent-id';
            
            const prismaManager = (sdk as any).prismaManager;
            prismaManager.getFullProductData.mockResolvedValue(null);

            await expect(sdk.deleteDppProduct(productId)).rejects.toThrow(
                `Product with ID ${productId} not found.`
            );
        });
    });
});
