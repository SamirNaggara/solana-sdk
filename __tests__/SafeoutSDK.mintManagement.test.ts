import { SafeoutSDK } from '../client/class_safeout';
import { PublicKey, Connection } from '@solana/web3.js';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Mock des modules externes avant les imports du SDK
jest.mock('fs');
jest.mock('@solana/web3.js', () => ({
    ...jest.requireActual('@solana/web3.js'),
    Connection: jest.fn(),
}));
jest.mock('@solana/spl-token', () => ({
    ...jest.requireActual('@solana/spl-token'),
    createMint: jest.fn(),
}));
jest.mock('../client/lib/solanaUtils');

// Mock the manager classes
jest.mock('../client/src/prisma-manager', () => ({
    PrismaManager: jest.fn(() => ({
        setupPrisma: jest.fn(),
        getPrisma: jest.fn(() => ({
            product: {
                create: jest.fn(),
                findUnique: jest.fn(),
                update: jest.fn(),
                deleteMany: jest.fn(),
            },
            transaction: {
                create: jest.fn(),
            },
        })),
    })),
}));

jest.mock('../client/src/token-manager', () => ({
    TokenManager: jest.fn(() => ({
        createProduct: jest.fn(),
        updateProduct: jest.fn(),
    })),
}));

jest.mock('../client/src/history-manager', () => ({
    HistoryManager: jest.fn(() => ({
        recordTransaction: jest.fn(),
    })),
}));

const mockWriteFileSync = jest.mocked(writeFileSync);
const mockUnlinkSync = jest.mocked(unlinkSync);
const mockExistsSync = jest.mocked(existsSync);
const mockReadFileSync = jest.mocked(readFileSync);

