import { SafeoutSDK, ProductInput } from '../client/class_safeout';
import { PublicKey } from '@solana/web3.js';

const sdk = new SafeoutSDK('Testnet', 'sha256', new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1"), new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ"), 'postgresql://safeout:pide@localhost:4242/sdk-1?schema=public');

describe('SafeoutSDK', () => {
    describe('createDppProduct', () => {
        it('should create a new product and mint token', async () => {
            const product: ProductInput = {
                productUid: 'prod-123',
                info: { name: 'Produit A' },
            };

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue(null),
                    create: jest.fn().mockResolvedValue({}),
                    update: jest.fn(),
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
                productUid: 'prod-123',
                signature: 'tx123',
                hash: 'hash123',
            });
            expect(mockPrisma.productDPP.findUnique).toHaveBeenCalledWith({ where: { id: 'prod-123' } });
            expect(mockPrisma.productDPP.create).toHaveBeenCalledWith({
                data: {
                    id: 'prod-123',
                    info: { name: 'Produit A' },
                    signature: '',
                },
            });
            expect((sdk as any).createMintToken).toHaveBeenCalledWith('prod-123');
        });

        it('should throw if product already exists', async () => {
            const product: ProductInput = {
                productUid: 'prod-123',
                info: { name: 'Produit A' },
            };

            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ id: 'prod-123' }),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.createDppProduct(product)).rejects.toThrow(
                'Product with ID prod-123 already exists.'
            );
            expect(mockPrisma.productDPP.findUnique).toHaveBeenCalledWith({ where: { id: 'prod-123' } });
        });
    });

    describe('createBatchDppProducts', () => {
        it('should create and mint tokens for new products', async () => {
            const products: ProductInput[] = [
                { productUid: 'prod-1', info: { name: 'A' } },
                { productUid: 'prod-2', info: { name: 'B' } },
            ];

            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([]),
                    createMany: jest.fn().mockResolvedValue({ count: 2 }),
                    update: jest.fn(),
                },
                $transaction: jest.fn(async (ops: any[]) => ops.map((op: any, i: number) => ({ id: products[i].productUid, signature: `sig${i + 1}` }))),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            (sdk as any).batchMintToken = jest.fn().mockResolvedValue([
                { productUid: 'prod-1', signature: 'sig1', hash: 'hash1' },
                { productUid: 'prod-2', signature: 'sig2', hash: 'hash2' },
            ]);

            const result = await sdk.createBatchDppProducts(products);
            expect(result).toEqual([
                { productUid: 'prod-1', signature: 'sig1', hash: 'hash1' },
                { productUid: 'prod-2', signature: 'sig2', hash: 'hash2' },
            ]);
        });

        it('should throw if all products already exist', async () => {
            const products: ProductInput[] = [
                { productUid: 'prod-1', info: { name: 'A' } },
            ];
            const mockPrisma = {
                productDPP: {
                    findMany: jest.fn().mockResolvedValue([{ id: 'prod-1' }]),
                },
                $transaction: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            await expect(sdk.createBatchDppProducts(products)).rejects.toThrow('Every product already exists.');
        });
    });

    describe('updateDppProduct', () => {
        it('should update product info and refresh token', async () => {
            const product: ProductInput = {
                productUid: 'prod-123',
                info: { name: 'Produit B' },
            };
            const mockPrisma = {
                productDPP: {
                    update: jest.fn().mockResolvedValue({}),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).updateMintToken = jest.fn().mockResolvedValue({
                signature: 'tx456',
                hash: 'hash456',
            });

            const result = await sdk.updateDppProduct(product);

            expect(mockPrisma.productDPP.update).toHaveBeenCalledWith({
                where: { id: 'prod-123' },
                data: { info: { name: 'Produit B' } },
            });
            expect((sdk as any).updateMintToken).toHaveBeenCalledWith('prod-123');
            expect(mockPrisma.productDPP.update).toHaveBeenCalledWith({
                where: { id: 'prod-123' },
                data: { signature: 'tx456' },
            });
            expect(result).toEqual({
                productUid: 'prod-123',
                signature: 'tx456',
                hash: 'hash456',
            });
        });

        it('should throw error when product does not exist', async () => {
            const product: ProductInput = {
                productUid: 'nonexistent-prod',
                info: { name: 'New Product' },
            };
            
            const mockPrisma = {
                productDPP: {
                    update: jest.fn().mockRejectedValue(new Error('Product not found')),
                },
                $connect: jest.fn(),
            };
            
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;

            await expect(sdk.updateDppProduct(product)).rejects.toThrow('Product not found');
            
            expect(mockPrisma.productDPP.update).toHaveBeenCalledWith({
                where: { id: 'nonexistent-prod' },
                data: { info: { name: 'New Product' } },
            });
        });
    });


    describe('checkAuthenticityOnBlockchain', () => {
        it('should return isValid: true if hash matches', async () => {
            const productId = 'prod-1';
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ info: { foo: 'bar' } }),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).hashObject = jest.fn().mockReturnValue('hash-ok');
            (sdk as any).getMemoFromSignature = jest.fn().mockResolvedValue(JSON.stringify({ hash: 'hash-ok', updatedAt: new Date().toISOString() }));

            const result = await sdk.checkAuthenticityOnBlockchain(productId);
            expect(result).toEqual({ isValid: true });
            expect((sdk as any).hashObject).toHaveBeenCalled();
            expect((sdk as any).getMemoFromSignature).toHaveBeenCalledWith(productId);
        });

        it('should return isValid: false and reason if hash does not match', async () => {
            const productId = 'prod-2';
            const mockPrisma = {
                productDPP: {
                    findUnique: jest.fn().mockResolvedValue({ info: { foo: 'baz' } }),
                },
                $connect: jest.fn(),
            };
            (sdk as any).setupPrisma = jest.fn().mockResolvedValue(mockPrisma);
            (sdk as any).prisma = mockPrisma;
            (sdk as any).hashObject = jest.fn().mockReturnValue('hash-local');
            (sdk as any).getMemoFromSignature = jest.fn().mockResolvedValue(JSON.stringify({ hash: 'hash-chain', updatedAt: new Date().toISOString() }));

            const result = await sdk.checkAuthenticityOnBlockchain(productId);
            expect(result).toEqual({ isValid: false, reason: 'Hash mismatch' });
        });
    });

});
