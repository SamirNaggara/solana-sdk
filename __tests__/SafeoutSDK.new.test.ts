import { SafeoutSDK, ProductInput } from '../client/class_safeout';
import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';

const sdk = new SafeoutSDK('Devnet', 'sha256', new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1"), new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ"), 'postgresql://safeout:pide@localhost:4242/sdk-1?schema=public');

describe('SafeoutSDK - Comprehensive Test Suite', () => {
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
            { id: 'comp-1', material: 'Aluminum', percentage: 45, productId: '550e8400-e29b-41d4-a716-446655440000' },
            { id: 'comp-2', material: 'Recycled plastic', percentage: 30, productId: '550e8400-e29b-41d4-a716-446655440000' },
            { id: 'comp-3', material: 'Glass', percentage: 10, productId: '550e8400-e29b-41d4-a716-446655440000' },
            { id: 'comp-4', material: 'Electronic components', percentage: 15, productId: '550e8400-e29b-41d4-a716-446655440000' }
        ],
        hazardousSubstances: [
            { id: 'hazard-1', substance: 'Lead', casNumber: '7439-92-1', concentration: 0.08, productId: '550e8400-e29b-41d4-a716-446655440000' },
            { id: 'hazard-2', substance: 'Mercury', casNumber: '7439-97-6', concentration: 0.001, productId: '550e8400-e29b-41d4-a716-446655440000' }
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
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
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
        it('should create a new product with all relations and record history', async () => {
            const product = createValidProduct();
            const createdProduct = createMockProduct();

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue(createdProduct),
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
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).createMintToken = jest.fn().mockResolvedValue({
                signature: 'tx123',
                hash: 'hash123',
            });

            const result = await sdk.createDppProduct(product, 'test-user');

            expect(result).toEqual({
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                signature: 'tx123',
                hash: 'hash123',
            });
            expect(mockPrisma.productDPP.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    id: '550e8400-e29b-41d4-a716-446655440000',
                    productName: 'EcoLaptop X200',
                    manufacturerId: 'mfg-123',
                    materialComposition: {
                        create: expect.arrayContaining([
                            { material: 'Aluminum', percentage: 45 }
                        ])
                    },
                    hazardousSubstances: {
                        create: expect.arrayContaining([
                            { substance: 'Lead', casNumber: '7439-92-1', concentration: 0.08 }
                        ])
                    }
                }),
                include: expect.any(Object)
            });
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    action: 'CREATE',
                    changedBy: 'test-user',
                    changeDescription: 'Product created'
                })
            });
        });

        it('should throw error if product already exists', async () => {
            const product = createValidProduct();
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ id: '550e8400-e29b-41d4-a716-446655440000' }),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createDppProduct(product)).rejects.toThrow(
                'Product with ID 550e8400-e29b-41d4-a716-446655440000 already exists.'
            );
        });

        it('should reuse existing manufacturer if found', async () => {
            const product = createValidProduct();
            const existingManufacturer = { id: 'existing-mfg-123' };

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue(createMockProduct()),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue(existingManufacturer),
                    create: jest.fn()
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({})
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).createMintToken = jest.fn().mockResolvedValue({
                signature: 'tx123',
                hash: 'hash123',
            });

            await sdk.createDppProduct(product);

            expect(mockPrisma.manufacturer.findFirst).toHaveBeenCalledWith({
                where: {
                    name: 'GreenTech Electronics Ltd.',
                    contactEmail: 'contact@greentechelectronics.eu'
                }
            });
            expect(mockPrisma.manufacturer.create).not.toHaveBeenCalled();
        });
    });

    describe('createBatchDppProducts', () => {
        it('should create multiple products and record batch history', async () => {
            const products = [
                createValidProduct({ 
                    productId: '550e8400-e29b-41d4-a716-446655440001', 
                    productUid: '550e8400-e29b-41d4-a716-446655440001',
                    productName: 'EcoLaptop X200 - Model 1'
                }),
                createValidProduct({ 
                    productId: '550e8400-e29b-41d4-a716-446655440002', 
                    productUid: '550e8400-e29b-41d4-a716-446655440002',
                    productName: 'EcoLaptop X200 - Model 2'
                })
            ];

            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([]),
                    create: jest.fn()
                        .mockResolvedValueOnce(createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440001' }))
                        .mockResolvedValueOnce(createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440002' })),
                    update: jest.fn().mockResolvedValue({}),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'mfg-123' })
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({})
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).batchMintToken = jest.fn().mockResolvedValue([
                { productUid: '550e8400-e29b-41d4-a716-446655440001', signature: 'sig1', hash: 'hash1' },
                { productUid: '550e8400-e29b-41d4-a716-446655440002', signature: 'sig2', hash: 'hash2' },
            ]);

            const result = await sdk.createBatchDppProducts(products, 10, 'batch-user');

            expect(result).toHaveLength(2);
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledTimes(2);
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    action: 'CREATE',
                    changedBy: 'batch-user',
                    changeDescription: 'Batch product creation'
                })
            });
        });

        it('should skip existing products and only create new ones', async () => {
            const products = [
                createValidProduct({ 
                    productId: '550e8400-e29b-41d4-a716-446655440001', 
                    productUid: '550e8400-e29b-41d4-a716-446655440001' 
                }),
                createValidProduct({ 
                    productId: '550e8400-e29b-41d4-a716-446655440002', 
                    productUid: '550e8400-e29b-41d4-a716-446655440002' 
                })
            ];

            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440001' }]),
                    create: jest.fn().mockResolvedValue(createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440002' })),
                    update: jest.fn().mockResolvedValue({}),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'mfg-123' })
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({})
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).batchMintToken = jest.fn().mockResolvedValue([
                { productUid: '550e8400-e29b-41d4-a716-446655440002', signature: 'sig2', hash: 'hash2' },
            ]);

            const result = await sdk.createBatchDppProducts(products);

            expect(result).toHaveLength(1);
            expect(result[0].productUid).toBe('550e8400-e29b-41d4-a716-446655440002');
            expect(mockPrisma.productDPP.create).toHaveBeenCalled();
        });

        it('should throw error if all products already exist', async () => {
            const products = [
                createValidProduct({ 
                    productId: '550e8400-e29b-41d4-a716-446655440001', 
                    productUid: '550e8400-e29b-41d4-a716-446655440001' 
                })
            ];

            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440001' }]),
                    create: jest.fn(),
                    update: jest.fn(),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'mfg-123' })
                },
                $transaction: jest.fn(),
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).batchMintToken = jest.fn().mockResolvedValue([]);

            await expect(sdk.createBatchDppProducts(products)).rejects.toThrow();
        });
    });

    describe('updateDppProduct', () => {
        it('should update product with relations and record history', async () => {
            const product = createValidProduct({ productName: 'Updated EcoLaptop X200' });
            const existingProduct = createMockProduct();
            const updatedProduct = { ...existingProduct, productName: 'Updated EcoLaptop X200' };

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn()
                        .mockResolvedValueOnce({ 
                            ...existingProduct, 
                            manufacturer: existingProduct.manufacturer, 
                            materialComposition: existingProduct.materialComposition, 
                            hazardousSubstances: existingProduct.hazardousSubstances 
                        })
                        .mockResolvedValueOnce({ 
                            ...updatedProduct, 
                            manufacturer: updatedProduct.manufacturer, 
                            materialComposition: updatedProduct.materialComposition, 
                            hazardousSubstances: updatedProduct.hazardousSubstances 
                        }),
                    update: jest.fn().mockResolvedValue(updatedProduct),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'mfg-123' })
                },
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({})
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).updateMintToken = jest.fn().mockResolvedValue({
                signature: 'tx456',
                hash: 'hash456',
            });

            const result = await sdk.updateDppProduct(product, 'update-user');

            expect(result).toEqual({
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                signature: 'tx456',
                hash: 'hash456',
            });
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: {
                    action: 'UPDATE',
                    changedBy: 'update-user',
                    changeDescription: 'Product updated',
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    previousData: expect.any(Object),
                    newData: expect.any(Object)
                }
            });
        });

        it('should throw error when product does not exist', async () => {
            const product = createValidProduct();

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.updateDppProduct(product)).rejects.toThrow(
                'Product with ID 550e8400-e29b-41d4-a716-446655440000 not found.'
            );
        });
    });

    describe('updateBatchDppProducts', () => {
        it('should handle mix of new and existing products with history', async () => {
            const products = [
                createValidProduct({ 
                    productId: '550e8400-e29b-41d4-a716-446655440001', 
                    productUid: '550e8400-e29b-41d4-a716-446655440001' 
                }),
                createValidProduct({ 
                    productId: '550e8400-e29b-41d4-a716-446655440002', 
                    productUid: '550e8400-e29b-41d4-a716-446655440002' 
                })
            ];

            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([{ id: '550e8400-e29b-41d4-a716-446655440001' }]),
                    findUnique: jest.fn()
                        .mockResolvedValueOnce(createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440001' }))
                        .mockResolvedValueOnce(createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440001' }))
                        .mockResolvedValueOnce(createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440002' })),
                    create: jest.fn().mockResolvedValue(createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440002' })),
                    update: jest.fn(),
                },
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue({ id: 'mfg-123' })
                },
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({})
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).batchMintToken = jest.fn().mockResolvedValue([
                { productUid: '550e8400-e29b-41d4-a716-446655440001', signature: 'sig1', hash: 'hash1' },
                { productUid: '550e8400-e29b-41d4-a716-446655440002', signature: 'sig2', hash: 'hash2' },
            ]);

            const result = await sdk.updateBatchDppProducts(products, 10, 'batch-update-user');

            expect(result).toHaveLength(2);
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    action: 'CREATE',
                    changedBy: 'batch-update-user',
                    changeDescription: 'Batch product creation (upsert)'
                })
            });
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    action: 'CREATE',
                    changedBy: 'batch-update-user',
                    changeDescription: 'Batch product creation (upsert)'
                })
            });
        });
    });

    describe('Product Deletion with History', () => {
        it('should delete product and record history', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const existingProduct = createMockProduct();

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ 
                        ...existingProduct, 
                        manufacturer: existingProduct.manufacturer, 
                        materialComposition: existingProduct.materialComposition, 
                        hazardousSubstances: existingProduct.hazardousSubstances 
                    }),
                    delete: jest.fn().mockResolvedValue({}),
                },
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({})
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await sdk.deleteDppProduct(productId, 'delete-user');

            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: {
                    productId,
                    action: 'DELETE',
                    changedBy: 'delete-user',
                    changeDescription: 'Product deleted',
                    previousData: expect.any(Object),
                    newData: null
                }
            });
            expect(mockPrisma.$transaction).toHaveBeenCalled();
        });

        it('should throw error when product does not exist', async () => {
            const productId = 'nonexistent-id';

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.deleteDppProduct(productId)).rejects.toThrow(
                'Product with ID nonexistent-id not found.'
            );
        });
    });

    describe('Batch Product Deletion', () => {
        it('should delete multiple products and record batch history', async () => {
            const productIds = ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'];
            const existingProducts = [
                createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440001' }),
                createMockProduct({ id: '550e8400-e29b-41d4-a716-446655440002' })
            ];

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn()
                        .mockResolvedValueOnce({ 
                            ...existingProducts[0], 
                            manufacturer: existingProducts[0].manufacturer, 
                            materialComposition: existingProducts[0].materialComposition, 
                            hazardousSubstances: existingProducts[0].hazardousSubstances 
                        })
                        .mockResolvedValueOnce({ 
                            ...existingProducts[1], 
                            manufacturer: existingProducts[1].manufacturer, 
                            materialComposition: existingProducts[1].materialComposition, 
                            hazardousSubstances: existingProducts[1].hazardousSubstances 
                        }),
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                materialComposition: {
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                hazardousSubstance: {
                    deleteMany: jest.fn().mockResolvedValue({})
                },
                dppProductHistory: {
                    create: jest.fn().mockResolvedValue({})
                },
                $transaction: jest.fn().mockImplementation((operations) => Promise.all(operations)),
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await sdk.deleteBatchDppProducts(productIds, 'batch-delete-user');

            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledTimes(2);
            expect(mockPrisma.dppProductHistory.create).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    action: 'DELETE',
                    changedBy: 'batch-delete-user',
                    changeDescription: 'Batch product deletion'
                })
            });
        });

        it('should handle non-existent products gracefully', async () => {
            const productIds = ['nonexistent-1', 'nonexistent-2'];

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.deleteBatchDppProducts(productIds)).rejects.toThrow('No valid products found to delete.');
        });
    });

    describe('History Management Functions', () => {
        it('should get product history with pagination', async () => {
            const historyData = [
                {
                    id: 'hist-1',
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    action: 'CREATE',
                    changedBy: 'user1',
                    changeTimestamp: '2024-01-15T10:00:00.000Z',
                    changeDescription: 'Product created'
                }
            ];

            const mockPrisma = {
                dppProductHistory: {
                    findMany: jest.fn().mockResolvedValue(historyData),
                    count: jest.fn().mockResolvedValue(1)
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await sdk.getAllProductHistory(1, 10);

            expect(result).toEqual({
                history: historyData,
                total: 1,
                totalPages: 1
            });
            expect(mockPrisma.dppProductHistory.findMany).toHaveBeenCalledWith({
                orderBy: { changeTimestamp: 'desc' },
                skip: 0,
                take: 10
            });
        });

        it('should get history filtered by action type', async () => {
            const historyData = [
                {
                    id: 'hist-1',
                    action: 'CREATE',
                    changedBy: 'user1',
                    changeTimestamp: '2024-01-15T10:00:00.000Z'
                }
            ];

            const mockPrisma = {
                dppProductHistory: {
                    findMany: jest.fn().mockResolvedValue(historyData),
                    count: jest.fn().mockResolvedValue(1)
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await sdk.getProductHistoryByAction('CREATE');

            expect(result.history).toEqual(historyData);
            expect(mockPrisma.dppProductHistory.findMany).toHaveBeenCalledWith({
                where: { action: 'CREATE' },
                orderBy: { changeTimestamp: 'desc' },
                skip: 0,
                take: 50
            });
        });

        it('should get history filtered by user', async () => {
            const historyData = [
                {
                    id: 'hist-1',
                    changedBy: 'test-user',
                    action: 'UPDATE',
                    changeTimestamp: '2024-01-15T10:00:00.000Z'
                }
            ];

            const mockPrisma = {
                dppProductHistory: {
                    findMany: jest.fn().mockResolvedValue(historyData),
                    count: jest.fn().mockResolvedValue(1)
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await sdk.getProductHistoryByUser('test-user');

            expect(result.history).toEqual(historyData);
            expect(mockPrisma.dppProductHistory.findMany).toHaveBeenCalledWith({
                where: { changedBy: 'test-user' },
                orderBy: { changeTimestamp: 'desc' },
                skip: 0,
                take: 50
            });
        });

        it('should get history within date range', async () => {
            const startDate = new Date('2024-01-01');
            const endDate = new Date('2024-01-31');
            const historyData = [
                {
                    id: 'hist-1',
                    changeTimestamp: '2024-01-15T10:00:00.000Z'
                }
            ];

            const mockPrisma = {
                dppProductHistory: {
                    findMany: jest.fn().mockResolvedValue(historyData),
                    count: jest.fn().mockResolvedValue(1)
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await sdk.getProductHistoryByDateRange(startDate, endDate);

            expect(result.history).toEqual(historyData);
            expect(mockPrisma.dppProductHistory.findMany).toHaveBeenCalledWith({
                where: {
                    changeTimestamp: {
                        gte: startDate,
                        lte: endDate
                    }
                },
                orderBy: { changeTimestamp: 'desc' },
                skip: 0,
                take: 50
            });
        });

        it('should get comprehensive history statistics', async () => {
            const mockPrisma = {
                dppProductHistory: {
                    aggregate: jest.fn().mockResolvedValue({ _count: { id: 100 } }),
                    count: jest.fn()
                        .mockResolvedValueOnce(100)
                        .mockResolvedValueOnce(30)
                        .mockResolvedValueOnce(50)
                        .mockResolvedValueOnce(20),
                    groupBy: jest.fn().mockResolvedValue([
                        { action: 'CREATE', _count: { action: 30 } },
                        { action: 'UPDATE', _count: { action: 50 } },
                        { action: 'DELETE', _count: { action: 20 } }
                    ]),
                    findMany: jest.fn().mockResolvedValue([
                        { productId: 'prod1', changedBy: 'user1' },
                        { productId: 'prod2', changedBy: 'user2' },
                        { productId: 'prod1', changedBy: 'user1' }
                    ])
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await sdk.getProductHistoryStats();

            expect(result).toEqual({
                totalChanges: 100,
                createCount: 30,
                updateCount: 50,
                deleteCount: 20,
                uniqueProducts: 3,
                uniqueUsers: 3
            });
        });
    });

    describe('Blockchain Authenticity Verification', () => {
        it('should return isValid: true if hash matches blockchain', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const mockProduct = createMockProduct();

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ 
                        ...mockProduct, 
                        manufacturer: mockProduct.manufacturer, 
                        materialComposition: mockProduct.materialComposition, 
                        hazardousSubstances: mockProduct.hazardousSubstances 
                    }),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).hashObject = jest.fn().mockReturnValue('hash-match');
            (sdk as any).getMemoFromSignature = jest.fn().mockResolvedValue(JSON.stringify({ hash: 'hash-match' }));

            const result = await sdk.checkAuthenticityOnBlockchain(productId);

            expect(result).toEqual({ isValid: true });
        });

        it('should return isValid: false if hash does not match blockchain', async () => {
            const productId = '550e8400-e29b-41d4-a716-446655440000';
            const mockProduct = createMockProduct();

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ 
                        ...mockProduct, 
                        manufacturer: mockProduct.manufacturer, 
                        materialComposition: mockProduct.materialComposition, 
                        hazardousSubstances: mockProduct.hazardousSubstances 
                    }),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).hashObject = jest.fn().mockReturnValue('hash-local');
            (sdk as any).getMemoFromSignature = jest.fn().mockResolvedValue(JSON.stringify({ hash: 'hash-different' }));

            const result = await sdk.checkAuthenticityOnBlockchain(productId);

            expect(result).toEqual({ isValid: false, reason: 'Hash mismatch' });
        });

        it('should throw error if product not found for authenticity check', async () => {
            const productId = 'nonexistent-product';

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.checkAuthenticityOnBlockchain(productId)).rejects.toThrow(
                'Product with ID nonexistent-product not found'
            );
        });
    });

    describe('Manufacturer Management', () => {
        it('should create new manufacturer when none exists', async () => {
            const product = createValidProduct();

            const mockPrisma = {
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue({ id: 'new-mfg-123' })
                }
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await (sdk as any).createOrFindManufacturer(product.info.manufacturer);

            expect(result).toBe('new-mfg-123');
            expect(mockPrisma.manufacturer.create).toHaveBeenCalledWith({
                data: product.info.manufacturer
            });
        });

        it('should return existing manufacturer ID when found', async () => {
            const product = createValidProduct();
            const existingManufacturer = { id: 'existing-mfg-456' };

            const mockPrisma = {
                manufacturer: {
                    findFirst: jest.fn().mockResolvedValue(existingManufacturer),
                    create: jest.fn()
                }
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            const result = await (sdk as any).createOrFindManufacturer(product.info.manufacturer);

            expect(result).toBe('existing-mfg-456');
            expect(mockPrisma.manufacturer.create).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle database connection errors gracefully', async () => {
            const product = createValidProduct();
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockRejectedValue(new Error('Database connection failed')),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createDppProduct(product)).rejects.toThrow('Database connection failed');
        });

        it('should validate all required fields are present', async () => {
            const incompleteProduct = {
                productUid: '550e8400-e29b-41d4-a716-446655440000',
                info: {
                    productId: '550e8400-e29b-41d4-a716-446655440000',
                    productName: '',
                    manufacturer: {
                        name: 'GreenTech Corp',
                        address: '123 Eco Street',
                        contactEmail: 'contact@greentech.com'
                    },
                    dateOfManufacture: '2025-05-15',
                    placeOfManufacture: 'Wroclaw, Poland',
                    productCategory: 'Electronics',
                    materialComposition: [
                        { material: 'Aluminum', percentage: 100 }
                    ],
                    hazardousSubstances: [],
                    endOfLifeInstructions: 'Standard disposal instructions',
                    digitalLink: 'https://example.com'
                }
            };

            await expect(sdk.createDppProduct(incompleteProduct as ProductInput)).rejects.toThrow(z.ZodError);
        });

        it('should handle empty batch operations correctly', async () => {
            const emptyProducts: ProductInput[] = [];

            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([]),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createBatchDppProducts(emptyProducts)).rejects.toThrow('Every product already exists.');
        });
    });
});
