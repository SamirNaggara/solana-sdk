import { SafeoutSDK } from '../client/class_safeout';
import { ProductInput } from '../client/src/types';

describe('Basic Hash Calculation', () => {
  let sdk: SafeoutSDK;

  beforeAll(() => {
    sdk = new SafeoutSDK();
  });

  const sampleProductData: ProductInput = {
    productUid: "test-product-123",
    info: {
      productName: { value: "EcoLaptop Pro", accessibilityLevel: "public" },
      dateOfManufacture: { value: "2024-01-15", accessibilityLevel: "public" },
      placeOfManufacture: { value: "France", accessibilityLevel: "public" },
      productCategory: { value: "Electronics", accessibilityLevel: "public" },
      repairabilityScore: { value: 8.5, accessibilityLevel: "public" },
      endOfLifeInstructions: { value: "Recycle at certified center", accessibilityLevel: "public" },
      digitalLink: { value: "https://example.com/product/123", accessibilityLevel: "public" },
      signature: { value: "", accessibilityLevel: "public" },
      manufacturer: {
        name: { value: "GreenTech Corp", accessibilityLevel: "public" },
        address: { value: "123 Innovation Street, Paris", accessibilityLevel: "owner" },
        contactEmail: { value: "contact@greentech.com", accessibilityLevel: "owner" }
      },
      materialComposition: [
        {
          material: { value: "Aluminum", accessibilityLevel: "public" },
          percentage: { value: 60, accessibilityLevel: "public" }
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

  test('should calculate hashes for all accessibility levels', () => {
    const result = sdk.calculateProductHash(sampleProductData);

    expect(result).toBeDefined();
    expect(result.publicHash).toBeDefined();
    expect(result.ownerHash).toBeDefined();
    expect(result.brandHash).toBeDefined();

    // Verify hash format (should be hex strings)
    expect(result.publicHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ownerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.brandHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('should produce different hashes for different accessibility levels', () => {
    const result = sdk.calculateProductHash(sampleProductData);

    // Each accessibility level should produce different hashes
    expect(result.publicHash).not.toBe(result.ownerHash);
    expect(result.publicHash).not.toBe(result.brandHash);
    expect(result.ownerHash).not.toBe(result.brandHash);
  });
});