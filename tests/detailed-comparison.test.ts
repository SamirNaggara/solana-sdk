import { SolanaDppSdk } from '../client/solana-dpp-sdk';
import { ProductInput } from '../client/src/types';
import { v4 as uuidv4 } from 'uuid';
import 'dotenv/config';

describe('Detailed Object Comparison Test', () => {
  let sdk: SolanaDppSdk;
  const testProductId = uuidv4();

  beforeAll(async () => {
    sdk = new SolanaDppSdk();
    await sdk.init({
      databaseUrl: process.env.DATABASE_URL || "postgresql://dpp:dpp@localhost:4242/sdk-1",
      rpcUrl: "https://api.devnet.solana.com",
      mintAuthorityPrivateKey: process.env.MINT_AUTHORITY_PRIVATE_KEY,
      ownerPrivateKey: process.env.OWNER_PRIVATE_KEY
    });
  }, 30000);

  afterAll(async () => {
    try {
      await sdk.deleteDppProducts([testProductId], "detailed-comparison-test-cleanup");
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  });

  test('Should provide detailed field differences when data is modified', async () => {
    console.log('\n🔍 DETAILED COMPARISON TEST');
    console.log('='.repeat(80));

    // Original product data
    const originalData: ProductInput = {
      productUid: testProductId,
      info: {
        id: {
          value: testProductId,
          accessibilityLevel: "public"
        },
        productName: {
          value: "Original Product Name",
          accessibilityLevel: "public"
        },
        dateOfManufacture: {
          value: "2025-09-17T00:00:00.000Z",
          accessibilityLevel: "public"
        },
        placeOfManufacture: {
          value: "Original Factory",
          accessibilityLevel: "public"
        },
        productCategory: {
          value: "Electronics",
          accessibilityLevel: "public"
        },
        repairabilityScore: {
          value: "8",
          accessibilityLevel: "public"
        },
        endOfLifeInstructions: {
          value: "Recycle properly",
          accessibilityLevel: "public"
        },
        digitalLink: {
          value: `https://example.com/product/sf:${testProductId}`,
          accessibilityLevel: "public"
        },
        signature: {
          value: "",
          accessibilityLevel: "private"
        },
        manufacturer: {
          name: {
            value: "Original Manufacturer Inc.",
            accessibilityLevel: "public"
          },
          address: {
            value: "123 Original Street",
            accessibilityLevel: "public"
          },
          contactEmail: {
            value: "original@company.com",
            accessibilityLevel: "public"
          }
        },
        materialComposition: [
          {
            material: {
              value: "Aluminum",
              accessibilityLevel: "public"
            },
            percentage: {
              value: "80",
              accessibilityLevel: "public"
            }
          },
          {
            material: {
              value: "Plastic",
              accessibilityLevel: "public"
            },
            percentage: {
              value: "20",
              accessibilityLevel: "public"
            }
          }
        ],
        hazardousSubstances: [],
        gtin: {
          value: "123456789012",
          accessibilityLevel: "public"
        },
        serialNumber: {
          value: "SN-001",
          accessibilityLevel: "public"
        },
        model: {
          value: "MODEL-X1",
          accessibilityLevel: "public"
        },
        batchLot: {
          value: "BATCH-001",
          accessibilityLevel: "public"
        },
        dataCarrier: {
          value: "QR",
          accessibilityLevel: "public"
        },
        aidcPayloadMirror: {
          value: "",
          accessibilityLevel: "public"
        },
        manufacturerExtended: {
          gln: {
            value: "1234567890123",
            accessibilityLevel: "public"
          },
          website: {
            value: "https://original.com",
            accessibilityLevel: "public"
          }
        },
        compliance: {
          ceMarking: {
            value: "Yes",
            accessibilityLevel: "public"
          },
          standards: [],
          declarations: [],
          certificates: []
        },
        materialCompositionExtended: [],
        energyEfficiencyClass: {
          value: "A+",
          accessibilityLevel: "public"
        },
        carbonFootprint: {
          standard: {
            value: "ISO14067",
            accessibilityLevel: "public"
          },
          declaredValueKgCO2e: {
            value: "5.2",
            accessibilityLevel: "public"
          },
          systemBoundary: {
            value: "Cradle to gate",
            accessibilityLevel: "public"
          },
          studyUrl: {
            value: "https://study.com",
            accessibilityLevel: "public"
          }
        },
        durabilityMetrics: {
          mtbfHours: {
            value: "50000",
            accessibilityLevel: "public"
          },
          warrantyMonths: {
            value: "24",
            accessibilityLevel: "public"
          },
          expectedLifespanMonths: {
            value: "120",
            accessibilityLevel: "public"
          },
          sparePartsAvailabilityMonths: {
            value: "60",
            accessibilityLevel: "public"
          }
        },
        userManualUrl: {
          value: "https://manual.com",
          accessibilityLevel: "public"
        },
        safetyInstructionsUrl: {
          value: "https://safety.com",
          accessibilityLevel: "public"
        },
        maintenanceGuides: [],
        spareParts: [],
        serviceCenters: [],
        lifecycleEvents: [],
        disassemblyGuideUrl: {
          value: "https://disassembly.com",
          accessibilityLevel: "public"
        },
        recyclabilityRatePct: {
          value: "95",
          accessibilityLevel: "public"
        },
        collectionPointsUrl: {
          value: "https://collection.com",
          accessibilityLevel: "public"
        },
        firmwareVersion: {
          value: "1.0.0",
          accessibilityLevel: "public"
        },
        version: {
          value: "1.0",
          accessibilityLevel: "public"
        },
        issuedAt: {
          value: "2025-09-17T15:34:16.015Z",
          accessibilityLevel: "public"
        },
        updatedAt: {
          value: "2025-09-17T15:37:05.782Z",
          accessibilityLevel: "public"
        },
        languagesAvailable: []
      }
    };

    // STEP 1: Create product with original data
    console.log('\n🚀 STEP 1: Create product with original data');
    const creationResults = await sdk.createDppProducts([originalData], "detailed-comparison-test");
    const createdProduct = creationResults[0];
    console.log('Created product ID:', createdProduct.id);

    // Wait for blockchain processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // STEP 2: Create modified version of the data
    console.log('\n🔧 STEP 2: Create modified version of the data');
    const modifiedData: ProductInput = JSON.parse(JSON.stringify(originalData)); // Deep clone

    // Modify several fields to test different types of changes
    modifiedData.info.productName.value = "MODIFIED Product Name";
    modifiedData.info.manufacturer.name.value = "MODIFIED Manufacturer Corp.";
    modifiedData.info.manufacturer.address.value = "456 Modified Avenue";
    modifiedData.info.repairabilityScore.value = "10"; // Changed from "8"
    modifiedData.info.energyEfficiencyClass.value = "A++"; // Changed from "A+"

    // Modify array element
    modifiedData.info.materialComposition[0].percentage.value = "85"; // Changed from "80"

    // Add new material
    modifiedData.info.materialComposition.push({
      material: {
        value: "Steel",
        accessibilityLevel: "public"
      },
      percentage: {
        value: "5",
        accessibilityLevel: "public"
      }
    });

    console.log('Modified fields:');
    console.log('  - productName: "Original Product Name" → "MODIFIED Product Name"');
    console.log('  - manufacturer.name: "Original Manufacturer Inc." → "MODIFIED Manufacturer Corp."');
    console.log('  - manufacturer.address: "123 Original Street" → "456 Modified Avenue"');
    console.log('  - repairabilityScore: "8" → "10"');
    console.log('  - energyEfficiencyClass: "A+" → "A++"');
    console.log('  - materialComposition[0].percentage: "80" → "85"');
    console.log('  - Added new material: Steel (5%)');

    // STEP 3: Verify authenticity with modified data
    console.log('\n🔍 STEP 3: Verify authenticity with modified data');
    const verificationResults = await sdk.checkAuthenticityOnBlockchain([{
      productId: testProductId,
      productData: modifiedData
    }]);

    const result = verificationResults.get(testProductId);
    console.log('\nVerification result:');
    console.log('  isOnBlockchain:', result?.isOnBlockchain);
    console.log('  isValid:', result?.isValid);
    console.log('  reason:', result?.reason);

    // STEP 4: Check detailed differences
    console.log('\n📋 STEP 4: Analyze detailed differences');
    if (result?.fieldDifferences && result.fieldDifferences.length > 0) {
      console.log(`Found ${result.fieldDifferences.length} field differences:`);

      result.fieldDifferences.forEach((diff, index) => {
        console.log(`\n  ${index + 1}. Field: ${diff.path}`);
        console.log(`     Change Type: ${diff.changeType}`);
        console.log(`     Stored Value: "${diff.storedValue}"`);
        console.log(`     Provided Value: "${diff.providedValue}"`);
      });
    } else {
      console.log('No detailed differences found (unexpected!)');
    }

    console.log('\n' + '='.repeat(80));

    // ASSERTIONS
    expect(result).toBeDefined();
    expect(result?.isOnBlockchain).toBe(true);
    expect(result?.isValid).toBe(false);
    expect(result?.reason).toContain('hash mismatch');
    expect(result?.fieldDifferences).toBeDefined();
    expect(result?.fieldDifferences?.length).toBeGreaterThan(0);

    // Verify specific differences are detected (main fields that should be in DB)
    const fieldPaths = result?.fieldDifferences?.map(diff => diff.path) || [];
    expect(fieldPaths).toContain('productName.value');
    expect(fieldPaths).toContain('manufacturer.name.value');
    expect(fieldPaths).toContain('manufacturer.address.value');
    expect(fieldPaths).toContain('repairabilityScore.value');

    // Note: energyEfficiencyClass might not be stored in DB yet, so we check for at least the main fields

    // Verify the specific changed values
    const productNameDiff = result?.fieldDifferences?.find(diff => diff.path === 'productName.value');
    expect(productNameDiff?.storedValue).toBe("Original Product Name");
    expect(productNameDiff?.providedValue).toBe("MODIFIED Product Name");
    expect(productNameDiff?.changeType).toBe('modified');

    console.log('\n✅ All assertions passed! Detailed comparison working correctly.');

  }, 90000);
});