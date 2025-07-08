import { SafeoutSDK, ProductInput } from '../client/class_safeout';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';

const sdk = new SafeoutSDK('Devnet', 'sha256', new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1"), new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ"), 'postgresql://safeout:pide@localhost:4242/sdk-1?schema=public');

describe('SafeoutSDK', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createValidProduct = (overrides = {}): ProductInput => ({
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
            ...overrides
        }
    });

    const createMockProduct = (overrides = {}) => ({
        id: '550e8400-e29b-41d4-a716-446655440000',
        productName: 'EcoLaptop X200',
        dateOfManufacture: new Date('2025-05-15'),
        placeOfManufacture: 'Wroclaw, Poland',
        productCategory: 'Computers and laptops',
        repairabilityScore: 4.2,
        endOfLifeInstructions: 'Disassemble carefully. Recycle aluminum components separately. Electronic parts must go to certified e-waste facility.',
        digitalLink: 'https://dpp.greentechelectronics.eu/product/550e8400-e29b-41d4-a716-446655440000',
        signature: 'test-signature',
        manufacturer: {
            id: 'manufacturer-id',
            name: 'GreenTech Electronics Ltd.',
            address: '12 Circularity Avenue, Berlin, Germany',
            contactEmail: 'contact@greentechelectronics.eu'
        },
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
        ...overrides
    });

    describe('Product Validation with Zod Schema', () => {
        it('should validate product data successfully with correct format', async () => {
            const product = createValidProduct();
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue(createMockProduct()),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue({ id: 'mfg-123' })
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({})
                },
                $connect: jest.fn(),
            };
            (sdk as any).prisma = mockPrisma;
            (sdk as any).createMintToken = jest.fn().mockResolvedValue({
                signature: 'tx123',
                hash: 'hash123',
            });

            const result = await sdk.createDppProduct(product);

            expect(result).toEqual({
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                signature: 'tx123',
                hash: 'hash123',
            });
        });

        it('should throw ZodError for invalid UUID format', async () => {
            const product = createValidProduct({
                productId: 'invalid-uuid'
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(z.ZodError);
        });

        it('should throw ZodError for invalid email format', async () => {
            const product = createValidProduct({
                manufacturer: {
                    name: 'GreenTech Corp',
                    address: '123 Eco Street',
                    contactEmail: 'invalid-email'
                }
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(z.ZodError);
        });

        it('should throw ZodError for invalid CAS number format', async () => {
            const product = createValidProduct({
                hazardousSubstances: [
                    { substance: 'Lead', casNumber: 'invalid-cas', concentration: 0.01 }
                ]
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(z.ZodError);
        });

        it('should throw ZodError when material composition does not add to ~100%', async () => {
            const product = createValidProduct({
                materialComposition: [
                    { material: 'Aluminum', percentage: 50 },
                    { material: 'Plastic', percentage: 30 }
                ]
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(z.ZodError);
        });

        it('should throw ZodError for invalid date format', async () => {
            const product = createValidProduct({
                dateOfManufacture: '2024/01/15'
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(z.ZodError);
        });

        it('should throw ZodError for invalid URL format', async () => {
            const product = createValidProduct({
                digitalLink: 'not-a-valid-url'
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(z.ZodError);
        });

        it('should throw ZodError for insufficient endOfLifeInstructions', async () => {
            const product = createValidProduct({
                endOfLifeInstructions: 'short'
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(z.ZodError);
        });

        it('should throw ZodError for invalid repairabilityScore range', async () => {
            const product = createValidProduct({
                repairabilityScore: 15
            });

            await expect(sdk.createDppProduct(product)).rejects.toThrow(z.ZodError);
        });
    });

    describe('createDppProduct with Relations and History', () => {
    });

    const validProductData = createValidProduct();
    
    const mockFullProductData = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        productName: 'EcoLaptop X200',
        dateOfManufacture: new Date('2025-05-15'),
        placeOfManufacture: 'Wroclaw, Poland',
        productCategory: 'Computers and laptops',
        repairabilityScore: 4.2,
        endOfLifeInstructions: 'Disassemble carefully. Recycle aluminum components separately. Electronic parts must go to certified e-waste facility.',
        digitalLink: 'https://dpp.greentechelectronics.eu/product/550e8400-e29b-41d4-a716-446655440000',
        signature: 'test-signature',
        manufacturer: {
            id: 'manufacturer-id',
            name: 'GreenTech Electronics Ltd.',
            address: '12 Circularity Avenue, Berlin, Germany',
            contactEmail: 'contact@greentechelectronics.eu'
        },
        materialComposition: [
            { id: 'comp-1', material: 'Aluminum', percentage: 45, productId: '550e8400-e29b-41d4-a716-446655440000' },
            { id: 'comp-2', material: 'Recycled plastic', percentage: 30, productId: '550e8400-e29b-41d4-a716-446655440000' }
        ],
        hazardousSubstances: [
            { id: 'hazard-1', substance: 'Lead', casNumber: '7439-92-1', concentration: 0.08, productId: '550e8400-e29b-41d4-a716-446655440000' }
        ]
    };

    describe('createDppProduct', () => {
        it('should create a new product and mint token', async () => {
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue(mockFullProductData),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue({ id: 'manufacturer-id' }),
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({}),
                },
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).createMintToken = jest.fn().mockResolvedValue({
                signature: 'tx123',
                hash: 'hash123',
            });

            const result = await sdk.createDppProduct(validProductData, 'test-user');

            expect(result).toEqual({
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                signature: 'tx123',
                hash: 'hash123',
            });
            expect(mockPrisma.productDPP.findUnique).toHaveBeenCalledWith({ 
                where: { id: '550e8400-e29b-41d4-a716-446655440000' } 
            });
            expect(mockPrisma.productDPP.create).toHaveBeenCalled();
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    action: 'CREATE',
                    previousData: null,
                    changedBy: 'test-user',
                    changeDescription: 'Product created',
                }),
            });
        });

        it('should throw if product already exists', async () => {
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000' }),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createDppProduct(validProductData)).rejects.toThrow(
                'Product with ID 550e8400-e29b-41d4-a716-446655440000 already exists.'
            );
        });

        it('should throw validation error for invalid product data', async () => {
            const invalidProduct: ProductInput = {
                productUid: 'invalid-uuid',
                info: {
                    ...validProductData.info,
                    productId: 'invalid-uuid',
                    productName: '',
                }
            };

            const mockPrisma = {
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createDppProduct(invalidProduct)).rejects.toThrow();
        });
    });

    describe('updateDppProduct', () => {
        it('should update product and record history', async () => {
            const updatedProduct = {
                ...validProductData,
                info: {
                    ...validProductData.info,
                    productName: 'EcoLaptop X200 Updated'
                }
            };

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(mockFullProductData),
                    update: jest.fn().mockResolvedValue({ ...mockFullProductData, productName: 'EcoLaptop X200 Updated' }),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'manufacturer-id' }),
                },
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({}),
                },
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).getFullProductData = jest.fn()
                .mockResolvedValueOnce(mockFullProductData)
                .mockResolvedValueOnce({ ...mockFullProductData, productName: 'EcoLaptop X200 Updated' });
            (sdk as any).updateMintToken = jest.fn().mockResolvedValue({
                signature: 'tx456',
                hash: 'hash456',
            });

            const result = await sdk.updateDppProduct(updatedProduct, 'test-user');

            expect(result).toEqual({
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                signature: 'tx456',
                hash: 'hash456',
            });
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    action: 'UPDATE',
                    changedBy: 'test-user',
                    changeDescription: 'Product updated',
                }),
            });
        });

        it('should throw error when product does not exist', async () => {
            const mockPrisma = {
                $connect: jest.fn(),
            };
            
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).getFullProductData = jest.fn().mockResolvedValue(null);

            await expect(sdk.updateDppProduct(validProductData)).rejects.toThrow(
                'Product with ID 550e8400-e29b-41d4-a716-446655440000 not found.'
            );
        });
    });

    describe('deleteDppProduct', () => {
        it('should delete product and record in history', async () => {
            const mockPrisma = {
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                productDPP: {
                    delete: jest.fn().mockResolvedValue({}),
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({}),
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations.map(op => op))),
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).getFullProductData = jest.fn().mockResolvedValue(mockFullProductData);

            await sdk.deleteDppProduct('550e8400-e29b-41d4-a716-446655440000', 'test-user');

            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    action: 'DELETE',
                    newData: null,
                    changedBy: 'test-user',
                    changeDescription: 'Product deleted',
                }),
            });
            expect(mockPrisma.$transaction).toHaveBeenCalled();
        });

        it('should throw error when product does not exist', async () => {
            const mockPrisma = {
                $connect: jest.fn(),
            };
            
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).getFullProductData = jest.fn().mockResolvedValue(null);

            await expect(sdk.deleteDppProduct('nonexistent-id')).rejects.toThrow(
                'Product with ID nonexistent-id not found.'
            );
        });
    });

    describe('createBatchDppProducts', () => {
        it('should create multiple products and record history for each', async () => {
            const products: ProductInput[] = [
                validProductData,
                {
                    ...validProductData,
                    productUid: '550e8400-e29b-41d4-a716-446655440001',
                    info: {
                        ...validProductData.info,
                        productId: '550e8400-e29b-41d4-a716-446655440001',
                        productName: 'EcoLaptop X300'
                    }
                }
            ];

            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([]),
                    create: jest.fn().mockResolvedValue(mockFullProductData),
                    update: jest.fn().mockResolvedValue({}),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'manufacturer-id' }),
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({}),
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations.map(op => op))),
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).batchMintToken = jest.fn().mockResolvedValue([
                { productUid: '550e8400-e29b-41d4-a716-446655440000', signature: 'sig1', hash: 'hash1' },
                { productUid: '550e8400-e29b-41d4-a716-446655440001', signature: 'sig2', hash: 'hash2' },
            ]);

            const result = await sdk.createBatchDppProducts(products, 10, 'test-user');

            expect(result).toHaveLength(2);
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledTimes(2);
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    action: 'CREATE',
                    changedBy: 'test-user',
                    changeDescription: 'Batch product creation',
                }),
            });
        });

        it('should throw if all products already exist', async () => {
            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440000' }]),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createBatchDppProducts([validProductData])).rejects.toThrow(
                'Every product already exists.'
            );
        });
    });

    describe('updateBatchDppProducts', () => {
        it('should update existing products and create new ones with history', async () => {
            const products: ProductInput[] = [
                validProductData,
                {
                    ...validProductData,
                    productUid: '550e8400-e29b-41d4-a716-446655440001',
                    info: {
                        ...validProductData.info,
                        productId: '550e8400-e29b-41d4-a716-446655440001',
                        productName: 'EcoLaptop X300'
                    }
                }
            ];

            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440000' }]),
                    create: jest.fn().mockResolvedValue(mockFullProductData),
                    update: jest.fn().mockResolvedValue({}),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'manufacturer-id' }),
                },
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({}),
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations.map(op => op))),
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).getFullProductData = jest.fn()
                .mockResolvedValueOnce(mockFullProductData)
                .mockResolvedValueOnce({ ...mockFullProductData, productName: 'Updated' });
            (sdk as any).batchMintToken = jest.fn().mockResolvedValue([
                { productUid: '550e8400-e29b-41d4-a716-446655440000', signature: 'sig1', hash: 'hash1' },
                { productUid: '550e8400-e29b-41d4-a716-446655440001', signature: 'sig2', hash: 'hash2' },
            ]);

            const result = await sdk.updateBatchDppProducts(products, 10, 'test-user');

            expect(result).toHaveLength(2);
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledTimes(2);
        });
    });

    describe('deleteBatchDppProducts', () => {
        it('should delete multiple products and record each in history', async () => {
            const productIds = [
                '550e8400-e29b-41d4-a716-446655440000',
                '550e8400-e29b-41d4-a716-446655440001'
            ];

            const mockPrisma = {
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                productDPP: {
                    deleteMany: jest.fn().mockResolvedValue({}),
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({}),
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations.map(op => op))),
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).getFullProductData = jest.fn()
                .mockResolvedValueOnce(mockFullProductData)
                .mockResolvedValueOnce({ ...mockFullProductData, id: '550e8400-e29b-41d4-a716-446655440001' });

            await sdk.deleteBatchDppProducts(productIds, 'test-user');

            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledTimes(2);
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    action: 'DELETE',
                    changedBy: 'test-user',
                    changeDescription: 'Batch product deletion',
                }),
            });
            expect(mockPrisma.$transaction).toHaveBeenCalled();
        });

        it('should handle non-existent products gracefully', async () => {
            const productIds = ['nonexistent-1', 'nonexistent-2'];

            const mockPrisma = {
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).getFullProductData = jest.fn().mockResolvedValue(null);

            await expect(sdk.deleteBatchDppProducts(productIds)).rejects.toThrow(
                'No valid products found to delete.'
            );
        });
    });

    describe('History Query Functions', () => {
        it('should get history by action type', async () => {
            const mockHistory = [
                {
                    id: 'history-1',
                    action: 'CREATE',
                    changedBy: 'test-user',
                    changeTimestamp: new Date(),
                },
            ];

            const mockPrisma = {
                dppProductHistory: {
                    findMany: jest.fn().mockResolvedValue(mockHistory),
                    count: jest.fn().mockResolvedValue(1),
                },
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await sdk.getProductHistoryByAction('CREATE', 1, 10);

            expect(result).toEqual({
                history: mockHistory,
                total: 1,
                totalPages: 1,
            });
            expect(mockPrisma.dppProductHistory.findMany).toHaveBeenCalledWith({
                where: { action: 'CREATE' },
                orderBy: { changeTimestamp: 'desc' },
                skip: 0,
                take: 10,
            });
        });

        it('should get history by user', async () => {
            const mockHistory = [
                {
                    id: 'history-1',
                    changedBy: 'specific-user',
                    changeTimestamp: new Date(),
                },
            ];

            const mockPrisma = {
                dppProductHistory: {
                    findMany: jest.fn().mockResolvedValue(mockHistory),
                    count: jest.fn().mockResolvedValue(1),
                },
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await sdk.getProductHistoryByUser('specific-user', 1, 10);

            expect(result).toEqual({
                history: mockHistory,
                total: 1,
                totalPages: 1,
            });
            expect(mockPrisma.dppProductHistory.findMany).toHaveBeenCalledWith({
                where: { changedBy: 'specific-user' },
                orderBy: { changeTimestamp: 'desc' },
                skip: 0,
                take: 10,
            });
        });

        it('should get history by date range', async () => {
            const startDate = new Date('2025-01-01');
            const endDate = new Date('2025-12-31');
            const mockHistory = [
                {
                    id: 'history-1',
                    changeTimestamp: new Date('2025-06-15'),
                },
            ];

            const mockPrisma = {
                dppProductHistory: {
                    findMany: jest.fn().mockResolvedValue(mockHistory),
                    count: jest.fn().mockResolvedValue(1),
                },
                $connect: jest.fn(),
            };

            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await sdk.getProductHistoryByDateRange(startDate, endDate, 1, 10);

            expect(result).toEqual({
                history: mockHistory,
                total: 1,
                totalPages: 1,
            });
            expect(mockPrisma.dppProductHistory.findMany).toHaveBeenCalledWith({
                where: {
                    changeTimestamp: {
                        gte: startDate,
                        lte: endDate,
                    },
                },
                orderBy: { changeTimestamp: 'desc' },
                skip: 0,
                take: 10,
            });
        });
    });

    describe('Validation Tests', () => {
        it('should validate material composition percentages', async () => {
            const invalidProduct: ProductInput = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    ...validProductData.info,
                    materialComposition: [
                        { material: 'Aluminum', percentage: 50 },
                        { material: 'Plastic', percentage: 30 },
                    ]
                }
            };

            const mockPrisma = {
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createDppProduct(invalidProduct)).rejects.toThrow();
        });

        it('should validate CAS number format', async () => {
            const invalidProduct: ProductInput = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    ...validProductData.info,
                    hazardousSubstances: [
                        { substance: 'Lead', casNumber: 'invalid-cas', concentration: 0.08 }
                    ]
                }
            };

            const mockPrisma = {
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createDppProduct(invalidProduct)).rejects.toThrow();
        });

        it('should validate email format', async () => {
            const invalidProduct: ProductInput = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    ...validProductData.info,
                    manufacturer: {
                        ...validProductData.info.manufacturer,
                        contactEmail: 'invalid-email'
                    }
                }
            };

            const mockPrisma = {
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createDppProduct(invalidProduct)).rejects.toThrow();
        });
    });

    describe('checkAuthenticityOnBlockchain', () => {
        it('should return isValid: true if hash matches', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(mockFullProductData),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).hashObject = jest.fn().mockReturnValue('hash-ok');
            (sdk as any).getMemoFromSignature = jest.fn().mockResolvedValue(
                JSON.stringify({ hash: 'hash-ok' })
            );

            const result = await sdk.checkAuthenticityOnBlockchain(productId);
            expect(result).toEqual({ isValid: true });
        });

        it('should return isValid: false and reason if hash does not match', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(mockFullProductData),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).hashObject = jest.fn().mockReturnValue('hash-local');
            (sdk as any).getMemoFromSignature = jest.fn().mockResolvedValue(
                JSON.stringify({ hash: 'hash-chain' })
            );

            const result = await sdk.checkAuthenticityOnBlockchain(productId);
            expect(result).toEqual({ isValid: false, reason: 'Hash mismatch' });
        });
    });

});
