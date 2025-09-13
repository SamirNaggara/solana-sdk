import readline from "node:readline";
import { ProductInput, SafeoutSDK } from "./class_safeout";

// Load environment variables FIRST
require("dotenv").config();

/* -------------------------------------------------------------------------- */
/*  Instance SDK (ultra-simplified API)                                      */
/* -------------------------------------------------------------------------- */

const sdk = new SafeoutSDK();
/* -------------------------------------------------------------------------- */
/*  Helpers I/O                                                               */
/* -------------------------------------------------------------------------- */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
const ask = (q: string) => new Promise<string>((res) => rl.question(q, res));

/* -------------------------------------------------------------------------- */
/*  JSON Helper Functions                                                     */
/* -------------------------------------------------------------------------- */
function validateAndParseJSON(jsonString: string): {
  success: boolean;
  data?: any;
  error?: string;
} {
  try {
    const data = JSON.parse(jsonString);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown parsing error",
    };
  }
}

function showJSONExamples() {
  console.log("\n JSON Format Examples:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(" Array of field names (common use case):");
  console.log('   ["productName", "manufacturer", "dateOfManufacture"]');
  console.log("\n Object with key-value pairs:");
  console.log('   {"productName": "EcoLaptop", "category": "Electronics"}');
  console.log("\n Visibility fields for public access:");
  console.log('   ["productName", "productCategory", "materialComposition"]');
  console.log("\n Visibility fields for owner access:");
  console.log(
    '   ["productName", "manufacturer", "repairabilityScore", "endOfLifeInstructions"]'
  );
  console.log("\n Visibility fields for brand access:");
  console.log(
    '   ["productName", "manufacturer", "dateOfManufacture", "placeOfManufacture", "materialComposition", "hazardousSubstances"]'
  );
  console.log(
    '\n Important: Always use double quotes (") for strings in JSON!'
  );
  console.log(" Tip: Type 'examples' to see field suggestions for each type");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

function showVisibilityExamples(type: string) {
  console.log(`\n Suggested fields for ${type.toUpperCase()} visibility:`);
  console.log("━".repeat(50));

  switch (type.toLowerCase()) {
    case "public":
      console.log(" Public fields (general product info):");
      console.log(
        '   ["productName", "productCategory", "materialComposition", "repairabilityScore"]'
      );
      break;
    case "owner":
      console.log(" Owner fields (detailed user info):");
      console.log(
        '   ["productName", "manufacturer", "dateOfManufacture", "repairabilityScore", "endOfLifeInstructions", "digitalLink"]'
      );
      break;
    case "brand":
      console.log(" Brand fields (manufacturer info):");
      console.log(
        '   ["productName", "manufacturer", "dateOfManufacture", "placeOfManufacture", "materialComposition", "hazardousSubstances", "digitalLink"]'
      );
      break;
  }
  console.log("━".repeat(50) + "\n");
}

/* -------------------------------------------------------------------------- */
/*  Démo produits                                                             */
/* -------------------------------------------------------------------------- */
// Helper function to create DPP field
const createDPPField = (
  value: any,
  accessibilityLevel: "public" | "owner" | "private" = "public"
) => ({
  value,
  accessibilityLevel,
});

// Generate unique UUID for each demo run to avoid conflicts
const { v4: uuidv4 } = require('uuid');
const generateDemoId = () => {
  return uuidv4();
};

const DEMO_PRODUCT_ID = generateDemoId();

const demoUniqueProduct: ProductInput = {
  productUid: DEMO_PRODUCT_ID,
  info: {
    id: createDPPField(DEMO_PRODUCT_ID),
    productName: createDPPField("EcoLaptop X200"),
    manufacturer: {
      name: createDPPField("GreenTech Electronics Ltd."),
      address: createDPPField("12 Circularity Avenue, Berlin, Germany"),
      contactEmail: createDPPField("contact@greentechelectronics.eu", "owner"),
    },
    dateOfManufacture: createDPPField("2025-05-15"),
    placeOfManufacture: createDPPField("Wroclaw, Poland"),
    productCategory: createDPPField("Computers and laptops"),
    materialComposition: [
      {
        material: createDPPField("Aluminum"),
        percentage: createDPPField("45"),
      },
      {
        material: createDPPField("Recycled plastic"),
        percentage: createDPPField("30"),
      },
      { material: createDPPField("Glass"), percentage: createDPPField("10") },
      {
        material: createDPPField("Electronic components"),
        percentage: createDPPField("15"),
      },
    ],
    hazardousSubstances: [
      {
        substance: createDPPField("Lead"),
        casNumber: createDPPField("7439-92-1"),
        concentration: createDPPField("0.08", "private"),
      },
      {
        substance: createDPPField("Mercury"),
        casNumber: createDPPField("7439-97-6"),
        concentration: createDPPField("0.001", "private"),
      },
    ],
    repairabilityScore: createDPPField("7.2"),
    endOfLifeInstructions: createDPPField(
      "Remove battery using T5 screwdriver. SSD/RAM are modular. Label plastics."
    ),
    digitalLink: createDPPField(
      `https://dpp.greentechelectronics.eu/product/${DEMO_PRODUCT_ID}`
    ),
    signature: createDPPField("demo-signature-placeholder"),

    // Nouveaux champs DPP
    gtin: createDPPField("1234567890123"),
    serialNumber: createDPPField("SN2025X200-001"),
    model: createDPPField("X200"),
    batchLot: createDPPField("BATCH2025-05"),
    dataCarrier: createDPPField("QR"),
    aidcPayloadMirror: createDPPField("01 1234567890123"),

    manufacturerExtended: {
      gln: createDPPField("1234567890123"),
      website: createDPPField("https://greentechelectronics.eu"),
    },

    compliance: {
      ceMarking: createDPPField("Yes"),
      standards: [createDPPField("EN 62368-1"), createDPPField("RoHS")],
      declarations: [],
      certificates: [],
    },

    materialCompositionExtended: [],
    energyEfficiencyClass: createDPPField("A+"),
    carbonFootprint: {
      standard: createDPPField("PEF"),
      declaredValueKgCO2e: createDPPField("250 kgCO2e"),
      systemBoundary: createDPPField("Cradle to gate"),
      studyUrl: createDPPField("https://greentechelectronics.eu/carbon-study"),
    },
    durabilityMetrics: {
      mtbfHours: createDPPField("50000h"),
      warrantyMonths: createDPPField("24"),
      expectedLifespanMonths: createDPPField("84"),
      sparePartsAvailabilityMonths: createDPPField("60"),
    },

    userManualUrl: createDPPField(
      "https://greentechelectronics.eu/manuals/x200"
    ),
    safetyInstructionsUrl: createDPPField(
      "https://greentechelectronics.eu/safety/x200"
    ),
    maintenanceGuides: [
      createDPPField("https://greentechelectronics.eu/maintenance/x200"),
    ],
    spareParts: [],
    serviceCenters: [],
    lifecycleEvents: [],

    disassemblyGuideUrl: createDPPField(
      "https://greentechelectronics.eu/disassembly/x200"
    ),
    recyclabilityRatePct: createDPPField("85%"),
    collectionPointsUrl: createDPPField(
      "https://greentechelectronics.eu/collection-points"
    ),

    firmwareVersion: createDPPField("1.0.0"),
    version: createDPPField("1.0"),
    issuedAt: createDPPField("2025-05-15T10:00:00.000Z"),
    updatedAt: createDPPField("2025-05-15T10:00:00.000Z"),

    languagesAvailable: [
      createDPPField("en"),
      createDPPField("de"),
      createDPPField("fr"),
    ],
  },
};
const demoProducts: ProductInput[] = [demoUniqueProduct];

/* -------------------------------------------------------------------------- */
/*  Boucle principale                                                         */
/* -------------------------------------------------------------------------- */
async function mainLoop() {
  // Initialize SDK with environment variables or defaults
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL not found in .env file");
    console.log(
      'Please create a .env file with: DATABASE_URL="postgresql://user:password@localhost:5432/database"'
    );
    process.exit(1);
  }

  try {
    console.log("🔄 Initializing SafeoutSDK...");
    await sdk.init({
      databaseUrl: dbUrl,
      rpcUrl: process.env.SOLANA_RPC_URL, // optional, defaults to devnet
      mintAuthorityPrivateKey: process.env.MINT_AUTHORITY_PRIVATE_KEY, // optional
      ownerPrivateKey: process.env.OWNER_PRIVATE_KEY, // optional
      mintAuthority: process.env.MINT_AUTHORITY_PUBLIC_KEY, // optional
      owner: process.env.OWNER_PUBLIC_KEY, // optional
    });
    console.log("✅ SafeoutSDK initialized successfully\n");
  } catch (error) {
    console.error("❌ Failed to initialize SafeoutSDK:", error);
    process.exit(1);
  }
  for (;;) {
    console.log(
      "\nActions : create | update | delete | get | check | batch-create | batch-update | batch-delete | history | history-all | history-stats | visibility | exit"
    );
    const action = (await ask("> ")).trim().toLowerCase();

    try {
      switch (action) {
        case "create": {
          const changedBy = await ask(
            "Changed by (optional, press Enter for 'cli-user') : "
          );
          // First validate the data
          const validatedData = sdk.validateDppProductData(demoUniqueProduct);
          console.log(
            await sdk.createDppProducts(validatedData, changedBy || "cli-user")
          );
          break;
        }
        case "update": {
          const id = await ask("Product UID : ");
          const json = await ask("New metadata (JSON) : ");
          const info = JSON.parse(json);
          const changedBy = await ask(
            "Changed by (optional, press Enter for 'cli-user') : "
          );
          console.log(
            await sdk.updateDppProducts(id, info, changedBy || "cli-user")
          );
          break;
        }
        case "delete": {
          const id = await ask("Product UID : ");
          const confirm = await ask(
            "Are you sure you want to delete this product? (yes/no) : "
          );
          if (confirm.toLowerCase() === "yes") {
            const changedBy = await ask(
              "Changed by (optional, press Enter for 'cli-user') : "
            );
            await sdk.deleteDppProducts(id, changedBy || "cli-user");
            console.log("Product deleted successfully.");
          } else {
            console.log("Deletion cancelled.");
          }
          break;
        }
        case "get": {
          const id = await ask("Product UID : ");
          let accessLevel =
            (await ask("Access level (public/owner/private) [public]: ")) ||
            "public";

          if (!["public", "owner", "private"].includes(accessLevel)) {
            console.log("Invalid access level. Using 'public'.");
            accessLevel = "public";
          }

          try {
            const completeProduct = await sdk.getDppProducts(
              id,
              accessLevel as "public" | "owner" | "private"
            );
            console.log(`\n Complete Product Data (Access: ${accessLevel}):`);
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(JSON.stringify(completeProduct, null, 2));
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

            // Optionally save to file
            const saveToFile = await ask("\n Save to file? (y/N) : ");
            if (
              saveToFile.toLowerCase() === "y" ||
              saveToFile.toLowerCase() === "yes"
            ) {
              const fs = await import("fs");
              const filename = `product_${id}_${
                new Date().toISOString().split("T")[0]
              }.json`;
              fs.writeFileSync(
                filename,
                JSON.stringify(completeProduct, null, 2)
              );
              console.log(` Product data saved to: ${filename}`);
            }
          } catch (error) {
            console.error(" Error getting product:", (error as Error).message);
          }
          break;
        }
        case "check": {
          const id = await ask("Product UID : ");
          console.log(await sdk.checkAuthenticityOnBlockchain(id));
          break;
        }
        case "batch-create": {
          const changedBy = await ask(
            "Changed by (optional, press Enter for 'cli-user') : "
          );
          console.log(
            await sdk.createDppProducts(demoProducts, changedBy || "cli-user")
          );
          break;
        }
        case "batch-update": {
          const updated = demoProducts.map((p, i) => ({
            productId: p.productUid,
            updateData: {
              productUid: p.productUid,
              info: {
                ...p.info,
              },
            },
          }));
          const changedBy = await ask(
            "Changed by (optional, press Enter for 'cli-user') : "
          );
          console.log(
            await sdk.updateDppProducts(updated, changedBy || "cli-user")
          );
          break;
        }
        case "batch-delete": {
          const ids = demoProducts.map((p) => p.productUid);
          const confirm = await ask(
            `Are you sure you want to delete ${ids.length} demo products? (yes/no) : `
          );
          if (confirm.toLowerCase() === "yes") {
            const changedBy = await ask(
              "Changed by (optional, press Enter for 'cli-user') : "
            );
            await sdk.deleteDppProducts(ids, changedBy || "cli-user");
            console.log("Products deleted successfully.");
          } else {
            console.log("Deletion cancelled.");
          }
          break;
        }
        case "history": {
          const id = await ask("Product UID : ");
          const history = await sdk.getProductHistory(id);
          console.log("Product History:");
          console.log(JSON.stringify(history, null, 2));
          break;
        }
        case "history-all": {
          const pageStr = await ask("Page number (default 1) : ");
          const limitStr = await ask("Items per page (default 10) : ");
          const page = parseInt(pageStr) || 1;
          const limit = parseInt(limitStr) || 10;
          const result = await sdk.getAllProductHistory(page, limit);
          console.log(
            `All Products History (Page ${page}/${result.totalPages}, Total: ${result.total}):`
          );
          console.log(JSON.stringify(result.history, null, 2));
          break;
        }
        case "history-stats": {
          const stats = await sdk.getProductHistoryStats();
          console.log("History Statistics:");
          console.log(`Total Changes: ${stats.totalChanges}`);
          console.log(`- Creates: ${stats.createCount}`);
          console.log(`- Updates: ${stats.updateCount}`);
          console.log(`- Deletes: ${stats.deleteCount}`);
          console.log(`Unique Products: ${stats.uniqueProducts}`);
          console.log(`Unique Users: ${stats.uniqueUsers}`);
          break;
        }
        case "visibility": {
          const productId = await ask("Product ID : ");
          const type = await ask("Type (public/owner/brand) : ");

          if (!["public", "owner", "brand"].includes(type)) {
            console.log(" Invalid type. Must be 'public', 'owner', or 'brand'");
            break;
          }

          showJSONExamples();
          showVisibilityExamples(type);

          let jsonData: string;
          let parseResult: { success: boolean; data?: any; error?: string } = {
            success: false,
          };
          let attempts = 0;
          const maxAttempts = 3;

          do {
            attempts++;
            jsonData = await ask(
              ` Enter JSON data (attempt ${attempts}/${maxAttempts}) : `
            );

            // Handle some common cases where users might forget quotes
            if (jsonData.trim() === "cancel" || jsonData.trim() === "exit") {
              console.log("Operation cancelled.");
              break;
            }

            if (jsonData.trim() === "examples") {
              showVisibilityExamples(type);
              attempts--; // Don't count this as an attempt
              continue;
            }

            parseResult = validateAndParseJSON(jsonData);

            if (parseResult.success) {
              console.log(" Valid JSON parsed:");
              console.log(JSON.stringify(parseResult.data, null, 2));

              const confirmChoice = await ask(
                "Continue with this data? (y/n) : "
              );
              if (confirmChoice.toLowerCase() === "y") {
                try {
                  const result = await sdk.updateProductVisibility(
                    type as "public" | "owner" | "brand",
                    productId,
                    parseResult.data
                  );
                  console.log(" Visibility updated successfully:");
                  console.log(JSON.stringify(result, null, 2));
                } catch (sdkError) {
                  console.error(" SDK Error:", (sdkError as Error).message);
                }
                break;
              } else {
                console.log("Let's try again...\n");
                attempts = 0; // Reset attempts if user wants to retry
              }
            } else {
              console.error(` JSON parsing failed: ${parseResult.error}`);
              console.log("\n Common fixes:");
              console.log("- Use double quotes: [\"name\"] not ['name']");
              console.log("- Check brackets: [] for arrays, {} for objects");
              console.log("- Escape quotes properly in strings");
              console.log("- Type 'examples' to see field suggestions");

              if (attempts < maxAttempts) {
                console.log(
                  `\nTry again (${maxAttempts - attempts} attempts left)...\n`
                );
              } else {
                console.log(" Max attempts reached. Operation cancelled.");
                break;
              }
            }
          } while (attempts < maxAttempts && !parseResult.success);

          break;
        }
        case "exit":
          rl.close();
          return;
        default:
          console.log("Commande inconnue.");
      }
    } catch (err) {
      console.error(" Erreur :", err);
    }
  }
}

mainLoop();
