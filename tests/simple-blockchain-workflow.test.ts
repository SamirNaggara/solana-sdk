import { SolanaDppSdk } from '../client/solana-dpp-sdk';
import { ProductInput } from '../client/src/types';
import { v4 as uuidv4 } from 'uuid';

describe('Simple Blockchain Workflow Test', () => {
  let sdk: SolanaDppSdk;
  let createdProducts: string[] = [];

  beforeAll(async () => {
    // Initialize SDK with test database and keys
    sdk = new SolanaDppSdk();
    await sdk.init({
      databaseUrl: process.env.DATABASE_URL || "postgresql://dpp:dpp@localhost:4242/sdk-1",
      rpcUrl: "https://api.devnet.solana.com",
      mintAuthorityPrivateKey: process.env.MINT_AUTHORITY_PRIVATE_KEY,
      ownerPrivateKey: process.env.OWNER_PRIVATE_KEY
    });
  }, 30000);

  afterAll(async () => {
    // Clean up all created products (using batch API)
    if (createdProducts.length > 0) {
      try {
        await sdk.deleteDppProducts(createdProducts, "simple-workflow-cleanup");
      } catch (error) {
        console.warn('Cleanup warning:', error.message);
      }
    }
  });

  test('SIMPLE WORKFLOW: Create product → Check existence on blockchain → Should work', async () => {
    // 1. Prepare simple test product data
    const productId = uuidv4();
    const productData: ProductInput = {
      productUid: productId,
      info: {
        productName: { value: "Simple Test Product", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: "Simple Factory", accessibilityLevel: "public" },
        productCategory: { value: "Test", accessibilityLevel: "public" },
        repairabilityScore: { value: 5.0, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Simple disposal", accessibilityLevel: "public" },
        digitalLink: { value: "https://simple.test.com", accessibilityLevel: "public" },
        manufacturer: {
          name: { value: "Simple Corp", accessibilityLevel: "public" },
          address: { value: "Simple Address", accessibilityLevel: "public" },
          contactEmail: { value: "simple@test.com", accessibilityLevel: "public" }
        },
        materialComposition: [],
        hazardousSubstances: []
      }
    };

    console.log('🚀 Creating product with ID:', productId);

    // 2. CREATE PRODUCT (using batch API with single product)
    const creationResults = await sdk.createDppProducts([productData], "simple-workflow-test");
    createdProducts.push(productId); // Track for cleanup

    // Verify creation was successful
    expect(creationResults).toBeDefined();
    expect(Array.isArray(creationResults)).toBe(true);
    expect(creationResults.length).toBe(1);

    const creationResult = creationResults[0];
    expect(creationResult.id).toBe(productId);
    expect(creationResult.signature).toBeDefined();
    expect(creationResult.hash).toBeDefined();
    expect(creationResult.signature).not.toBe("");

    console.log('✅ Product created successfully:', {
      id: creationResult.id,
      signatureLength: creationResult.signature?.length,
      hashLength: creationResult.hash?.length
    });

    // Small delay for blockchain processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('🔍 Checking simple existence on blockchain (no data verification)...');

    // 3. SIMPLE BLOCKCHAIN EXISTENCE CHECK (no original data, using batch API)
    const existenceResults = await sdk.checkAuthenticityOnBlockchain([{ productId }]);

    // 4. ASSERTIONS
    expect(existenceResults).toBeDefined();
    expect(existenceResults instanceof Map).toBe(true);
    expect(existenceResults.size).toBe(1);

    const existenceResult = existenceResults.get(productId);
    expect(existenceResult).toBeDefined();
    expect(existenceResult?.isOnBlockchain).toBe(true);
    expect(existenceResult?.signature).toBeDefined();
    expect(existenceResult?.signature).toBe(creationResult.signature);

    console.log('✅ Simple existence check passed!', {
      isOnBlockchain: existenceResult?.isOnBlockchain,
      isValid: existenceResult?.isValid,
      reason: existenceResult?.reason,
      signatureMatches: existenceResult?.signature === creationResult.signature
    });

    console.log('🎉 SIMPLE WORKFLOW TEST COMPLETED SUCCESSFULLY!');

  }, 60000);

  test('Test hash calculation consistency (client-side only)', () => {
    const productData: ProductInput = {
      productUid: uuidv4(),
      info: {
        productName: { value: "Hash Test Product", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: "Hash Factory", accessibilityLevel: "public" },
        productCategory: { value: "Test", accessibilityLevel: "public" },
        repairabilityScore: { value: 5.0, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Hash disposal", accessibilityLevel: "public" },
        digitalLink: { value: "https://hash.test.com", accessibilityLevel: "public" },

        manufacturer: {
          name: { value: "Hash Corp", accessibilityLevel: "public" },
          address: { value: "Hash Address", accessibilityLevel: "public" },
          contactEmail: { value: "hash@test.com", accessibilityLevel: "public" }
        },
        materialComposition: [],
        hazardousSubstances: []
      }
    };

    const hash1 = sdk.calculateProductHash(productData);
    const hash2 = sdk.calculateProductHash(productData);

    // Should produce identical hashes
    expect(hash1.publicHash).toBe(hash2.publicHash);
    expect(hash1.ownerHash).toBe(hash2.ownerHash);
    expect(hash1.brandHash).toBe(hash2.brandHash);

    console.log('✅ Hash calculation consistency verified:', {
      publicHash: hash1.publicHash.substring(0, 16) + '...',
      ownerHash: hash1.ownerHash.substring(0, 16) + '...',
      brandHash: hash1.brandHash.substring(0, 16) + '...'
    });
  });
});