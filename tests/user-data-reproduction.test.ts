import { SolanaDppSdk } from '../client/solana-dpp-sdk';
import { ProductInput } from '../client/src/types';

describe('User Data Reproduction Test', () => {
  let sdk: SolanaDppSdk;
  const testProductId = "b12a9eb7-70fd-4d9a-a4c0-55deef7d32d5";

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
      await sdk.deleteDppProducts([testProductId], "user-data-test-cleanup");
    } catch (error) {
      console.warn('Cleanup error:', error.message);
    }
  });

  test('Should have consistent hashes with user data', async () => {
    // Données exactes du log utilisateur
    const userData: ProductInput = {
      "productUid": "b12a9eb7-70fd-4d9a-a4c0-55deef7d32d5",
      "info": {
        "id": {
          "value": "b12a9eb7-70fd-4d9a-a4c0-55deef7d32d5",
          "accessibilityLevel": "public"
        },
        "productName": {
          "value": "Alom",
          "accessibilityLevel": "public"
        },
        "dateOfManufacture": {
          "value": "2025-09-17T00:00:00.000Z",
          "accessibilityLevel": "public"
        },
        "placeOfManufacture": {
          "value": "Not relevant",
          "accessibilityLevel": "public"
        },
        "productCategory": {
          "value": "Not relevant",
          "accessibilityLevel": "public"
        },
        "repairabilityScore": {
          "value": "0",
          "accessibilityLevel": "public"
        },
        "endOfLifeInstructions": {
          "value": "Not relevant",
          "accessibilityLevel": "public"
        },
        "digitalLink": {
          "value": "https://example.com/product/sf:b12a9eb7-70fd-4d9a-a4c0-55deef7d32d5",
          "accessibilityLevel": "public"
        },
        "signature": {
          "value": "",
          "accessibilityLevel": "private"
        },
        "manufacturer": {
          "name": {
            "value": "Not relevant",
            "accessibilityLevel": "public"
          },
          "address": {
            "value": "Not relevant",
            "accessibilityLevel": "public"
          },
          "contactEmail": {
            "value": "Not provided",
            "accessibilityLevel": "public"
          }
        },
        "materialComposition": [
          {
            "material": {
              "value": "Not relevant",
              "accessibilityLevel": "public"
            },
            "percentage": {
              "value": "-1",
              "accessibilityLevel": "public"
            }
          }
        ],
        "hazardousSubstances": [],
        "gtin": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "serialNumber": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "model": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "batchLot": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "dataCarrier": {
          "value": "NFC",
          "accessibilityLevel": "public"
        },
        "aidcPayloadMirror": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "manufacturerExtended": {
          "gln": {
            "value": "",
            "accessibilityLevel": "public"
          },
          "website": {
            "value": "",
            "accessibilityLevel": "public"
          }
        },
        "compliance": {
          "ceMarking": {
            "value": "Not provided",
            "accessibilityLevel": "public"
          },
          "standards": [],
          "declarations": [],
          "certificates": []
        },
        "materialCompositionExtended": [],
        "energyEfficiencyClass": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "carbonFootprint": {
          "standard": {
            "value": "Other",
            "accessibilityLevel": "public"
          },
          "declaredValueKgCO2e": {
            "value": "0",
            "accessibilityLevel": "public"
          },
          "systemBoundary": {
            "value": "",
            "accessibilityLevel": "public"
          },
          "studyUrl": {
            "value": "",
            "accessibilityLevel": "public"
          }
        },
        "durabilityMetrics": {
          "mtbfHours": {
            "value": "0",
            "accessibilityLevel": "public"
          },
          "warrantyMonths": {
            "value": "0",
            "accessibilityLevel": "public"
          },
          "expectedLifespanMonths": {
            "value": "0",
            "accessibilityLevel": "public"
          },
          "sparePartsAvailabilityMonths": {
            "value": "0",
            "accessibilityLevel": "public"
          }
        },
        "userManualUrl": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "safetyInstructionsUrl": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "maintenanceGuides": [],
        "spareParts": [],
        "serviceCenters": [],
        "lifecycleEvents": [],
        "disassemblyGuideUrl": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "recyclabilityRatePct": {
          "value": "0",
          "accessibilityLevel": "public"
        },
        "collectionPointsUrl": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "firmwareVersion": {
          "value": "",
          "accessibilityLevel": "public"
        },
        "version": {
          "value": "1.0",
          "accessibilityLevel": "public"
        },
        "issuedAt": {
          "value": "2025-09-17T15:34:16.015Z",
          "accessibilityLevel": "public"
        },
        "updatedAt": {
          "value": "2025-09-17T15:37:05.782Z",
          "accessibilityLevel": "public"
        },
        "languagesAvailable": []
      }
    };

    console.log('\n🔍 USER DATA REPRODUCTION TEST');
    console.log('='.repeat(80));

    // STEP 1: Calculate hash from user data (client-side)
    console.log('\n🔍 STEP 1: Calculate hash from user data (client-side)');
    const clientHashes = sdk.calculateProductHash(userData);
    console.log('Client-side Hashes:');
    console.log('  Public: ', clientHashes.publicHash);
    console.log('  Owner:  ', clientHashes.ownerHash);
    console.log('  Brand:  ', clientHashes.brandHash);

    // Les hashes attendus d'après les logs utilisateur
    const expectedHashes = {
      publicHash: 'bd20161ae0abc79cc2bf5a7edcef3b48b7963c29e70ec748dcbb893f1b8904b7',
      ownerHash: 'bd20161ae0abc79cc2bf5a7edcef3b48b7963c29e70ec748dcbb893f1b8904b7',
      brandHash: 'de16a66e0a77bae6e377efeac2599f97b0911757abe14550b84c3603909d7545'
    };

    console.log('\nExpected Hashes (from user logs):');
    console.log('  Public: ', expectedHashes.publicHash);
    console.log('  Owner:  ', expectedHashes.ownerHash);
    console.log('  Brand:  ', expectedHashes.brandHash);

    console.log('\nClient Hash Match:');
    console.log('  Public: ', clientHashes.publicHash === expectedHashes.publicHash ? '✅' : '❌');
    console.log('  Owner:  ', clientHashes.ownerHash === expectedHashes.ownerHash ? '✅' : '❌');
    console.log('  Brand:  ', clientHashes.brandHash === expectedHashes.brandHash ? '✅' : '❌');

    // STEP 2: Create product on blockchain using normal SDK flow
    console.log('\n🚀 STEP 2: Create product on blockchain using normal flow');
    const creationResults = await sdk.createDppProducts([userData], "user-data-reproduction-test");
    const createdProduct = creationResults[0];

    console.log('Created product:');
    console.log('  ID:', createdProduct.id);
    console.log('  Signature:', createdProduct.signature);
    console.log('  Hash:', createdProduct.hash);

    // Wait for blockchain processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // STEP 3: Immediate verification with original data
    console.log('\n🔍 STEP 3: Immediate verification with original data');
    const immediateResults = await sdk.checkAuthenticityOnBlockchain([{
      productId: testProductId,
      productData: userData
    }]);

    const immediateResult = immediateResults.get(testProductId);
    console.log('Immediate verification result:');
    console.log('  isOnBlockchain:', immediateResult?.isOnBlockchain);
    console.log('  isValid:', immediateResult?.isValid);
    console.log('  reason:', immediateResult?.reason);

    if (immediateResult?.hashes) {
      console.log('\nHash Comparison (Immediate):');
      console.log('CLIENT HASHES:');
      console.log('  Public: ', clientHashes.publicHash);
      console.log('  Owner:  ', clientHashes.ownerHash);
      console.log('  Brand:  ', clientHashes.brandHash);

      console.log('\nBLOCKCHAIN HASHES:');
      console.log('  Public: ', immediateResult.blockchainData?.memo?.public);
      console.log('  Owner:  ', immediateResult.blockchainData?.memo?.owner);
      console.log('  Brand:  ', immediateResult.blockchainData?.memo?.brand);

      console.log('\nVERIFICATION HASHES:');
      console.log('  Public: ', immediateResult.hashes.publicHash);
      console.log('  Owner:  ', immediateResult.hashes.ownerHash);
      console.log('  Brand:  ', immediateResult.hashes.brandHash);

      console.log('\nMATCH STATUS:');
      const clientVsVerification = {
        public: clientHashes.publicHash === immediateResult.hashes.publicHash,
        owner: clientHashes.ownerHash === immediateResult.hashes.ownerHash,
        brand: clientHashes.brandHash === immediateResult.hashes.brandHash
      };

      const clientVsBlockchain = {
        public: clientHashes.publicHash === immediateResult.blockchainData?.memo?.public,
        owner: clientHashes.ownerHash === immediateResult.blockchainData?.memo?.owner,
        brand: clientHashes.brandHash === immediateResult.blockchainData?.memo?.brand
      };

      console.log('  Client vs Verification:', clientVsVerification.public ? '✅' : '❌', clientVsVerification.owner ? '✅' : '❌', clientVsVerification.brand ? '✅' : '❌');
      console.log('  Client vs Blockchain:  ', clientVsBlockchain.public ? '✅' : '❌', clientVsBlockchain.owner ? '✅' : '❌', clientVsBlockchain.brand ? '✅' : '❌');
    }

    console.log('\n' + '='.repeat(80));

    // ASSERTIONS
    expect(immediateResult).toBeDefined();
    expect(immediateResult?.isOnBlockchain).toBe(true);

    // Cette assertion devrait passer si le bug est corrigé
    expect(immediateResult?.isValid).toBe(true);

  }, 60000);
});