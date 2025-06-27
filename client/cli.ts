import readline from "node:readline";
import { PublicKey } from "@solana/web3.js";
import { ProductInput, SafeoutSDK } from "./class_safeout";

/* -------------------------------------------------------------------------- */
/*  Instance SDK (adapté à ton réseau + clés)                                 */
/* -------------------------------------------------------------------------- */
const sdk = new SafeoutSDK(
  "Testnet",
  "sha256",
  new PublicKey("4PKQm5j3ksGgzCsEUQczPpysMtmJXzE5SLAPkL2sp2f1"),
  new PublicKey("9yMR6Ef1KzzSQxQaofu3JHfQ2cQEtpLjXPzxWAWCdRZ"),
  "postgresql://safeout:pide@localhost:4242/sdk-1?schema=public"
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
/*  Démo produits                                                             */
/* -------------------------------------------------------------------------- */
const demoProducts: ProductInput[] = [
  { productUid: "demo-001", info: { name: "T-Shirt Safeout", color: "black" } },
  { productUid: "demo-002", info: { name: "Sneakers Safeout", size: "42" } },
  { productUid: "demo-003", info: { name: "Backpack Safeout", capacity: "20 L" } },
];

/* -------------------------------------------------------------------------- */
/*  Boucle principale                                                         */
/* -------------------------------------------------------------------------- */
async function mainLoop() {
  for (; ;) {
    console.log(
      "\nActions : create | update | check | batch-create | batch-update | exit"
    );
    const action = (await ask("> ")).trim().toLowerCase();

    try {
      switch (action) {
        case "create": {
          const id = await ask("Product UID : ");
          const json = await ask("Metadata (JSON) : ");
          const info = JSON.parse(json);
          console.log(await sdk.createDppProduct({ productUid: id, info }));
          break;
        }
        case "update": {
          const id = await ask("Product UID : ");
          const json = await ask("New metadata (JSON) : ");
          const info = JSON.parse(json);
          console.log(await sdk.updateDppProduct({ productUid: id, info }));
          break;
        }
        case "check": {
          const id = await ask("Product UID : ");
          console.log(await sdk.checkAuthenticityOnBlockchain(id));
          break;
        }
        case "batch-create": {
          console.log(await sdk.createBatchDppProducts(demoProducts));
          break;
        }
        case "batch-update": {
          const updated = demoProducts.map((p, i) => ({
            productUid: p.productUid,
            info: {
              ...p.info,
            },
          }));
          console.log(await sdk.updateBatchDppProducts(updated));
          break;
        }
        case "exit":
          rl.close();
          return;
        default:
          console.log("Commande inconnue.");
      }
    } catch (err) {
      console.error("💥 Erreur :", err);
    }
  }
}

mainLoop();
