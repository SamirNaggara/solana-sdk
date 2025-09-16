import { SafeoutSDK } from '../client/class_safeout';
import { ProductInput } from '../client/src/types';

describe('Data Sensitivity Tests', () => {
  let sdk: SafeoutSDK;

  beforeAll(() => {
    sdk = new SafeoutSDK();
  });

  const sampleProductData: ProductInput = {
    productUid: "sensitivity-test-789",
    info: {
      productName: { value: "Sensitivity Test Product", accessibilityLevel: "public" },
      dateOfManufacture: { value: "2024-02-01", accessibilityLevel: "public" },
      placeOfManufacture: { value: "Test Factory", accessibilityLevel: "public" },
      productCategory: { value: "Test", accessibilityLevel: "public" },
      repairabilityScore: { value: 6.0, accessibilityLevel: "public" },
      endOfLifeInstructions: { value: "Test disposal", accessibilityLevel: "public" },
      digitalLink: { value: "https://sensitivity.test.com", accessibilityLevel: "public" },
      signature: { value: "", accessibilityLevel: "public" },
      manufacturer: {
        name: { value: "Sensitivity Corp", accessibilityLevel: "public" },
        address: { value: "Owner Address", accessibilityLevel: "owner" },
        contactEmail: { value: "owner@test.com", accessibilityLevel: "owner" }
      },
      materialComposition: [
        {
          material: { value: "Public Material", accessibilityLevel: "public" },
          percentage: { value: 50, accessibilityLevel: "public" }
        },
        {
          material: { value: "Owner Material", accessibilityLevel: "owner" },
          percentage: { value: 30, accessibilityLevel: "owner" }
        }
      ],
      hazardousSubstances: [
        {
          substance: { value: "Private Substance", accessibilityLevel: "private" },
          casNumber: { value: "123-45-6", accessibilityLevel: "private" },
          concentration: { value: "0.1", accessibilityLevel: "private" }
        }
      ]
    }
  };

  test('should change all hashes when public data changes', () => {
    const modifiedData = JSON.parse(JSON.stringify(sampleProductData));
    modifiedData.info.productName.value = "Modified Public Name";

    const originalResult = sdk.calculateProductHash(sampleProductData);
    const modifiedResult = sdk.calculateProductHash(modifiedData);

    // All hashes should change when public data changes
    expect(originalResult.publicHash).not.toBe(modifiedResult.publicHash);
    expect(originalResult.ownerHash).not.toBe(modifiedResult.ownerHash);
    expect(originalResult.brandHash).not.toBe(modifiedResult.brandHash);
  });

  test('should change owner and brand hashes when owner-level data changes', () => {
    const modifiedData = JSON.parse(JSON.stringify(sampleProductData));
    modifiedData.info.manufacturer.address.value = "Modified Owner Address";

    const originalResult = sdk.calculateProductHash(sampleProductData);
    const modifiedResult = sdk.calculateProductHash(modifiedData);

    // Public hash should remain the same
    expect(originalResult.publicHash).toBe(modifiedResult.publicHash);

    // Owner and brand hashes should change
    expect(originalResult.ownerHash).not.toBe(modifiedResult.ownerHash);
    expect(originalResult.brandHash).not.toBe(modifiedResult.brandHash);
  });

  test('should only change brand hash when private data changes', () => {
    const modifiedData = JSON.parse(JSON.stringify(sampleProductData));
    modifiedData.info.hazardousSubstances[0].concentration.value = "0.2";

    const originalResult = sdk.calculateProductHash(sampleProductData);
    const modifiedResult = sdk.calculateProductHash(modifiedData);

    // Public and owner hashes should remain the same
    expect(originalResult.publicHash).toBe(modifiedResult.publicHash);
    expect(originalResult.ownerHash).toBe(modifiedResult.ownerHash);

    // Only brand hash should change
    expect(originalResult.brandHash).not.toBe(modifiedResult.brandHash);
  });

  test('should handle changes in material composition by accessibility level', () => {
    const modifiedData = JSON.parse(JSON.stringify(sampleProductData));
    // Change owner-level material
    modifiedData.info.materialComposition[1].material.value = "Modified Owner Material";

    const originalResult = sdk.calculateProductHash(sampleProductData);
    const modifiedResult = sdk.calculateProductHash(modifiedData);

    // Public hash should remain unchanged
    expect(originalResult.publicHash).toBe(modifiedResult.publicHash);

    // Owner and brand hashes should change
    expect(originalResult.ownerHash).not.toBe(modifiedResult.ownerHash);
    expect(originalResult.brandHash).not.toBe(modifiedResult.brandHash);
  });
});