import { SafeoutSDK } from '../client/class_safeout';
import { ProductInput } from '../client/src/types';

describe('Hash Edge Cases', () => {
  let sdk: SafeoutSDK;

  beforeAll(() => {
    sdk = new SafeoutSDK();
  });

  test('should handle empty arrays in material composition', () => {
    const dataWithEmptyArrays: ProductInput = {
      productUid: "empty-arrays-test",
      info: {
        productName: { value: "Empty Arrays Product", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: "Test Location", accessibilityLevel: "public" },
        productCategory: { value: "Test", accessibilityLevel: "public" },
        repairabilityScore: { value: 5.0, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Test instructions", accessibilityLevel: "public" },
        digitalLink: { value: "https://test.com", accessibilityLevel: "public" },
        signature: { value: "", accessibilityLevel: "public" },
        manufacturer: {
          name: { value: "Test Corp", accessibilityLevel: "public" },
          address: { value: "Test Address", accessibilityLevel: "public" },
          contactEmail: { value: "test@test.com", accessibilityLevel: "public" }
        },
        materialComposition: [],
        hazardousSubstances: []
      }
    };

    const result = sdk.calculateProductHash(dataWithEmptyArrays);

    expect(result).toBeDefined();
    expect(result.publicHash).toBeDefined();
    expect(result.ownerHash).toBeDefined();
    expect(result.brandHash).toBeDefined();
  });

  test('should handle unicode characters in product data', () => {
    const unicodeData: ProductInput = {
      productUid: "unicode-test-123",
      info: {
        productName: { value: "Product™ 🌱 环保产品", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: "中国 • France", accessibilityLevel: "public" },
        productCategory: { value: "électronique", accessibilityLevel: "public" },
        repairabilityScore: { value: 8.5, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "♻️ Recycler au centre certifié", accessibilityLevel: "public" },
        digitalLink: { value: "https://test.com/产品", accessibilityLevel: "public" },
        signature: { value: "", accessibilityLevel: "public" },
        manufacturer: {
          name: { value: "Corporation® 环保科技", accessibilityLevel: "public" },
          address: { value: "123 Straße, München", accessibilityLevel: "public" },
          contactEmail: { value: "contact@环保.com", accessibilityLevel: "public" }
        },
        materialComposition: [
          {
            material: { value: "铝合金", accessibilityLevel: "public" },
            percentage: { value: 60, accessibilityLevel: "public" }
          }
        ],
        hazardousSubstances: []
      }
    };

    const result = sdk.calculateProductHash(unicodeData);

    expect(result).toBeDefined();
    expect(result.publicHash).toBeDefined();
    expect(result.ownerHash).toBeDefined();
    expect(result.brandHash).toBeDefined();
  });

  test('should handle very long strings', () => {
    const longString = "A".repeat(10000);

    const longStringData: ProductInput = {
      productUid: "long-string-test",
      info: {
        productName: { value: "Long String Product", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: longString, accessibilityLevel: "public" },
        productCategory: { value: "Test", accessibilityLevel: "public" },
        repairabilityScore: { value: 5.0, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Test", accessibilityLevel: "public" },
        digitalLink: { value: "https://test.com", accessibilityLevel: "public" },
        signature: { value: "", accessibilityLevel: "public" },
        manufacturer: {
          name: { value: "Test Corp", accessibilityLevel: "public" },
          address: { value: "Test Address", accessibilityLevel: "public" },
          contactEmail: { value: "test@test.com", accessibilityLevel: "public" }
        },
        materialComposition: [],
        hazardousSubstances: []
      }
    };

    const result = sdk.calculateProductHash(longStringData);

    expect(result).toBeDefined();
    expect(result.publicHash).toBeDefined();
    expect(result.ownerHash).toBeDefined();
    expect(result.brandHash).toBeDefined();
  });

  test('should handle special characters and symbols', () => {
    const specialData: ProductInput = {
      productUid: "special-chars-!@#$%^&*()",
      info: {
        productName: { value: "Product with !@#$%^&*() symbols", accessibilityLevel: "public" },
        dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
        placeOfManufacture: { value: "Location<>{}[]\\|", accessibilityLevel: "public" },
        productCategory: { value: "Category\"'`~", accessibilityLevel: "public" },
        repairabilityScore: { value: 7.5, accessibilityLevel: "public" },
        endOfLifeInstructions: { value: "Instructions with \n\t\r special chars", accessibilityLevel: "public" },
        digitalLink: { value: "https://test.com?param=value&other=123", accessibilityLevel: "public" },
        signature: { value: "", accessibilityLevel: "public" },
        manufacturer: {
          name: { value: "Corp & Co., Ltd.", accessibilityLevel: "public" },
          address: { value: "123 Main St., Apt. #456", accessibilityLevel: "public" },
          contactEmail: { value: "test+tag@example-domain.com", accessibilityLevel: "public" }
        },
        materialComposition: [],
        hazardousSubstances: []
      }
    };

    const result = sdk.calculateProductHash(specialData);

    expect(result).toBeDefined();
    expect(result.publicHash).toBeDefined();
    expect(result.ownerHash).toBeDefined();
    expect(result.brandHash).toBeDefined();
  });
});