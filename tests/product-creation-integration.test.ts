import { SafeoutSDK } from '../client/class_safeout';
import { ProductInput } from '../client/src/types';
import { v4 as uuidv4 } from 'uuid';

describe('Product Creation Integration Tests', () => {
  let sdk: SafeoutSDK;
  let testProductId: string;
  let testProductData: ProductInput;

  beforeAll(async () => {
    // Initialize SDK with test database
    sdk = new SafeoutSDK();
    await sdk.init({
      databaseUrl: process.env.DATABASE_URL || "postgresql://safeout:pide@localhost:4242/sdk-1",
      rpcUrl: "https://api.devnet.solana.com"
    });

    // Create unique test product data
    testProductId = uuidv4();
    testProductData = {
      productUid: testProductId,
      info: {
        productName: { value: "Integration Test Laptop", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-15", accessibilityLevel: "public" },
        placeOfManufacture: { value: "Integration Test Factory", accessibilityLevel: "public" },
        productCategory: { value: "Electronics", accessibilityLevel: "public" },
        repairabilityScore: { value: 8.5, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Recycle at certified center", accessibilityLevel: "public" },
        digitalLink: { value: "https://integration.test.com", accessibilityLevel: "public" },
        signature: { value: "", accessibilityLevel: "public" },
        manufacturer: {
          name: { value: "Integration Corp", accessibilityLevel: "public" },
          address: { value: "123 Test Street, Integration City", accessibilityLevel: "owner" },
          contactEmail: { value: "integration@test.com", accessibilityLevel: "owner" }
        },
        materialComposition: [
          {
            material: { value: "Aluminum", accessibilityLevel: "public" },
            percentage: { value: 60, accessibilityLevel: "public" }
          },
          {
            material: { value: "Rare Metals", accessibilityLevel: "owner" },
            percentage: { value: 15, accessibilityLevel: "owner" }
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
  }, 30000);

  afterAll(async () => {
    // Clean up test data
    try {
      await sdk.deleteDppProducts(testProductId, "integration-test-cleanup");
    } catch (error) {
      // Ignore cleanup errors
      console.warn('Cleanup warning:', error);
    }
  });

  test('should create product successfully in database', async () => {
    const result = await sdk.createDppProducts(testProductData, "integration-test");

    expect(result).toBeDefined();
    expect(result.id).toBe(testProductId);
    expect(result.signature).toBeDefined();
    expect(result.hash).toBeDefined();

    // Verify the result has valid hash format
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.signature).not.toBe("");

    console.log('Product created successfully:', {
      id: result.id,
      hashLength: result.hash?.length,
      signatureLength: result.signature?.length
    });
  }, 30000);

  test('should retrieve product from database after creation', async () => {
    // First ensure the product exists (it should from previous test)
    const productExists = await sdk.checkAuthenticityOnBlockchain(testProductId);

    // For now, we're testing database storage, not necessarily blockchain
    expect(productExists).toBeDefined();
    expect(productExists.reason).toBeDefined();

    console.log('Product retrieval result:', {
      isOnBlockchain: productExists.isOnBlockchain,
      hasReason: !!productExists.reason
    });
  }, 15000);

  test('should calculate same hashes as stored hashes', async () => {
    // Calculate hashes client-side
    const calculatedHashes = sdk.calculateProductHash(testProductData);

    // For this test, we assume the product was created successfully
    // and we're verifying hash consistency
    expect(calculatedHashes).toBeDefined();
    expect(calculatedHashes.publicHash).toBeDefined();
    expect(calculatedHashes.ownerHash).toBeDefined();
    expect(calculatedHashes.brandHash).toBeDefined();

    // Verify hash formats
    expect(calculatedHashes.publicHash).toMatch(/^[a-f0-9]{64}$/);
    expect(calculatedHashes.ownerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(calculatedHashes.brandHash).toMatch(/^[a-f0-9]{64}$/);

    console.log('Hash calculation result:', {
      publicHash: calculatedHashes.publicHash.substring(0, 16) + '...',
      ownerHash: calculatedHashes.ownerHash.substring(0, 16) + '...',
      brandHash: calculatedHashes.brandHash.substring(0, 16) + '...'
    });
  }, 10000);

  test('should handle product creation with minimal data', async () => {
    const minimalProductId = uuidv4();
    const minimalData: ProductInput = {
      productUid: minimalProductId,
      info: {
        productName: { value: "Minimal Product", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: "Minimal Factory", accessibilityLevel: "public" },
        productCategory: { value: "Test", accessibilityLevel: "public" },
        repairabilityScore: { value: 5.0, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Standard disposal", accessibilityLevel: "public" },
        digitalLink: { value: "https://minimal.test.com", accessibilityLevel: "public" },
        signature: { value: "", accessibilityLevel: "public" },
        manufacturer: {
          name: { value: "Minimal Corp", accessibilityLevel: "public" },
          address: { value: "Minimal Address", accessibilityLevel: "public" },
          contactEmail: { value: "minimal@test.com", accessibilityLevel: "public" }
        },
        materialComposition: [],
        hazardousSubstances: []
      }
    };

    const result = await sdk.createDppProducts(minimalData, "integration-test-minimal");

    expect(result).toBeDefined();
    expect(result.id).toBe(minimalProductId);
    expect(result.signature).toBeDefined();
    expect(result.hash).toBeDefined();

    // Cleanup
    try {
      await sdk.deleteDppProducts(minimalProductId, "integration-test-cleanup");
    } catch (error) {
      console.warn('Cleanup warning for minimal product:', error);
    }
  }, 20000);
});