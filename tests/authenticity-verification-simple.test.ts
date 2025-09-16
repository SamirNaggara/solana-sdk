import { SafeoutSDK } from '../client/class_safeout';
import { v4 as uuidv4 } from 'uuid';

describe('Authenticity Verification Simple Tests', () => {
  let sdk: SafeoutSDK;

  beforeAll(async () => {
    // Initialize SDK with test database
    sdk = new SafeoutSDK();
    await sdk.init({
      databaseUrl: process.env.DATABASE_URL || "postgresql://safeout:pide@localhost:4242/sdk-1",
      rpcUrl: "https://api.devnet.solana.com"
    });
  }, 30000);

  test('should return false for non-existent product', async () => {
    const fakeProductId = uuidv4();
    const result = await sdk.checkAuthenticityOnBlockchain(fakeProductId);

    expect(result).toBeDefined();
    expect(result.isOnBlockchain).toBe(false);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain("not found");

    console.log('Non-existent product result:', {
      isOnBlockchain: result.isOnBlockchain,
      isValid: result.isValid,
      reason: result.reason
    });
  }, 10000);

  test('should handle batch verification of non-existent products', async () => {
    const fakeIds = [uuidv4(), uuidv4(), uuidv4()];
    const results = await sdk.checkBatchAuthenticityOnBlockchain(fakeIds);

    expect(results).toBeInstanceOf(Map);
    expect(results.size).toBe(3);

    fakeIds.forEach(id => {
      const result = results.get(id);
      expect(result).toBeDefined();
      expect(result?.isOnBlockchain).toBe(false);
      expect(result?.isValid).toBe(false);
    });

    console.log('Batch verification results for non-existent products:',
      Array.from(results.entries()).map(([id, result]) => ({
        id: id.substring(0, 8) + '...',
        isOnBlockchain: result.isOnBlockchain,
        isValid: result.isValid
      }))
    );
  }, 15000);

  test('should validate public hash calculation function', () => {
    const testProductData = {
      productUid: uuidv4(),
      info: {
        productName: { value: "Test Product", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: "Test Factory", accessibilityLevel: "public" },
        productCategory: { value: "Test", accessibilityLevel: "public" },
        repairabilityScore: { value: 7.0, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Test disposal", accessibilityLevel: "public" },
        digitalLink: { value: "https://test.com", accessibilityLevel: "public" },

        manufacturer: {
          name: { value: "Test Corp", accessibilityLevel: "public" },
          address: { value: "Test Address", accessibilityLevel: "owner" },
          contactEmail: { value: "test@test.com", accessibilityLevel: "owner" }
        },
        materialComposition: [],
        hazardousSubstances: []
      }
    };

    // This should work without database or blockchain
    const hashes = sdk.calculateProductHash(testProductData);

    expect(hashes).toBeDefined();
    expect(hashes.publicHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashes.ownerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashes.brandHash).toMatch(/^[a-f0-9]{64}$/);

    console.log('Hash calculation test passed:', {
      publicHash: hashes.publicHash.substring(0, 16) + '...',
      ownerHash: hashes.ownerHash.substring(0, 16) + '...',
      brandHash: hashes.brandHash.substring(0, 16) + '...'
    });
  });

  test('should validate normalizeUserName function', () => {
    // Test the public normalizeUserName function
    expect(sdk.normalizeUserName('Test User')).toBe('test user');
    expect(sdk.normalizeUserName('Special@User#123')).toBe('special@user#123');
    expect(sdk.normalizeUserName('UPPERCASE')).toBe('uppercase');
    expect(sdk.normalizeUserName('  spaced  out  ')).toBe('spaced  out');

    console.log('Username normalization tests passed');
  });
});