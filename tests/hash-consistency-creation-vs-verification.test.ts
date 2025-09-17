import { SafeoutSDK } from '../client/class_safeout';
import { ProductInput } from '../client/src/types';
import { v4 as uuidv4 } from 'uuid';

describe('Hash Consistency: Creation vs Verification', () => {
  let sdk: SafeoutSDK;
  let testProductId: string;
  let originalProductData: ProductInput;

  beforeAll(async () => {
    sdk = new SafeoutSDK();
    await sdk.init({
      databaseUrl: process.env.DATABASE_URL || "postgresql://safeout:pide@localhost:4242/sdk-1",
      rpcUrl: "https://api.devnet.solana.com",
      mintAuthorityPrivateKey: process.env.MINT_AUTHORITY_PRIVATE_KEY,
      ownerPrivateKey: process.env.OWNER_PRIVATE_KEY
    });
  }, 30000);

  afterAll(async () => {
    if (testProductId) {
      try {
        await sdk.deleteDppProducts([testProductId], "hash-consistency-cleanup");
      } catch (error) {
        console.warn('Cleanup error:', error.message);
      }
    }
  });

  test('Should have EXACTLY the same hashes between creation and verification', async () => {
    testProductId = uuidv4();

    // Original product data with mixed access levels
    originalProductData = {
      productUid: testProductId,
      info: {
        productName: { value: "Hash Test Product", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: "Test Factory", accessibilityLevel: "public" },
        productCategory: { value: "Electronics", accessibilityLevel: "public" },
        repairabilityScore: { value: 8.5, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Recycle properly", accessibilityLevel: "public" },
        digitalLink: { value: "https://test.example.com", accessibilityLevel: "public" },

        manufacturer: {
          name: { value: "TestTech Corp", accessibilityLevel: "public" },
          address: { value: "123 Test Street", accessibilityLevel: "owner" },
          contactEmail: { value: "contact@testtech.com", accessibilityLevel: "owner" }
        },

        materialComposition: [
          {
            material: { value: "Aluminum", accessibilityLevel: "public" },
            percentage: { value: 60, accessibilityLevel: "public" }
          },
          {
            material: { value: "Plastic", accessibilityLevel: "owner" },
            percentage: { value: 25, accessibilityLevel: "owner" }
          }
        ],

        hazardousSubstances: [
          {
            substance: { value: "Lead", accessibilityLevel: "private" },
            casNumber: { value: "7439-92-1", accessibilityLevel: "private" },
            concentration: { value: "0.05", accessibilityLevel: "private" }
          },
          {
            substance: { value: "Mercury", accessibilityLevel: "owner" },
            casNumber: { value: "7439-97-6", accessibilityLevel: "owner" },
            concentration: { value: "0.02", accessibilityLevel: "owner" }
          }
        ]
      }
    };

    console.log('\n🔍 STEP 1: Calculate hash BEFORE creation (client-side)');
    const preCreationHashes = sdk.calculateProductHash(originalProductData);
    console.log('Pre-creation Public Hash:', preCreationHashes.publicHash);
    console.log('Pre-creation Owner Hash:', preCreationHashes.ownerHash);
    console.log('Pre-creation Brand Hash:', preCreationHashes.brandHash);

    console.log('\n🚀 STEP 2: Create product on blockchain');
    const creationResults = await sdk.createDppProducts([originalProductData], "hash-consistency-test");
    const createdProduct = creationResults[0];

    expect(createdProduct.id).toBe(testProductId);
    console.log('Product created with signature:', createdProduct.signature);

    // Wait for blockchain processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n🔍 STEP 3: Verify authenticity WITH original data');
    const verificationResults = await sdk.checkAuthenticityOnBlockchain([{
      productId: testProductId,
      productData: originalProductData
    }]);

    const verificationResult = verificationResults.get(testProductId);
    expect(verificationResult).toBeDefined();
    expect(verificationResult?.isOnBlockchain).toBe(true);

    console.log('Verification result:', {
      isValid: verificationResult?.isValid,
      reason: verificationResult?.reason
    });

    if (verificationResult?.hashes) {
      console.log('\n📊 HASH COMPARISON:');
      console.log('='.repeat(80));

      console.log('CLIENT-SIDE (pre-creation):');
      console.log('  Public:  ', preCreationHashes.publicHash);
      console.log('  Owner:   ', preCreationHashes.ownerHash);
      console.log('  Brand:   ', preCreationHashes.brandHash);

      console.log('\nBLOCKCHAIN (verification):');
      console.log('  Public:  ', verificationResult.hashes.publicHash);
      console.log('  Owner:   ', verificationResult.hashes.ownerHash);
      console.log('  Brand:   ', verificationResult.hashes.brandHash);

      console.log('\nMATCH STATUS:');
      const publicMatch = preCreationHashes.publicHash === verificationResult.hashes.publicHash;
      const ownerMatch = preCreationHashes.ownerHash === verificationResult.hashes.ownerHash;
      const brandMatch = preCreationHashes.brandHash === verificationResult.hashes.brandHash;

      console.log('  Public Match:', publicMatch ? '✅' : '❌');
      console.log('  Owner Match: ', ownerMatch ? '✅' : '❌');
      console.log('  Brand Match: ', brandMatch ? '✅' : '❌');
      console.log('='.repeat(80));

      // CRITICAL ASSERTIONS
      expect(publicMatch).toBe(true);
      expect(ownerMatch).toBe(true);
      expect(brandMatch).toBe(true);
      expect(verificationResult.isValid).toBe(true);

      console.log('\n✅ SUCCESS: All hashes match perfectly!');
    } else {
      throw new Error('No hashes returned from verification');
    }

  }, 60000);

  test('Should also match with simple existence check (no data provided)', async () => {
    console.log('\n🔍 STEP 4: Simple existence check (no original data)');

    const simpleResults = await sdk.checkAuthenticityOnBlockchain([{
      productId: testProductId
    }]);

    const simpleResult = simpleResults.get(testProductId);
    expect(simpleResult).toBeDefined();
    expect(simpleResult?.isOnBlockchain).toBe(true);

    console.log('Simple check result:', {
      isOnBlockchain: simpleResult?.isOnBlockchain,
      isValid: simpleResult?.isValid,
      reason: simpleResult?.reason
    });

    // For simple check, isValid should be true just for existence
    // (since we're not comparing against provided data)
    expect(simpleResult?.isValid).toBe(true);
  });
});