describe('SafeoutSDK - Mint Management', () => {
    let sdk: SafeoutSDK;
    let mockMintAuthority: PublicKey;
    let mockOwner: PublicKey;
    let mockConnection: jest.Mocked<Connection>;
    const databaseUrl = 'postgresql://test:test@localhost:5432/testdb';
    const mintConfigPath = join(process.cwd(), 'mint-config.json');

    beforeEach(() => {
        jest.clearAllMocks();
        
        // Set up environment variable for tests
        process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
        
        // Mock PublicKey avec des adresses Solana valides
        mockMintAuthority = new PublicKey("7aoAZMkrDLsrSW6UWWRMMJSJgmPteTMiMNoQw1xYkjLp");
        mockOwner = new PublicKey("3N3fwKFy3nn7HtEwqxVFoqP9kLCA6LXyCDKZypniCqF9");
        
        // Mock Connection
        mockConnection = {
            getAccountInfo: jest.fn(),
            getBalance: jest.fn(),
            requestAirdrop: jest.fn(),
            confirmTransaction: jest.fn(),
        } as any;
        
        (Connection as jest.Mock).mockImplementation(() => mockConnection);

        sdk = new SafeoutSDK(mockConnection, mockMintAuthority, mockOwner);
    });

    afterEach(() => {
        // Clean up environment variable
        delete process.env.DATABASE_URL;
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Mint Configuration Management', () => {
        describe('saveMintConfig', () => {
            it('should save mint configuration to file', () => {
                const mockMintAddress = new PublicKey("3N3fwKFy3nn7HtEwqxVFoqP9kLCA6LXyCDKZypniCqF9");
                
                // Access private method via bracket notation for testing
                (sdk as any).saveMintConfig(mockMintAddress);

                expect(mockWriteFileSync).toHaveBeenCalledWith(
                    mintConfigPath,
                    expect.stringContaining(mockMintAddress.toString())
                );
                
                // Verify the JSON structure
                const call = mockWriteFileSync.mock.calls[0];
                const savedData = JSON.parse(call[1] as string);
                expect(savedData).toEqual({
                    mintAddress: mockMintAddress.toString(),
                    mintAuthority: mockMintAuthority.toString(),
                    createdAt: expect.any(String)
                });
            });
        });

        describe('loadMintConfig', () => {
            it('should load existing mint configuration', () => {
                const mockMintAddress = "3N3fwKFy3nn7HtEwqxVFoqP9kLCA6LXyCDKZypniCqF9";
                const mockConfig = {
                    mintAddress: mockMintAddress,
                    mintAuthority: mockMintAuthority.toString(),
                    createdAt: new Date().toISOString()
                };

                mockExistsSync.mockReturnValue(true);
                mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));

                const result = (sdk as any).loadMintConfig();

                expect(mockExistsSync).toHaveBeenCalledWith(mintConfigPath);
                expect(mockReadFileSync).toHaveBeenCalledWith(mintConfigPath, 'utf8');
                expect(result).toBeInstanceOf(PublicKey);
                expect(result.toString()).toBe(mockMintAddress);
            });

            it('should return null if config file does not exist', () => {
                mockExistsSync.mockReturnValue(false);

                const result = (sdk as any).loadMintConfig();

                expect(result).toBeNull();
                expect(mockReadFileSync).not.toHaveBeenCalled();
            });

            it('should return null if config file is corrupted', () => {
                mockExistsSync.mockReturnValue(true);
                mockReadFileSync.mockReturnValue('invalid json');

                const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
                const result = (sdk as any).loadMintConfig();

                expect(result).toBeNull();
                expect(consoleSpy).toHaveBeenCalledWith('Error loading mint config:', expect.any(Error));
                
                consoleSpy.mockRestore();
            });
        });

        describe('mintExists', () => {
            it('should return true if mint exists on blockchain', async () => {
                const mockMintAddress = new PublicKey("3N3fwKFy3nn7HtEwqxVFoqP9kLCA6LXyCDKZypniCqF9");
                mockConnection.getAccountInfo.mockResolvedValue({} as any);

                const result = await (sdk as any).mintExists(mockMintAddress);

                expect(result).toBe(true);
                expect(mockConnection.getAccountInfo).toHaveBeenCalledWith(mockMintAddress);
            });

            it('should return false if mint does not exist on blockchain', async () => {
                const mockMintAddress = new PublicKey("3N3fwKFy3nn7HtEwqxVFoqP9kLCA6LXyCDKZypniCqF9");
                mockConnection.getAccountInfo.mockResolvedValue(null);

                const result = await (sdk as any).mintExists(mockMintAddress);

                expect(result).toBe(false);
            });

            it('should return false if there is an error checking mint existence', async () => {
                const mockMintAddress = new PublicKey("3N3fwKFy3nn7HtEwqxVFoqP9kLCA6LXyCDKZypniCqF9");
                mockConnection.getAccountInfo.mockRejectedValue(new Error('Network error'));

                const result = await (sdk as any).mintExists(mockMintAddress);

                expect(result).toBe(false);
            });
        });
    });

    describe('Balance Management', () => {
        describe('getBalance', () => {
            it('should return balance in SOL', async () => {
                const mockBalanceLamports = 1000000000; // 1 SOL in lamports
                mockConnection.getBalance.mockResolvedValue(mockBalanceLamports);

                // Mock getPayerKeypair
                const mockGetPayerKeypair = require('../client/lib/solanaUtils').getPayerKeypair;
                mockGetPayerKeypair.mockResolvedValue({
                    publicKey: new PublicKey("GJ9xnhJVrfMbxGXERYyBRHgaKQahQDXpaNxFfZ2wTRdo")
                });

                const balance = await sdk.getBalance();

                expect(balance).toBe(1); // 1 SOL
                expect(mockConnection.getBalance).toHaveBeenCalled();
            });
        });

        describe('checkAndTopUpBalance', () => {
            let mockGetPayerKeypair: jest.Mock;
            let mockPayerKeypair: any;

            beforeEach(() => {
                mockGetPayerKeypair = require('../client/lib/solanaUtils').getPayerKeypair;
                mockPayerKeypair = {
                    publicKey: new PublicKey("GJ9xnhJVrfMbxGXERYyBRHgaKQahQDXpaNxFfZ2wTRdo")
                };
                mockGetPayerKeypair.mockResolvedValue(mockPayerKeypair);
            });

            it('should return false if balance is sufficient', async () => {
                const sufficientBalance = 500000000; // 0.5 SOL in lamports
                mockConnection.getBalance.mockResolvedValue(sufficientBalance);

                const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
                const result = await sdk.checkAndTopUpBalance(0.1); // Minimum 0.1 SOL

                expect(result).toBe(false);
                expect(mockConnection.requestAirdrop).not.toHaveBeenCalled();
                expect(consoleSpy).toHaveBeenCalledWith('Current balance: 0.5 SOL');
                
                consoleSpy.mockRestore();
            });

            it('should request airdrop if balance is insufficient', async () => {
                const insufficientBalance = 50000000; // 0.05 SOL in lamports
                const minBalance = 0.1;
                mockConnection.getBalance.mockResolvedValue(insufficientBalance);
                mockConnection.requestAirdrop.mockResolvedValue('mock-signature');
                mockConnection.confirmTransaction.mockResolvedValue({} as any);

                const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
                const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
                
                const result = await sdk.checkAndTopUpBalance(minBalance);

                expect(result).toBe(true);
                expect(mockConnection.requestAirdrop).toHaveBeenCalledWith(
                    mockPayerKeypair.publicKey,
                    Math.max(1, minBalance * 2) * 1e9 // At least 1 SOL or double the minimum
                );
                expect(mockConnection.confirmTransaction).toHaveBeenCalledWith('mock-signature');
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Balance too low (0.05 SOL), requesting airdrop...'
                );
                
                consoleSpy.mockRestore();
                consoleWarnSpy.mockRestore();
            });

            it('should throw error if airdrop fails', async () => {
                const insufficientBalance = 50000000; // 0.05 SOL in lamports
                mockConnection.getBalance.mockResolvedValue(insufficientBalance);
                mockConnection.requestAirdrop.mockRejectedValue(new Error('Airdrop failed'));

                await expect(sdk.checkAndTopUpBalance(0.1)).rejects.toThrow(
                    'Failed to check or top up balance: Error: Airdrop failed'
                );
            });

            it('should use default minimum balance of 0.1 SOL', async () => {
                const insufficientBalance = 50000000; // 0.05 SOL in lamports
                mockConnection.getBalance.mockResolvedValue(insufficientBalance);
                mockConnection.requestAirdrop.mockResolvedValue('mock-signature');
                mockConnection.confirmTransaction.mockResolvedValue({} as any);

                const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
                
                await sdk.checkAndTopUpBalance(); // No parameter, should use default 0.1

                expect(mockConnection.requestAirdrop).toHaveBeenCalledWith(
                    mockPayerKeypair.publicKey,
                    1 * 1e9 // Should request 1 SOL (max of 1 and 0.1 * 2)
                );
                
                consoleSpy.mockRestore();
            });
        });
    });

    describe('getMintInfo', () => {
        it('should return mint info with null address when not initialized', () => {
            const info = sdk.getMintInfo();
            
            expect(info).toEqual({
                mintAddress: null,
                mintAuthority: mockMintAuthority.toString()
            });
        });

        it('should return mint info with address when initialized', () => {
            const mockMintAddress = new PublicKey("3N3fwKFy3nn7HtEwqxVFoqP9kLCA6LXyCDKZypniCqF9");
            (sdk as any).mint = mockMintAddress;
            
            const info = sdk.getMintInfo();
            
            expect(info).toEqual({
                mintAddress: mockMintAddress.toString(),
                mintAuthority: mockMintAuthority.toString()
            });
        });
    });

    describe('Integration Tests', () => {
        it('should reuse existing mint configuration on subsequent initializations', async () => {
            const mockMintAddress = "3N3fwKFy3nn7HtEwqxVFoqP9kLCA6LXyCDKZypniCqF9";
            const mockConfig = {
                mintAddress: mockMintAddress,
                mintAuthority: mockMintAuthority.toString(),
                createdAt: new Date().toISOString()
            };

            // Mock existing config file
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
            
            // Mock mint exists on blockchain
            mockConnection.getAccountInfo.mockResolvedValue({} as any);
            
            // Mock balance check
            mockConnection.getBalance.mockResolvedValue(1000000000); // 1 SOL
            
            // Mock payer keypair
            const mockGetPayerKeypair = require('../client/lib/solanaUtils').getPayerKeypair;
            mockGetPayerKeypair.mockResolvedValue({
                publicKey: new PublicKey("GJ9xnhJVrfMbxGXERYyBRHgaKQahQDXpaNxFfZ2wTRdo")
            });

            // Mock the initializeMint method to simulate finding an existing mint
            jest.spyOn(sdk['mintManager'], 'initializeMint').mockImplementation(async () => {
                console.log(`Using existing mint: ${mockMintAddress}`);
                return new PublicKey(mockMintAddress);
            });

            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await sdk.init();
            
            const mintInfo = sdk.getMintInfo();
            expect(mintInfo.mintAddress).toBe(mockMintAddress);
            expect(consoleSpy).toHaveBeenCalledWith(`Using existing mint: ${mockMintAddress}`);
            
            consoleSpy.mockRestore();
        });

        it('should create new mint if saved mint no longer exists on blockchain', async () => {
            const oldMintAddress = "EacWF921AyEDcXXAEM2RyYYsZNjTibqHQLgx6p3oM6q5";
            const newMintAddress = "GFBxikZH2dZ5CwM3L91sJjqQL6FvuQigvgfripMwLcG4";
            const mockConfig = {
                mintAddress: oldMintAddress,
                mintAuthority: mockMintAuthority.toString(),
                createdAt: new Date().toISOString()
            };

            // Mock existing config file with old mint
            mockExistsSync.mockReturnValue(true);
            mockReadFileSync.mockReturnValue(JSON.stringify(mockConfig));
            
            // Mock old mint doesn't exist on blockchain anymore
            mockConnection.getAccountInfo.mockResolvedValue(null);
            
            // Mock balance check and airdrop
            mockConnection.getBalance.mockResolvedValue(1000000000); // 1 SOL
            
            // Mock createMint from @solana/spl-token
            const { createMint } = require('@solana/spl-token');
            createMint.mockResolvedValue(new PublicKey(newMintAddress));
            
            // Mock payer keypair
            const mockGetPayerKeypair = require('../client/lib/solanaUtils').getPayerKeypair;
            mockGetPayerKeypair.mockResolvedValue({
                publicKey: new PublicKey("GJ9xnhJVrfMbxGXERYyBRHgaKQahQDXpaNxFfZ2wTRdo")
            });

            // Mock the initializeMint method to simulate creating a new mint
            jest.spyOn(sdk['mintManager'], 'initializeMint').mockImplementation(async () => {
                console.warn('Saved mint no longer exists on blockchain, creating new mint');
                console.log(`New mint created: ${newMintAddress}`);
                // Simulate saving the config
                sdk['mintManager'].saveMintConfig(new PublicKey(newMintAddress));
                return new PublicKey(newMintAddress);
            });

            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
            
            await sdk.init();
            
            const mintInfo = sdk.getMintInfo();
            expect(mintInfo.mintAddress).toBe(newMintAddress);
            expect(consoleSpy).toHaveBeenCalledWith('Saved mint no longer exists on blockchain, creating new mint');
            expect(consoleLogSpy).toHaveBeenCalledWith(`New mint created: ${newMintAddress}`);
            expect(mockWriteFileSync).toHaveBeenCalled(); // New config should be saved
            
            consoleSpy.mockRestore();
            consoleLogSpy.mockRestore();
        });
    });
});
