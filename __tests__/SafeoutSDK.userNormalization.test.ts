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

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const mintAuthority = new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1");
const owner = new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ");

describe('SafeoutSDK - User Name Normalization', () => {
    let sdk: SafeoutSDK;

    beforeEach(async () => {
        jest.clearAllMocks();
        
        // Mock environment variable
        process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
        
        // Reset all mocks to default behavior
        mockMintManager.initializeMint.mockResolvedValue(new PublicKey("7aoAZMkrDLsrSW6UWWRMMJSJgmPteTMiMNoQw1xYkjLp"));
        mockPrismaManager.init.mockResolvedValue(undefined);
        mockTokenManager.init.mockResolvedValue(undefined);
        mockHistoryManager.init.mockResolvedValue(undefined);
        mockValidationUtils.normalizeUserName.mockImplementation((name?: string) => name?.trim().toLowerCase() || 'system');
        
        // Create new SDK instance
        sdk = new SafeoutSDK(connection, mintAuthority, owner);
        await sdk.init();
    });

    describe('normalizeUserName method', () => {
        it('should normalize user names to lowercase and trimmed', () => {
            const testCases = [
                ['  John Doe  ', 'john doe'],
                ['ADMIN', 'admin'],
                ['User123', 'user123'],
                ['  SYSTEM  ', 'system'],
                ['', 'system'],
                [undefined, 'system'],
                [null, 'system'],
                ['jean-paul.martin@email.com', 'jean-paul.martin@email.com'],
                ['  User With Spaces  ', 'user with spaces']
            ];

            testCases.forEach(([input, expected]) => {
                const result = (sdk as any).normalizeUserName(input);
                expect(result).toBe(expected);
            });
        });
    });
});
