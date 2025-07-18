import { SafeoutSDK } from '../client/class_safeout';
import { Connection, PublicKey } from '@solana/web3.js';

describe('Refactored SafeoutSDK', () => {
  let sdk: SafeoutSDK;

  beforeEach(() => {
    const connection = new Connection('https://api.devnet.solana.com');
    const mintAuthority = new PublicKey('11111111111111111111111111111111'); // Dummy key
    const owner = new PublicKey('11111111111111111111111111111111'); // Dummy key
    
    sdk = new SafeoutSDK(connection, mintAuthority, owner);
  });

  test('SDK can be instantiated', () => {
    expect(sdk).toBeDefined();
    expect(sdk).toBeInstanceOf(SafeoutSDK);
  });

  test('SDK has all public methods', () => {
    // Product CRUD methods
    expect(typeof sdk.createDppProduct).toBe('function');
    expect(typeof sdk.createBatchDppProducts).toBe('function');
    expect(typeof sdk.updateDppProduct).toBe('function');
    expect(typeof sdk.updateBatchDppProducts).toBe('function');
    expect(typeof sdk.deleteDppProduct).toBe('function');
    expect(typeof sdk.deleteBatchDppProducts).toBe('function');

    // Authenticity verification
    expect(typeof sdk.checkAuthenticityOnBlockchain).toBe('function');

    // Utility methods
    expect(typeof sdk.checkAndTopUpBalance).toBe('function');
    expect(typeof sdk.getMintInfo).toBe('function');
    expect(typeof sdk.getBalance).toBe('function');

    // History methods
    expect(typeof sdk.getProductHistory).toBe('function');
    expect(typeof sdk.getAllProductHistory).toBe('function');
    expect(typeof sdk.getProductHistoryByAction).toBe('function');
    expect(typeof sdk.getProductHistoryByUser).toBe('function');
    expect(typeof sdk.getProductHistoryByDateRange).toBe('function');
    expect(typeof sdk.getProductHistoryStats).toBe('function');

    // Initialization method
    expect(typeof sdk.init).toBe('function');
  });

  test('Methods throw error when SDK not initialized', async () => {
    const productData = {
      productUid: 'test-123',
      info: {
        productId: 'test-123',
        productName: 'Test Product',
        manufacturer: {
          name: 'Test Manufacturer',
          address: 'Test Address',
          contactEmail: 'test@example.com'
        },
        dateOfManufacture: '2024-01-01',
        placeOfManufacture: 'Test Place',
        productCategory: 'Test Category',
        materialComposition: [],
        hazardousSubstances: [],
        endOfLifeInstructions: 'Test instructions',
        digitalLink: 'https://example.com'
      }
    };

    await expect(sdk.createDppProduct(productData)).rejects.toThrow('SDK is not initialized');
    await expect(sdk.getProductHistory('test-123')).rejects.toThrow('SDK is not initialized');
    await expect(sdk.checkAuthenticityOnBlockchain('test-123')).rejects.toThrow('SDK is not initialized');
  });
});
