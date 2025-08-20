import readline from "node:readline";
import { PublicKey, Connection } from "@solana/web3.js";
import { ProductInput, SafeoutSDK } from "./class_safeout";

/* -------------------------------------------------------------------------- */
/*  Instance SDK (adapté à ton réseau + clés)                                 */
/* -------------------------------------------------------------------------- */
console.log(process.env.MINT_AUTHORITY, process.env.OWNER_PUBLIC_KEY);

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const sdk = new SafeoutSDK(
  connection,
  new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1"),
  new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ")
);
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
function validateAndParseJSON(jsonString: string): { success: boolean; data?: any; error?: string } {
  try {
    const data = JSON.parse(jsonString);
    return { success: true, data };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown parsing error'
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
  console.log('   ["productName", "manufacturer", "repairabilityScore", "endOfLifeInstructions"]');
  console.log("\n Visibility fields for brand access:");
  console.log('   ["productName", "manufacturer", "dateOfManufacture", "placeOfManufacture", "materialComposition", "hazardousSubstances"]');
  console.log("\n Important: Always use double quotes (\") for strings in JSON!");
  console.log(" Tip: Type 'examples' to see field suggestions for each type");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

function showVisibilityExamples(type: string) {
  console.log(`\n Suggested fields for ${type.toUpperCase()} visibility:`);
  console.log("━".repeat(50));
  
  switch (type.toLowerCase()) {
    case "public":
      console.log(" Public fields (general product info):");
      console.log('   ["productName", "productCategory", "materialComposition", "repairabilityScore"]');
      break;
    case "owner":
      console.log(" Owner fields (detailed user info):");
      console.log('   ["productName", "manufacturer", "dateOfManufacture", "repairabilityScore", "endOfLifeInstructions", "digitalLink"]');
      break;
    case "brand":
      console.log(" Brand fields (manufacturer info):");
      console.log('   ["productName", "manufacturer", "dateOfManufacture", "placeOfManufacture", "materialComposition", "hazardousSubstances", "digitalLink"]');
      break;
  }
  console.log("━".repeat(50) + "\n");
}

/* -------------------------------------------------------------------------- */
/*  Démo produits                                                             */
/* -------------------------------------------------------------------------- */
const demoUniqueProduct: ProductInput = {
   productUid: "7d4a3e6c-f1e9-4b55-9f20-b5c4a792f9de",
    info: {
      productId: "7d4a3e6c-f1e9-4b55-9f20-b5c4a792f9de",
      productName: "EcoLaptop X200",
      manufacturer: {
        name: "GreenTech Electronics Ltd.",
        address: "12 Circularity Avenue, Berlin, Germany",
        contactEmail: "contact@greentechelectronics.eu"
      },
      dateOfManufacture: "2025-05-15",
      placeOfManufacture: "Wroclaw, Poland",
      productCategory: "Computers and laptops",
      materialComposition: [
        { material: "Aluminum", percentage: 45 },
        { material: "Recycled plastic", percentage: 30 },
        { material: "Glass", percentage: 10 },
        { material: "Electronic components", percentage: 15 }
      ],
      hazardousSubstances: [
        { substance: "Lead", casNumber: "7439-92-1", concentration: 0.08 },
        { substance: "Mercury", casNumber: "7439-97-6", concentration: 0.001 }
      ],
      repairabilityScore: 7.2,
      endOfLifeInstructions: "Remove battery using T5 screwdriver. SSD/RAM are modular. Label plastics.",
      digitalLink: "https://dpp.greentechelectronics.eu/product/7d4a3e6c-f1e9-4b55-9f20-b5c4a792f9de"
    }
  };
const demoProducts: ProductInput[] = [
  {
    productUid: "7d4a3e6c-f1e9-4b55-9f20-b5c4a792f9de",
    info: {
      productId: "7d4a3e6c-f1e9-4b55-9f20-b5c4a792f9de",
      productName: "EcoLaptop X200",
      manufacturer: {
        name: "GreenTech Electronics Ltd.",
        address: "12 Circularity Avenue, Berlin, Germany",
        contactEmail: "contact@greentechelectronics.eu"
      },
      dateOfManufacture: "2025-05-15",
      placeOfManufacture: "Wroclaw, Poland",
      productCategory: "Computers and laptops",
      materialComposition: [
        { material: "Aluminum", percentage: 45 },
        { material: "Recycled plastic", percentage: 30 },
        { material: "Glass", percentage: 10 },
        { material: "Electronic components", percentage: 15 }
      ],
      hazardousSubstances: [
        { substance: "Lead", casNumber: "7439-92-1", concentration: 0.08 },
        { substance: "Mercury", casNumber: "7439-97-6", concentration: 0.001 }
      ],
      repairabilityScore: 7.2,
      endOfLifeInstructions: "Remove battery using T5 screwdriver. SSD/RAM are modular. Label plastics.",
      digitalLink: "https://dpp.greentechelectronics.eu/product/7d4a3e6c-f1e9-4b55-9f20-b5c4a792f9de"
    }
  },
  {
    productUid: "3b2f6c9a-9c1b-4f28-8b3e-c87c3b6b7a77",
    info: {
      productId: "3b2f6c9a-9c1b-4f28-8b3e-c87c3b6b7a77",
      productName: "SolarSmart Fridge 400",
      manufacturer: {
        name: "EcoHome Appliances S.A.",
        address: "78 Reuse Street, Madrid, Spain",
        contactEmail: "support@ecohome.eu"
      },
      dateOfManufacture: "2025-03-21",
      placeOfManufacture: "Zaragoza, Spain",
      productCategory: "Household refrigeration appliances",
      materialComposition: [
        { material: "Steel", percentage: 50 },
        { material: "Polyurethane foam", percentage: 20 },
        { material: "Plastic (ABS)", percentage: 25 },
        { material: "Electronics", percentage: 5 }
      ],
      hazardousSubstances: [
        { substance: "Fluorinated gas", casNumber: "811-97-2", concentration: 0.3 }
      ],
      repairabilityScore: 6.5,
      endOfLifeInstructions: "Drain refrigerant gas. Separate steel casing. Foam is non-recyclable.",
      digitalLink: "https://dpp.ecohome.eu/product/3b2f6c9a-9c1b-4f28-8b3e-c87c3b6b7a77"
    }
  },
  {
    productUid: "e9d45c8a-2a13-4d77-8f0e-fd1c6a5d5b09",
    info: {
      productId: "e9d45c8a-2a13-4d77-8f0e-fd1c6a5d5b09",
      productName: "Circular LED Bulb A19",
      manufacturer: {
        name: "Nova Lighting GmbH",
        address: "9 LED Way, Munich, Germany",
        contactEmail: "info@novalighting.de"
      },
      dateOfManufacture: "2025-01-10",
      placeOfManufacture: "Brno, Czech Republic",
      productCategory: "LED lighting products",
      materialComposition: [
        { material: "Glass", percentage: 40 },
        { material: "Plastic", percentage: 30 },
        { material: "Metal base", percentage: 20 },
        { material: "Phosphors/electronics", percentage: 10 }
      ],
      hazardousSubstances: [
        { substance: "Arsenic trioxide", casNumber: "1327-53-3", concentration: 0.002 }
      ],
      repairabilityScore: 4.0,
      endOfLifeInstructions: "Break glass safely. Remove base. Electronics must be handled as e-waste.",
      digitalLink: "https://dpp.novalighting.de/product/e9d45c8a-2a13-4d77-8f0e-fd1c6a5d5b09"
    }
  }
];

/* -------------------------------------------------------------------------- */
/*  Boucle principale                                                         */
/* -------------------------------------------------------------------------- */
async function mainLoop() {
  await sdk.init("postgresql://sdk:pide@localhost:5454/sdk-1?schema=public");
  for (; ;) {
    console.log(
      "\nActions : create | update | delete | get | check | batch-create | batch-update | batch-delete | history | history-all | history-stats | visibility | exit"
    );
    const action = (await ask("> ")).trim().toLowerCase();

    try {
      switch (action) {
        case "create": {
          const changedBy = await ask("Changed by (optional, press Enter for 'cli-user') : ");
          console.log(await sdk.createDppProduct(demoUniqueProduct, changedBy || 'cli-user'));
          break;
        }
        case "update": {
          const id = await ask("Product UID : ");
          const json = await ask("New metadata (JSON) : ");
          const info = JSON.parse(json);
          const changedBy = await ask("Changed by (optional, press Enter for 'cli-user') : ");
          console.log(await sdk.updateDppProduct(id, info, changedBy || 'cli-user'));
          break;
        }
        case "delete": {
          const id = await ask("Product UID : ");
          const confirm = await ask("Are you sure you want to delete this product? (yes/no) : ");
          if (confirm.toLowerCase() === 'yes') {
            const changedBy = await ask("Changed by (optional, press Enter for 'cli-user') : ");
            await sdk.deleteDppProduct(id, changedBy || 'cli-user');
            console.log("Product deleted successfully.");
          } else {
            console.log("Deletion cancelled.");
          }
          break;
        }
        case "get": {
          const id = await ask("Product UID : ");
          try {
            const completeProduct = await sdk.getDppProductById(id);
            console.log("\n Complete Product Data:");
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            console.log(JSON.stringify(completeProduct, null, 2));
            console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
            
            // Optionally save to file
            const saveToFile = await ask("\n Save to file? (y/N) : ");
            if (saveToFile.toLowerCase() === 'y' || saveToFile.toLowerCase() === 'yes') {
              const fs = await import('fs');
              const filename = `product_${id}_${new Date().toISOString().split('T')[0]}.json`;
              fs.writeFileSync(filename, JSON.stringify(completeProduct, null, 2));
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
          const changedBy = await ask("Changed by (optional, press Enter for 'cli-user') : ");
          console.log(await sdk.createBatchDppProducts(demoProducts, changedBy || 'cli-user'));
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
          const changedBy = await ask("Changed by (optional, press Enter for 'cli-user') : ");
          console.log(await sdk.updateBatchDppProducts(updated, changedBy || 'cli-user'));
          break;
        }
        case "batch-delete": {
          const ids = demoProducts.map(p => p.productUid);
          const confirm = await ask(`Are you sure you want to delete ${ids.length} demo products? (yes/no) : `);
          if (confirm.toLowerCase() === 'yes') {
            const changedBy = await ask("Changed by (optional, press Enter for 'cli-user') : ");
            await sdk.deleteBatchDppProducts(ids, changedBy || 'cli-user');
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
          console.log(`All Products History (Page ${page}/${result.totalPages}, Total: ${result.total}):`);
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
          let parseResult: { success: boolean; data?: any; error?: string } = { success: false };
          let attempts = 0;
          const maxAttempts = 3;
          
          do {
            attempts++;
            jsonData = await ask(` Enter JSON data (attempt ${attempts}/${maxAttempts}) : `);
            
            // Handle some common cases where users might forget quotes
            if (jsonData.trim() === 'cancel' || jsonData.trim() === 'exit') {
              console.log("Operation cancelled.");
              break;
            }
            
            if (jsonData.trim() === 'examples') {
              showVisibilityExamples(type);
              attempts--; // Don't count this as an attempt
              continue;
            }
            
            parseResult = validateAndParseJSON(jsonData);
            
            if (parseResult.success) {
              console.log(" Valid JSON parsed:");
              console.log(JSON.stringify(parseResult.data, null, 2));
              
              const confirmChoice = await ask("Continue with this data? (y/n) : ");
              if (confirmChoice.toLowerCase() === 'y') {
                try {
                  const result = await sdk.updateProductVisibility(type as "public" | "owner" | "brand", productId, parseResult.data);
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
                console.log(`\nTry again (${maxAttempts - attempts} attempts left)...\n`);
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
