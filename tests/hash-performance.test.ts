import { SafeoutSDK } from '../client/class_safeout';
import { ProductInput } from '../client/src/types';

describe('Hash Performance Tests', () => {
  let sdk: SafeoutSDK;

  beforeAll(() => {
    sdk = new SafeoutSDK();
  });

  const sampleProductData: ProductInput = {
    productUid: "performance-test-123",
    info: {
      productName: { value: "Performance Test Product", accessibilityLevel: "public" },
      dateOfManufacture: { value: "2024-01-01", accessibilityLevel: "public" },
      placeOfManufacture: { value: "Performance Factory", accessibilityLevel: "public" },
      productCategory: { value: "Performance", accessibilityLevel: "public" },
      repairabilityScore: { value: 9.0, accessibilityLevel: "public" },
      endOfLifeInstructions: { value: "Performance disposal", accessibilityLevel: "public" },
      digitalLink: { value: "https://performance.test.com", accessibilityLevel: "public" },
      signature: { value: "", accessibilityLevel: "public" },
      manufacturer: {
        name: { value: "Performance Corp", accessibilityLevel: "public" },
        address: { value: "Performance Address", accessibilityLevel: "owner" },
        contactEmail: { value: "perf@test.com", accessibilityLevel: "owner" }
      },
      materialComposition: [
        {
          material: { value: "Material 1", accessibilityLevel: "public" },
          percentage: { value: 40, accessibilityLevel: "public" }
        },
        {
          material: { value: "Material 2", accessibilityLevel: "owner" },
          percentage: { value: 30, accessibilityLevel: "owner" }
        },
        {
          material: { value: "Material 3", accessibilityLevel: "private" },
          percentage: { value: 20, accessibilityLevel: "private" }
        }
      ],
      hazardousSubstances: [
        {
          substance: { value: "Substance 1", accessibilityLevel: "private" },
          casNumber: { value: "111-11-1", accessibilityLevel: "private" },
          concentration: { value: "0.1", accessibilityLevel: "private" }
        }
      ]
    }
  };

  test('should calculate hashes quickly for single product', () => {
    const startTime = Date.now();

    const result = sdk.calculateProductHash(sampleProductData);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(result).toBeDefined();
    // Single calculation should complete in less than 100ms
    expect(duration).toBeLessThan(100);
  });

  test('should handle multiple sequential calculations efficiently', () => {
    const startTime = Date.now();

    for (let i = 0; i < 100; i++) {
      sdk.calculateProductHash(sampleProductData);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // 100 calculations should complete in less than 1 second
    expect(duration).toBeLessThan(1000);
    console.log(`100 hash calculations completed in ${duration}ms`);
  });

  test('should maintain consistent performance across different data sizes', () => {
    // Small data
    const smallData = JSON.parse(JSON.stringify(sampleProductData));
    smallData.info.materialComposition = [];
    smallData.info.hazardousSubstances = [];

    // Large data
    const largeData = JSON.parse(JSON.stringify(sampleProductData));
    for (let i = 0; i < 50; i++) {
      largeData.info.materialComposition.push({
        material: { value: `Material ${i}`, accessibilityLevel: "public" },
        percentage: { value: 1, accessibilityLevel: "public" }
      });
      largeData.info.hazardousSubstances.push({
        substance: { value: `Substance ${i}`, accessibilityLevel: "private" },
        casNumber: { value: `${i}-${i}-${i}`, accessibilityLevel: "private" },
        concentration: { value: "0.001", accessibilityLevel: "private" }
      });
    }

    // Measure small data performance
    const smallStartTime = Date.now();
    for (let i = 0; i < 10; i++) {
      sdk.calculateProductHash(smallData);
    }
    const smallDuration = Date.now() - smallStartTime;

    // Measure large data performance
    const largeStartTime = Date.now();
    for (let i = 0; i < 10; i++) {
      sdk.calculateProductHash(largeData);
    }
    const largeDuration = Date.now() - largeStartTime;

    console.log(`Small data: ${smallDuration}ms, Large data: ${largeDuration}ms`);

    // Large data should not take more than 10x longer than small data
    expect(largeDuration).toBeLessThan(smallDuration * 10);
  });

  test('should handle concurrent hash calculations', async () => {
    const startTime = Date.now();

    // Create 10 concurrent hash calculation promises
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const data = JSON.parse(JSON.stringify(sampleProductData));
      data.productUid = `concurrent-test-${i}`;

      promises.push(Promise.resolve(sdk.calculateProductHash(data)));
    }

    const results = await Promise.all(promises);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // All results should be valid
    expect(results).toHaveLength(10);
    results.forEach(result => {
      expect(result).toBeDefined();
      expect(result.publicHash).toBeDefined();
      expect(result.ownerHash).toBeDefined();
      expect(result.brandHash).toBeDefined();
    });

    // Concurrent execution should complete quickly
    expect(duration).toBeLessThan(500);
    console.log(`10 concurrent hash calculations completed in ${duration}ms`);
  });
});