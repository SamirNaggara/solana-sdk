import { SafeoutSDK } from '../client/class_safeout';
import { ProductInput } from '../client/src/types';

describe('Hash Consistency', () => {
  let sdk: SafeoutSDK;

  beforeAll(() => {
    sdk = new SafeoutSDK();
  });

  const sampleProductData: ProductInput = {
    productUid: "consistency-test-456",
    info: {
      productName: { value: "Test Product", accessibilityLevel: "public" },
      dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
      placeOfManufacture: { value: "Test Location", accessibilityLevel: "public" },
      productCategory: { value: "Test Category", accessibilityLevel: "public" },
      repairabilityScore: { value: 7.0, accessibilityLevel: "public" },
      endOfLifeInstructions: { value: "Test instructions", accessibilityLevel: "public" },
      digitalLink: { value: "https://test.com", accessibilityLevel: "public" },
      signature: { value: "", accessibilityLevel: "public" },
      manufacturer: {
        name: { value: "Test Corp", accessibilityLevel: "public" },
        address: { value: "Test Address", accessibilityLevel: "owner" },
        contactEmail: { value: "test@test.com", accessibilityLevel: "owner" }
      },
      materialComposition: [],
      hazardousSubstances: []
    }
  };

  test('should produce consistent hashes for identical data', () => {
    const result1 = sdk.calculateProductHash(sampleProductData);
    const result2 = sdk.calculateProductHash(sampleProductData);

    expect(result1.publicHash).toBe(result2.publicHash);
    expect(result1.ownerHash).toBe(result2.ownerHash);
    expect(result1.brandHash).toBe(result2.brandHash);
  });

  test('should produce consistent hashes across multiple calculations', () => {
    const results = [];
    for (let i = 0; i < 10; i++) {
      results.push(sdk.calculateProductHash(sampleProductData));
    }

    const firstResult = results[0];
    for (let i = 1; i < results.length; i++) {
      expect(results[i].publicHash).toBe(firstResult.publicHash);
      expect(results[i].ownerHash).toBe(firstResult.ownerHash);
      expect(results[i].brandHash).toBe(firstResult.brandHash);
    }
  });

  test('should produce different hashes for different product UIDs', () => {
    const data1 = JSON.parse(JSON.stringify(sampleProductData));
    const data2 = JSON.parse(JSON.stringify(sampleProductData));
    data2.productUid = "different-uid-789";

    const result1 = sdk.calculateProductHash(data1);
    const result2 = sdk.calculateProductHash(data2);

    expect(result1.publicHash).not.toBe(result2.publicHash);
    expect(result1.ownerHash).not.toBe(result2.ownerHash);
    expect(result1.brandHash).not.toBe(result2.brandHash);
  });
});