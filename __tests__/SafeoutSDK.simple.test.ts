import { SafeoutSDK } from '../client/class_safeout';
import { Connection, PublicKey } from '@solana/web3.js';

// Mock des modules externes
jest.mock('../client/src/prisma-manager');
jest.mock('../client/src/mint-manager');
jest.mock('../client/src/token-manager');
jest.mock('../client/src/history-manager');

describe('SafeoutSDK - Simple Architecture Test', () => {
    let sdk: SafeoutSDK;
    let connection: Connection;
    let mintAuthority: PublicKey;
    let owner: PublicKey;

    beforeEach(() => {
        connection = new Connection('https://api.devnet.solana.com');
        mintAuthority = new PublicKey('4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1');
        owner = new PublicKey('9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ');
        
        sdk = new SafeoutSDK(connection, mintAuthority, owner);
    });

    test('should instantiate SDK correctly', () => {
        expect(sdk).toBeDefined();
        expect(sdk).toBeInstanceOf(SafeoutSDK);
    });

    test('should have all required public methods', () => {
        expect(typeof sdk.init).toBe('function');
        expect(typeof sdk.createDppProduct).toBe('function');
        expect(typeof sdk.updateDppProduct).toBe('function');
        expect(typeof sdk.deleteDppProduct).toBe('function');
        expect(typeof sdk.getProductHistory).toBe('function');
        expect(typeof sdk.getProductHistoryByDateRange).toBe('function');
        expect(typeof sdk.checkAuthenticityOnBlockchain).toBe('function');
    });

    test('should throw error when methods called before init', async () => {
        const testProduct = {
            productUid: 'test-id',
            info: {
                productId: 'test-id',
                productName: 'Test Product',
                manufacturer: {
                    name: 'Test Manufacturer',
                    address: 'Test Address',
                    contactEmail: 'test@example.com'
                },
                dateOfManufacture: '2023-01-01',
                placeOfManufacture: 'Test Place',
                productCategory: 'Test Category',
                repairabilityScore: 5,
                endOfLifeInstructions: 'Test instructions',
                digitalLink: 'https://test.com',
                materialComposition: [],
                hazardousSubstances: []
            }
        };

        await expect(sdk.createDppProduct(testProduct))
            .rejects.toThrow('SDK is not initialized. Call init() first.');
    });
});
