import { SafeoutSDK } from '../client/class_safeout';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { PrismaClient } from '@prisma/client';

// Mock the createMint function
jest.mock('@solana/spl-token', () => {
    const actualModule = jest.requireActual('@solana/spl-token');
    return {
        ...actualModule,
        createMint: jest.fn().mockImplementation(async () => {
            return new PublicKey('So11111111111111111111111111111111111111112');
        })
    };
});

describe('SafeoutSDK - getDppProductById Simple Test', () => {
    let sdk: SafeoutSDK;
    let prisma: PrismaClient;
    let connection: Connection;
    let mintAuthority: PublicKey;
    let owner: PublicKey;

    beforeAll(async () => {
        prisma = new PrismaClient();
        connection = new Connection('https://api.devnet.solana.com', 'confirmed');
        mintAuthority = Keypair.generate().publicKey;
        owner = Keypair.generate().publicKey;
        sdk = new SafeoutSDK(connection, mintAuthority, owner);
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    test('should validate that getDppProductById function exists', async () => {
        // First check that the function exists on the SDK
        expect(typeof sdk.getDppProductById).toBe('function');
        
        // Test that it throws an error when SDK is not initialized
        await expect(sdk.getDppProductById('test-id'))
            .rejects.toThrow('Prisma client is not initialized. Call init() first.');
    });

    test('should throw error for non-existent product after initialization', async () => {
        // Initialize the SDK  
        try {
            await sdk.init("postgresql://safeout:pide@localhost:4242/sdk-1?schema=public");
        } catch (error) {
            console.warn('Could not initialize SDK with database, skipping database-dependent test');
            return; // Skip the test if database is not available
        }

        // Test with a fake UUID
        const fakeProductId = '550e8400-e29b-41d4-a716-446655440999';
        
        await expect(sdk.getDppProductById(fakeProductId))
            .rejects.toThrow(`Product with ID ${fakeProductId} not found.`);
    });
});
