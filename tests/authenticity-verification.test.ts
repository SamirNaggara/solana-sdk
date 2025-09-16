import { SafeoutSDK } from '../client/class_safeout';
import { v4 as uuidv4 } from 'uuid';
import { ProductInput, AuthenticityResult } from '../client/src/types';

describe('Authenticity Verification Tests', () => {
  let sdk: SafeoutSDK;
  let testProductId: string;
  let testProductData: ProductInput;

  beforeAll(async () => {
    // Initialize SDK
    sdk = new SafeoutSDK();
    await sdk.init({
      databaseUrl: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/test_db",
      rpcUrl: "https://api.devnet.solana.com"
    });

    // Create test product data
    testProductId = `test-product-${uuidv4()}`;
    testProductData = {
      productUid: testProductId,
      info: {
        productName: { value: "Test EcoLaptop", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-15", accessibilityLevel: "public" },
        placeOfManufacture: { value: "France", accessibilityLevel: "public" },
        productCategory: { value: "Electronics", accessibilityLevel: "public" },
        repairabilityScore: { value: 8.5, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Recycle at certified center", accessibilityLevel: "public" },
        digitalLink: { value: "https://test.example.com", accessibilityLevel: "public" },
        signature: { value: "", accessibilityLevel: "public" },
        manufacturer: {
          name: { value: "TestTech Corp", accessibilityLevel: "public" },
          address: { value: "123 Test Street, Paris", accessibilityLevel: "owner" },
          contactEmail: { value: "test@testtech.com", accessibilityLevel: "owner" }
        },
        materialComposition: [
          {
            material: { value: "Aluminum", accessibilityLevel: "public" },
            percentage: { value: 60, accessibilityLevel: "public" }
          },
          {
            material: { value: "Plastic", accessibilityLevel: "public" },
            percentage: { value: 25, accessibilityLevel: "public" }
          }
        ],
        hazardousSubstances: [
          {
            substance: { value: "Lead", accessibilityLevel: "private" },
            casNumber: { value: "7439-92-1", accessibilityLevel: "private" },
            concentration: { value: "0.05", accessibilityLevel: "private" }
          }
        ]
      }
    };
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await sdk.deleteDppProducts(testProductId, "test-cleanup");
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Product Creation and Basic Verification', () => {
    test('should create product successfully', async () => {
      const result = await sdk.createDppProducts(testProductData, "jest-test");

      expect(result).toBeDefined();
      expect(result.id).toBe(testProductId);
      expect(result.signature).toBeDefined();
      expect(result.hash).toBeDefined();
    }, 30000);

    test('should verify product existence on blockchain (simple mode)', async () => {
      const result = await sdk.checkAuthenticityOnBlockchain(testProductId);

      expect(result).toBeDefined();
      expect(result.isOnBlockchain).toBe(true);
      expect(result.signature).toBeDefined();
      expect(result.reason).toBeDefined();

      console.log('Simple verification result:', {
        isOnBlockchain: result.isOnBlockchain,
        isValid: result.isValid,
        reason: result.reason
      });
    }, 15000);

    test('should verify product with original data (complete mode)', async () => {
      const result = await sdk.checkAuthenticityOnBlockchain(testProductId, testProductData);

      expect(result).toBeDefined();
      expect(result.isOnBlockchain).toBe(true);
      expect(result.isValid).toBe(true);
      expect(result.signature).toBeDefined();
      expect(result.hashes).toBeDefined();
      expect(result.hashes?.publicHash).toBeDefined();
      expect(result.hashes?.ownerHash).toBeDefined();
      expect(result.hashes?.brandHash).toBeDefined();
      expect(result.reason).toContain("authentic");

      console.log('Complete verification result:', {
        isOnBlockchain: result.isOnBlockchain,
        isValid: result.isValid,
        reason: result.reason,
        hashesPresent: !!result.hashes
      });
    }, 15000);
  });

  describe('Hash Synchronization Tests', () => {
    test('should produce identical hashes between calculateProductHash and blockchain', async () => {
      // Calculate hash client-side
      const calculatedHashes = sdk.calculateProductHash(testProductData);

      // Get hash from blockchain
      const blockchainResult = await sdk.checkAuthenticityOnBlockchain(testProductId, testProductData);

      expect(blockchainResult.isValid).toBe(true);
      expect(blockchainResult.hashes).toBeDefined();

      // Verify perfect hash synchronization
      expect(blockchainResult.hashes?.publicHash).toBe(calculatedHashes.publicHash);
      expect(blockchainResult.hashes?.ownerHash).toBe(calculatedHashes.ownerHash);
      expect(blockchainResult.hashes?.brandHash).toBe(calculatedHashes.brandHash);

      console.log('Hash synchronization verification:', {
        clientPublicHash: calculatedHashes.publicHash.substring(0, 16) + '...',
        blockchainPublicHash: blockchainResult.hashes?.publicHash.substring(0, 16) + '...',
        matches: calculatedHashes.publicHash === blockchainResult.hashes?.publicHash
      });
    }, 15000);

    test('should detect data tampering', async () => {
      // Create modified data
      const modifiedData = JSON.parse(JSON.stringify(testProductData));
      modifiedData.info.productName.value = "TAMPERED EcoLaptop";

      const result = await sdk.checkAuthenticityOnBlockchain(testProductId, modifiedData);

      expect(result.isOnBlockchain).toBe(true);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("mismatch");

      console.log('Tampering detection result:', {
        isOnBlockchain: result.isOnBlockchain,
        isValid: result.isValid,
        reason: result.reason
      });
    }, 15000);
  });

  describe('Edge Cases', () => {
    test('should handle non-existent product', async () => {
      const fakeProductId = `fake-product-${uuidv4()}`;
      const result = await sdk.checkAuthenticityOnBlockchain(fakeProductId);

      expect(result.isOnBlockchain).toBe(false);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("not found");

      console.log('Non-existent product result:', {
        isOnBlockchain: result.isOnBlockchain,
        isValid: result.isValid,
        reason: result.reason
      });
    }, 10000);

    test('should handle non-existent product with data', async () => {
      const fakeProductId = `fake-product-${uuidv4()}`;
      const fakeData = { ...testProductData, productUid: fakeProductId };

      const result = await sdk.checkAuthenticityOnBlockchain(fakeProductId, fakeData);

      expect(result.isOnBlockchain).toBe(false);
      expect(result.isValid).toBe(false);
      expect(result.reason).toContain("not found");
    }, 10000);
  });

  describe('Batch Verification', () => {
    test('should verify multiple products', async () => {
      const results = await sdk.checkBatchAuthenticityOnBlockchain([testProductId]);

      expect(results).toBeInstanceOf(Map);
      expect(results.size).toBe(1);

      const result = results.get(testProductId);
      expect(result).toBeDefined();
      expect(result?.isOnBlockchain).toBe(true);

      console.log('Batch verification result:', {
        productCount: results.size,
        isOnBlockchain: result?.isOnBlockchain,
        isValid: result?.isValid
      });
    }, 15000);
  });
});